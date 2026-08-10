/**
 * cache – in-memory + Tauri fs cache for discovery
 * Safety: All writes limited to %LOCALAPPDATA%\CrystalFrontend\cache\discovery\ via plugin-fs AppLocalData baseDir.
 * No writes outside approved tree. Validates paths.
 * TTL: search 20m, detail 24h – persistent across restart via Tauri fs.
 */

import type { DiscoveryResult, DiscoveryGameDetail, SearchCacheEntry, DetailCacheEntry } from './types';
import { DETAIL_TTL_MS, SEARCH_TTL_MS_DEFAULT } from './types';

const MEMORY_SEARCH = new Map<string, SearchCacheEntry>();
const MEMORY_DETAIL = new Map<string, DetailCacheEntry>();

function safeCacheKeyPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 80) || 'none';
}

export function getSearchCacheKey(provider: string, systemId: string, query: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80) || '__empty__';
  return `${safeCacheKeyPart(provider)}:${safeCacheKeyPart(systemId)}:${safeCacheKeyPart(q)}`;
}

export function getDetailCacheKey(provider: string, detailId: string): string {
  return `${safeCacheKeyPart(provider)}:detail:${safeCacheKeyPart(detailId)}`;
}

function isExpired(entry: { timestamp: number; ttlMs: number }, now = Date.now()): boolean {
  return now - entry.timestamp >= entry.ttlMs;
}

// LocalStorage helpers – fallback when not Tauri
function lsGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(`crystal_discovery_${key}`);
  } catch {}
  return null;
}
function lsSet(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(`crystal_discovery_${key}`, value);
  } catch {}
}
function lsRemove(key: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(`crystal_discovery_${key}`);
  } catch {}
}

type FsModule = {
  writeTextFile: (path: string, data: string, opts: { baseDir: any }) => Promise<void>;
  readTextFile: (path: string, opts: { baseDir: any }) => Promise<string>;
  exists: (path: string, opts: { baseDir: any }) => Promise<boolean>;
  mkdir: (path: string, opts: { baseDir: any; recursive?: boolean }) => Promise<void>;
  BaseDirectory: any;
};

async function getFsModule(): Promise<FsModule | null> {
  try {
    // Proper dynamic import – works when @tauri-apps/plugin-fs is installed (Tauri v2)
    // In browser dev (no Tauri) this will reject and we fall back to localStorage.
    const mod = await import('@tauri-apps/plugin-fs');
    return mod as unknown as FsModule;
  } catch {
    return null;
  }
}

function isSafeRelPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  // Must start with exact approved prefix
  if (!lower.startsWith('cache/discovery/')) return false;
  // Reject traversal
  if (lower.includes('..')) return false;
  // Reject sibling / external markers
  if (lower.includes('emudeck') || lower.includes('es-de') || lower.includes('emulationstation')) return false;
  if (lower.includes('roms') && !lower.includes('crystalfrontend')) {
    // Disallow roms folder reference outside our tree – extra safety
    // Our approved path never contains roms, so reject any containing roms segment
    return false;
  }
  // Reject absolute-looking
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return false;
  if (relPath.includes(':')) return false; // no drive prefix in relative
  return true;
}

