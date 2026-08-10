/**
 * cache – in-memory + Tauri fs cache for discovery
 * Safety: All writes limited to %LOCALAPPDATA%\CrystalFrontend\cache\discovery\ via plugin-fs AppLocalData baseDir.
 * No writes outside approved tree. Validates paths.
 */

import type { DiscoveryResult, DiscoveryGameDetail, SearchCacheEntry, DetailCacheEntry } from './types';
import { DETAIL_TTL_MS, SEARCH_TTL_MS_DEFAULT } from './types';

const MEMORY_SEARCH = new Map<string, SearchCacheEntry>();
const MEMORY_DETAIL = new Map<string, DetailCacheEntry>();

function safeCacheKeyPart(s: string): string {
  // sanitize for filesystem – allow alphanumeric dash underscore
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

async function tauriFsWrite(key: string, data: string): Promise<boolean> {
  try {
    // Dynamic import – Tauri env only, optional peer
    const mod: any = await (0, eval)(`import('@tauri-apps/plugin-fs')`).catch(() => null);
    if (!mod) return false;

    const { writeTextFile, BaseDirectory, exists, mkdir } = mod;

    // Validate key – prevent traversal
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      // we use colon-separated keys, they shouldn't contain path separators beyond our mapping
      // For filesystem we map colon to folder
      // Additional validation: key must not contain traversal patterns
      return false;
    }

    // Further validation: ensure mapped relative path stays inside cache/discovery
    // Relative path: cache/discovery/<key>.json with sanitized subfolders
    const sanitized = key.replace(/:/g, '/');
    if (sanitized.includes('..')) return false;
    const relPath = `cache/discovery/${sanitized}.json`;

    // Validate no forbidden segments
    const lower = relPath.toLowerCase();
    if (lower.includes('emudeck') || lower.includes('es-de') || lower.includes('emulationstation')) return false;
    if (!lower.startsWith('cache/discovery/')) return false;

    // Ensure parent dir exists (best effort) – plugin-fs mkdir with baseDir
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
    } catch {
      // ignore mkdir failure – still try write
    }

    await writeTextFile(relPath, data, { baseDir: mod.BaseDirectory.AppLocalData });
    return true;
  } catch {
    return false;
  }
}

async function tauriFsRead(key: string): Promise<string | null> {
  try {
    // @ts-ignore optional peer
    const mod: any = await (0, eval)(`import('@tauri-apps/plugin-fs')`).catch(() => null);
    if (!mod) return null;
    const { readTextFile, BaseDirectory } = mod;
    const sanitized = key.replace(/:/g, '/');
    if (sanitized.includes('..')) return null;
    const relPath = `cache/discovery/${sanitized}.json`;
    if (!relPath.toLowerCase().startsWith('cache/discovery/')) return null;
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

  // memory first
  const mem = MEMORY_SEARCH.get(key);
  if (mem) {
    if (!isExpired(mem, now)) return mem.data;
    MEMORY_SEARCH.delete(key);
  }

  // tauri fs
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

  // localStorage fallback
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

  // async persisted best-effort – do not await failure
  try {
    const text = JSON.stringify(entry);
    const wrote = await tauriFsWrite(key, text);
    if (!wrote) {
      // fallback to localStorage
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
  // localStorage prune would be expensive – skipped (lazy expiry on get)
}

export function clearMemoryCache(): void {
  MEMORY_SEARCH.clear();
  MEMORY_DETAIL.clear();
}
