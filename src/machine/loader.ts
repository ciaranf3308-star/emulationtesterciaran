/**
 * Loader for MachineConfig – Node/Tauri desktop mode + JSON overload.
 * Avoids hardcoding C:\Emulation defaults.
 * Exports required by spec:
 *  - loadMachineConfigFromPath(path: string): Promise<MachineConfig>
 *  - loadMachineConfigFromJson(json: unknown): MachineConfig (sync, throws on invalid)
 *
 * Also provides compatibility exports for existing providers:
 *  - loadExampleMachineConfig / loadMachineConfigExampleDev
 *  - isExampleConfig
 *  - loadMachineConfigWithFallback
 */
import type { MachineConfig, ValidationError } from './types';
import { validateMachineConfig } from './validation';
import { isMachineConfig } from './schema';

export class MachineConfigLoadError extends Error {
  public readonly validationErrors: ValidationError[];
  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'MachineConfigLoadError';
    this.validationErrors = errors;
  }
}

/** Synchronous JSON overload – throws MachineConfigLoadError if invalid */
export function loadMachineConfigFromJson(json: unknown): MachineConfig {
  let parsed: unknown = json;
  if (typeof json === 'string') {
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new MachineConfigLoadError(`Invalid JSON: ${(e as Error).message}`, [
        { path: '$', message: `JSON parse error: ${(e as Error).message}` },
      ]);
    }
  }

  if (isMachineConfig(parsed)) {
    const detailed = validateMachineConfig(parsed);
    if (!detailed.ok) {
      const errs = (detailed as { ok: false; errors: ValidationError[] }).errors;
      const msg = `MachineConfig validation failed (${errs.length} errors): ${errs
        .slice(0, 5)
        .map((err) => `${err.path} ${err.message}`)
        .join('; ')}${errs.length > 5 ? ` (+${errs.length - 5} more)` : ''}`;
      throw new MachineConfigLoadError(msg, errs);
    }
    return (detailed as { ok: true; config: MachineConfig }).config;
  }

  const result = validateMachineConfig(parsed);
  if (!result.ok) {
    const errs2 = (result as { ok: false; errors: ValidationError[] }).errors;
    const msg = `MachineConfig validation failed (${errs2.length} errors): ${errs2
      .slice(0, 5)
      .map((e) => `${e.path} ${e.message}`)
      .join('; ')}${errs2.length > 5 ? ` (+${errs2.length - 5} more)` : ''}`;
    throw new MachineConfigLoadError(msg, errs2);
  }
  return (result as { ok: true; config: MachineConfig }).config;
}

/**
 * Async file loader for Node/Tauri.
 * Reads file via dynamic Node fs import to stay bundler-safe for browser.
 */
export async function loadMachineConfigFromPath(path: string): Promise<MachineConfig> {
  if (!path || typeof path !== 'string') {
    throw new MachineConfigLoadError('Path must be non-empty string', [
      { path: '$.path', message: 'path argument required' },
    ]);
  }

  let fileContent: string;
  try {
    // @ts-ignore – node types may not be in tsconfig.app.json (vite/client), runtime available
    const fs = await import('node:fs/promises') as unknown as { readFile: (p: string, enc: string) => Promise<string> };
    fileContent = await fs.readFile(path, 'utf8');
  } catch (e) {
    // Try Tauri plugin in webview
    try {
      // @ts-ignore optional peer dep
      const mod = await import('@tauri-apps/plugin-fs') as unknown as { readTextFile: (p: string) => Promise<string> };
      if (typeof mod.readTextFile === 'function') {
        fileContent = await mod.readTextFile(path);
      } else {
        throw e;
      }
    } catch {
      throw new MachineConfigLoadError(`Failed to read file "${path}": ${(e as Error).message}`, [
        { path, message: (e as Error).message },
      ]);
    }
  }

  return loadMachineConfigFromJson(fileContent);
}

/**
 * Browser dev-mode helper: loads sanitized example if present at
 * config/machine-config.example.json – to be created elsewhere.
 * Returns null if not available rather than throwing.
 */
export async function loadMachineConfigExampleDev(): Promise<MachineConfig | null> {
  const candidates = [
    '/config/machine-config.example.json',
    './config/machine-config.example.json',
    '/machine-config.example.json',
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      const result = validateMachineConfig(json);
      if (result.ok) return result.config;
    } catch {
      // ignore and continue
    }
  }
  return null;
}

/** Compatibility alias – provider expects this name */
export const loadExampleMachineConfig = async (): Promise<MachineConfig> => {
  const cfg = await loadMachineConfigExampleDev();
  if (cfg) return cfg;
  throw new MachineConfigLoadError(
    'No sanitized example config found at /config/machine-config.example.json',
    [{ path: 'config/machine-config.example.json', message: 'not found' }],
  );
};

/** Legacy alias */
export const loadMachineConfigExample = loadExampleMachineConfig;

export function isExampleConfig(cfg: MachineConfig): boolean {
  const maybe = cfg as unknown as Record<string, unknown>;
  const devFlag = maybe['_devFlag'];
  const note = maybe['_note'];
  if (devFlag === 'exampleData') return true;
  if (typeof note === 'string' && note.toLowerCase().includes('sanitized example')) return true;
  if (typeof note === 'string' && note.toLowerCase().includes('example')) return true;
  if (!cfg.authoritativeFiles || Object.keys(cfg.authoritativeFiles).length === 0) return true;
  return false;
}

export async function loadMachineConfigWithFallback(primaryPath?: string): Promise<MachineConfig> {
  if (primaryPath) {
    try {
      return await loadMachineConfigFromPath(primaryPath);
    } catch {
      // fall through
    }
  }
  const dev = await loadMachineConfigExampleDev();
  if (dev) return dev;
  throw new MachineConfigLoadError(
    'No MachineConfig source available – provide primaryPath or supply example at config/machine-config.example.json',
    [{ path: '$', message: 'no source' }],
  );
}
