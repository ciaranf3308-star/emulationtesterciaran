/**
 * RomsFunProvider – implements CatalogProvider id='romsfun'
 * Safety: strict host validation romsfun.com / www.romsfun.com, no arbitrary fetch,
 * no credentials, no custom ports, no arbitrary caller URLs, no download URL extraction
 * Supports all Crystal systems (D1 allows any non-empty systemId except maybe steam? we support all)
 * Build canonical detail URL strict https/no port/no creds, slug validation no traversal/UNC
 * Search/detail parsing metadata only, Vimm dormant, Discover default provider now romsfun
 */

import type { CatalogProvider } from '../../catalogProvider';
import type { DiscoveryResult, DiscoveryGameDetail } from '../../types';
import { isTauriEnvironment } from '../../../runtime/environment';
import { buildCanonicalDetailUrl, buildCanonicalSearchUrl, ROMSFUN_SYSTEM_SLUGS } from './romsfunRoutes';
import { parseRomsFunSearch } from './parseRomsfunSearch';
import { parseRomsFunDetail } from './parseRomsfunDetail';
import { isAllowedRomsFunHost } from './hostValidation';

const PROVIDER_ID = 'romsfun';
const PROVIDER_NAME = 'ROMsFun';
const MIN_SPACING_MS = 750;
const TIMEOUT_MS = 10_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function tauriFetchRomsFun(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error(`Only https allowed, got ${u.protocol}`);
    if (!isAllowedRomsFunHost(u.hostname)) throw new Error(`Host must be romsfun.com or www.romsfun.com, got ${u.hostname}`);
    if (u.port && u.port !== '' && u.port !== '443') throw new Error(`Custom port ${u.port} not allowed`);
    if (u.username || u.password) throw new Error('Credentials not allowed');
  } catch (e) {
    throw new Error(`ROMsFun URL validation failed: ${(e as Error).message}`);
  }

  if (!isTauriEnvironment()) {
    throw new Error('Tauri environment required for ROMsFun fetch');
  }

  let invokeFn: any;
  try {
    const api = await import('@tauri-apps/api/core');
    invokeFn = (api as any).invoke;
  } catch {
    if (typeof window !== 'undefined') {
      const w = window as any;
      invokeFn = w.__TAURI__?.core?.invoke || w.__TAURI__?.invoke || w.__TAURI_INVOKE__;
    }
  }
  if (typeof invokeFn !== 'function') throw new Error('Tauri invoke not available');

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`ROMsFun fetch timeout ${TIMEOUT_MS}ms for ${url}`));
      }
    }, TIMEOUT_MS);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    Promise.resolve(invokeFn('fetch_romsfun', { url }))
      .then(result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (typeof result !== 'string') reject(new Error('fetch_romsfun returned non-string'));
        else resolve(result);
      })
      .catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(new Error(typeof err === 'string' ? err : (err?.message || String(err))));
      });
  });
}

export class RomsFunProvider implements CatalogProvider {
  id = PROVIDER_ID;
  name = PROVIDER_NAME;

  private lastFetchMs = 0;

  supportsSystem(_systemId: string): boolean {
    // D1: support any non-empty systemId – ROMsFun has broad catalog
    if (!_systemId || typeof _systemId !== 'string') return false;
    return !!ROMSFUN_SYSTEM_SLUGS[_systemId.trim().toLowerCase()];
  }

  buildExternalUrl(id: string): string {
    // id is slug – canonical detail URL via strict builder
    return buildCanonicalDetailUrl(id);
  }

  private async enforceSpacing(signal?: AbortSignal) {
    const now = Date.now();
    const elapsed = now - this.lastFetchMs;
    if (elapsed < MIN_SPACING_MS) await sleep(MIN_SPACING_MS - elapsed, signal);
  }

  async search(systemId: string, query: string, opts?: { signal?: AbortSignal }): Promise<DiscoveryResult[]> {
    if (!this.supportsSystem(systemId)) {
      throw new Error(`System '${systemId}' unsupported for provider '${PROVIDER_ID}'`);
    }
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!query || query.trim().length === 0) return [];

    // Strict Tauri requirement – browser CORS blocked, matches VimmProvider behavior
    // Deterministic fixture ONLY via discovery shim ?fixture=golden, NOT direct provider
    // Keeps H1.1 strict fixture gate authoritative – prevents synthetic leak outside exact gate
    if (!isTauriEnvironment()) {
      throw new Error('Tauri environment required for ROMsFun fetch – isTauriEnvironment() false (browser CORS blocked, strict gate via ?fixture=golden only)');
    }

    await this.enforceSpacing(opts?.signal);
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const token = systemId.trim().toLowerCase();
    const url = buildCanonicalSearchUrl(token, query);

    try {
      const html = await tauriFetchRomsFun(url, opts?.signal);
      this.lastFetchMs = Date.now();
      if (opts?.signal?.aborted) throw new DOMException('Aborted after fetch', 'AbortError');
      const parsed = parseRomsFunSearch(html, systemId, token);
      // If parser returns empty (live site changed / Cloudflare), fallback to fixture for continuity but still indicate via empty? For D1 we fallback to fixture only in non-Tauri, not in Tauri – but for robustness return parsed even if empty to respect live truth.
      return parsed;
    } catch (e: any) {
      // If live fetch fails (Cloudflare block etc), throw to allow UI to show error rather than silent fixture in Tauri mode
      // For deterministic tests offline, this will be caught and fixture path already taken above
      throw e;
    }
  }

  async getDetail(id: string, systemId?: string): Promise<DiscoveryGameDetail> {
    if (!id || typeof id !== 'string') throw new Error(`ROMsFun detail id/slug must be non-empty, got '${id}'`);
    // Slug validation delegated to buildCanonical
    let canonical: string;
    try {
      canonical = buildCanonicalDetailUrl(id);
    } catch (e) {
      throw new Error(`Invalid ROMsFun slug "${id}": ${(e as Error).message}`);
    }

    if (!isTauriEnvironment()) {
      throw new Error('Tauri environment required for ROMsFun detail – browser blocked, use shim ?fixture=golden');
    }

    await this.enforceSpacing();
    const html = await tauriFetchRomsFun(canonical);
    this.lastFetchMs = Date.now();
    try {
      const detail = parseRomsFunDetail(html, id, systemId);
      return detail;
    } catch (e: any) {
      if (e?.provider) throw e;
      throw new Error(`ROMsFun detail parse failed for id ${id}: ${e?.message || String(e)}`);
    }
  }
}

export const romsfunProvider = new RomsFunProvider();
