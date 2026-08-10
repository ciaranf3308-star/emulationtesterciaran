/**
 * cache – in-memory + Tauri-backed cache for discovery
 * V8.4.1 FINAL FIX: Discovery persistence MUST use existing Crystal write root
 *   %LOCALAPPDATA%\CrystalFrontend\cache\discovery\
 * NOT BaseDirectory.AppLocalData (which resolves to com.crystal.frontend / AppLocalData id).
 * Rust safety architecture enforces this via crystal_writable_root + resolve_writable_path.
 *
 * Frontend now talks to narrowly scoped Tauri commands:
 *   discovery_cache_read(key) -> Option<String>
 *   discovery_cache_write(key, content)
 * which internally guard to CrystalFrontend/cache/discovery only.
 * No generic arbitrary fs command is introduced, no V8.1 weakening.
 *
 * Falls back to localStorage when not in Tauri (browser dev / tests).
 */

import type { DiscoveryResult, DiscoveryGameDetail, SearchCacheEntry, DetailCacheEntry } from './types';
import { DETAIL_TTL_MS, SEARCH_TTL_MS_DEFAULT } from './types';
import { getTauriInvoker } from '../runtime/tauri';
import { isTauriEnvironment } from '../runtime/environment';

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

// ---------- Safe rel-path validation ----------
// Mirrors Rust discovery_relative_path + safety expectations.

export function getExpectedRelPath(key: string): string | null {
  // key is colon-delimited e.g. "vimms:ps2:mario"
  if (!key || typeof key !== 'string') return null;
  if (key.length > 200) return null;
  if (key.includes('..') || key.includes('/') || key.includes('\\')) return null;
  if (!/^[A-Za-z0-9_\-:.]+$/.test(key)) return null;
  const segs = key.split(':');
  if (segs.some(s => s.length === 0)) return null;
  if (segs.length < 2 || segs.length > 3) return null;
  const sanitized = key.replace(/:/g, '/');
  return `cache/discovery/${sanitized}.json`;
}

function isSafeRelPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  if (!lower.startsWith('cache/discovery/')) return false;
  if (lower.includes('..')) return false;
  if (lower.includes('emudeck') || lower.includes('es-de') || lower.includes('emulationstation')) return false;
  if (lower.includes('roms') && !lower.includes('crystalfrontend')) return false;
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return false;
  if (relPath.includes(':')) return false;
  // Must be under cache/discovery/ with .json suffix (our scheme)
  if (!relPath.endsWith('.json')) return false;
  return true;
}

// ---------- Tauri narrow-scoped cache via safety-guarded commands ----------

async function tauriCacheWrite(key: string, data: string): Promise<boolean> {
  try {
    if (!isTauriEnvironment()) return false;
    const inv = await getTauriInvoker();
    if (!inv) return false;

    // Validate rel path locally before sending – defense-in-depth, ensures we never ask outside root
    const rel = getExpectedRelPath(key);
    if (!rel) return false;
    if (!isSafeRelPath(rel)) return false;

    // invoke Rust command discovery_cache_write(key, content)
    await inv<void>('discovery_cache_write', { key, content: data });
    return true;
  } catch {
    return false;
  }
}

async function tauriCacheRead(key: string): Promise<string | null> {
  try {
    if (!isTauriEnvironment()) return null;
    const inv = await getTauriInvoker();
    if (!inv) return null;

    const rel = getExpectedRelPath(key);
    if (!rel) return null;
    if (!isSafeRelPath(rel)) return null;

    // Rust returns Option<String> – Tauri maps None → null / undefined
    const res = await inv<string | null>('discovery_cache_read', { key });
    if (res == null) return null;
    return typeof res === 'string' ? res : null;
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

  const tauriText = await tauriCacheRead(key);
  if (tauriText) {
    try {
      const parsed = JSON.parse(tauriText) as SearchCacheEntry;
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
    const wrote = await tauriCacheWrite(key, text);
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

  const tauriText = await tauriCacheRead(key);
  if (tauriText) {
    try {
      const parsed = JSON.parse(tauriText) as DetailCacheEntry;
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
    const wrote = await tauriCacheWrite(key, text);
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

// Export helpers for testing regression
export const __test__ = {
  getExpectedRelPath,
  isSafeRelPath,
};