async function tauriFsWrite(key: string, data: string): Promise<boolean> {
  try {
    const fsMod = await getFsModule();
    if (!fsMod) return false;

    const { writeTextFile, BaseDirectory, exists, mkdir } = fsMod;

    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      return false;
    }

    const sanitized = key.replace(/:/g, '/');
    if (sanitized.includes('..')) return false;
    const relPath = `cache/discovery/${sanitized}.json`;

    if (!isSafeRelPath(relPath)) return false;

    try {
      if (typeof exists === 'function' && typeof mkdir === 'function') {
        const dirPart = relPath.slice(0, relPath.lastIndexOf('/'));
        if (dirPart) {
          const dirExists = await exists(dirPart, { baseDir: BaseDirectory.AppLocalData }).catch(() => false);
          if (!dirExists) {
            await mkdir(dirPart, { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
          }
        }
      }
    } catch {}

    await writeTextFile(relPath, data, { baseDir: BaseDirectory.AppLocalData });
    return true;
  } catch {
    return false;
  }
}

async function tauriFsRead(key: string): Promise<string | null> {
  try {
    const fsMod = await getFsModule();
    if (!fsMod) return null;
    const { readTextFile, BaseDirectory } = fsMod;
    const sanitized = key.replace(/:/g, '/');
    if (sanitized.includes('..')) return null;
    const relPath = `cache/discovery/${sanitized}.json`;
    if (!isSafeRelPath(relPath)) return null;
    const content = await readTextFile(relPath, { baseDir: BaseDirectory.AppLocalData });
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

export async function getCachedSearch(
  provider: string,
  systemId: string,
  query: string
): Promise<DiscoveryResult[] | null> {
  const key = getSearchCacheKey(provider, systemId, query);
  const now = Date.now();

  const mem = MEMORY_SEARCH.get(key);
  if (mem) {
    if (!isExpired(mem, now)) return mem.data;
    MEMORY_SEARCH.delete(key);
  }

  const fsText = await tauriFsRead(key);
  if (fsText) {
    try {
      const parsed = JSON.parse(fsText) as SearchCacheEntry;
      if (parsed && Array.isArray(parsed.data) && typeof parsed.timestamp === 'number') {
        if (!isExpired(parsed, now)) {
          MEMORY_SEARCH.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {}
  }

  const ls = lsGet(key);
  if (ls) {
    try {
      const parsed = JSON.parse(ls) as SearchCacheEntry;
      if (parsed && !isExpired(parsed, now)) {
        MEMORY_SEARCH.set(key, parsed);
        return parsed.data;
      } else {
        lsRemove(key);
      }
    } catch {}
  }

  return null;
}

export async function setCachedSearch(
  provider: string,
  systemId: string,
  query: string,
  results: DiscoveryResult[],
  ttlMs: number = SEARCH_TTL_MS_DEFAULT
): Promise<void> {
  const key = getSearchCacheKey(provider, systemId, query);
  const entry: SearchCacheEntry = {
    provider,
    systemId,
    query,
    data: results,
    timestamp: Date.now(),
    ttlMs,
  };
  MEMORY_SEARCH.set(key, entry);

  try {
    const text = JSON.stringify(entry);
    const wrote = await tauriFsWrite(key, text);
    if (!wrote) {
      lsSet(key, text);
    }
  } catch {
    try {
      lsSet(key, JSON.stringify(entry));
    } catch {}
  }
}

export async function getCachedDetail(
  provider: string,
  detailId: string
): Promise<DiscoveryGameDetail | null> {
  const key = getDetailCacheKey(provider, detailId);
  const now = Date.now();

  const mem = MEMORY_DETAIL.get(key);
  if (mem) {
    if (!isExpired(mem, now)) return mem.data;
    MEMORY_DETAIL.delete(key);
  }

  const fsText = await tauriFsRead(key);
  if (fsText) {
    try {
      const parsed = JSON.parse(fsText) as DetailCacheEntry;
      if (parsed && parsed.data && typeof parsed.timestamp === 'number') {
        if (!isExpired(parsed, now)) {
          MEMORY_DETAIL.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {}
  }

  const ls = lsGet(key);
  if (ls) {
    try {
      const parsed = JSON.parse(ls) as DetailCacheEntry;
      if (parsed && !isExpired(parsed, now)) {
        MEMORY_DETAIL.set(key, parsed);
        return parsed.data;
      } else lsRemove(key);
    } catch {}
  }

  return null;
}

export async function setCachedDetail(
  provider: string,
  detailId: string,
  detail: DiscoveryGameDetail,
  ttlMs: number = DETAIL_TTL_MS
): Promise<void> {
  const key = getDetailCacheKey(provider, detailId);
  const entry: DetailCacheEntry = {
    provider,
    detailId,
    systemId: detail.systemId,
    data: detail,
    timestamp: Date.now(),
    ttlMs,
  };
  MEMORY_DETAIL.set(key, entry);
  try {
    const text = JSON.stringify(entry);
    const wrote = await tauriFsWrite(key, text);
    if (!wrote) lsSet(key, text);
  } catch {
    try {
      lsSet(key, JSON.stringify(entry));
    } catch {}
  }
}

export function prune(): void {
  const now = Date.now();
  for (const [k, v] of MEMORY_SEARCH) if (isExpired(v, now)) MEMORY_SEARCH.delete(k);
  for (const [k, v] of MEMORY_DETAIL) if (isExpired(v, now)) MEMORY_DETAIL.delete(k);
}

export function clearMemoryCache(): void {
  MEMORY_SEARCH.clear();
  MEMORY_DETAIL.clear();
}

export function isSafeCachePath(relPath: string): boolean {
  return isSafeRelPath(relPath);
}
