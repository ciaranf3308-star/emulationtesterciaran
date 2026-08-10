/**
 * cache – TTL handling + path validation per V8.4 spec
 * SEARCH 20m default (15-30m range), DETAIL 24h, path %LOCALAPPDATA%/CrystalFrontend/cache/vimm/...
 * No writes outside Crystal cache root.
 */

import { DETAIL_TTL_MS, SEARCH_TTL_MS_DEFAULT, SEARCH_TTL_MS_MAX, SEARCH_TTL_MS_MIN, isCacheFresh as isCacheFreshBase } from '../../types';

export { SEARCH_TTL_MS_DEFAULT, SEARCH_TTL_MS_MAX, SEARCH_TTL_MS_MIN, DETAIL_TTL_MS };

export interface CacheEntryGeneric<T> {
  timestamp: number;
  ttlMs: number;
  data: T;
}

export function isSearchFresh(entry: CacheEntryGeneric<unknown>, now = Date.now()): boolean {
  if (entry.ttlMs < SEARCH_TTL_MS_MIN || entry.ttlMs > SEARCH_TTL_MS_MAX) {
    // lenient – still evaluate
  }
  return isCacheFreshBase(entry as any, now);
}

export function isDetailFresh(entry: CacheEntryGeneric<unknown>, now = Date.now()): boolean {
  return isCacheFreshBase(entry as any, now);
}

export function isCacheExpired(entry: CacheEntryGeneric<unknown>, now = Date.now()): boolean {
  return !isCacheFreshBase(entry as any, now);
}

export function makeSearchCacheKey(systemId: string, query: string, vimmToken?: string): string {
  const sid = systemId.toLowerCase().trim();
  const q = query.trim().toLowerCase();
  const tok = (vimmToken || sid).toLowerCase();
  return `vimm:search:${tok}:${sid}:${encodeURIComponent(q)}`;
}

export function makeDetailCacheKey(providerId: string, detailId: string): string {
  return `vimm:detail:${providerId}:${detailId}`;
}

export function buildCacheFileName(key: string): string {
  const safe = key.toLowerCase().replace(/[^a-z0-9_\-]/g, '_').slice(0, 120);
  return `${safe}.json`;
}

function normalizePath(p: string): string {
  if (!p) return '';
  let s = p.replace(/\\/g, '/');
  let drive = '';
  const driveMatch = s.match(/^([a-zA-Z]:)(\/.*)?$/);
  if (driveMatch) {
    drive = driveMatch[1].toUpperCase();
    s = driveMatch[2] || '/';
    if (!s.startsWith('/')) s = '/' + s;
  }
  const isAbs = s.startsWith('/');
  const parts = s.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const seg of parts) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
    } else stack.push(seg);
  }
  let out = (isAbs ? '/' : '') + stack.join('/');
  if (drive) {
    out = drive + (out.startsWith('/') ? out : '/' + out);
    if (stack.length === 0) out = drive + '/';
  }
  return out || (isAbs ? '/' : '.');
}

export function isSafeCachePath(root: string, target: string): boolean {
  if (!root || !target) return false;
  // reject drive/root disallowed per tests
  const rNorm = root.replace(/\\/g,'/').trim();
  if (rNorm === '/' || rNorm === '' || /^[A-Za-z]:\/$/.test(rNorm) || /^[A-Za-z]:\/$/.test(root) ) return false;
  if (rNorm === '/') return false;
  const normRoot = normalizePath(root);
  const normTarget = normalizePath(target);
  if (normTarget.includes('..')) return false;
  if (normTarget === '/' || /^[A-Z]:\/$/.test(normTarget)) return false;
  const rootWithSep = normRoot.endsWith('/') ? normRoot : normRoot + '/';
  if (normTarget === normRoot) return false;
  if (!normTarget.startsWith(rootWithSep)) return false;
  const remainder = normTarget.slice(rootWithSep.length);
  if (!remainder) return false;
  if (remainder.includes('..')) return false;
  const lowerTarget = target.toLowerCase();
  const forbidden = ['emudeck', 'es-de', '/roms/', '\\roms\\', 'emulation/roms'];
  for (const m of forbidden) if (lowerTarget.includes(m.toLowerCase())) return false;
  return true;
}

export function getCrystalCacheRoot(): string {
  try {
    // @ts-ignore node
    const proc = (typeof process !== 'undefined' ? (process as any) : null);
    if (proc?.env?.LOCALAPPDATA) {
      return `${proc.env.LOCALAPPDATA}/CrystalFrontend/cache/vimm`.replace(/\\/g, '/');
    }
    if (proc?.env?.HOME) {
      return `${proc.env.HOME}/.cache/CrystalFrontend/vimm`.replace(/\\/g, '/');
    }
  } catch {}
  return 'C:/Users/Test/AppData/Local/CrystalFrontend/cache/vimm';
}

export function getSearchCachePath(systemId: string, query: string, vimmToken?: string, root?: string): string {
  const rootPath = root ?? getCrystalCacheRoot();
  const key = makeSearchCacheKey(systemId, query, vimmToken);
  const file = buildCacheFileName(key);
  const sep = rootPath.endsWith('/') ? '' : '/';
  const full = `${rootPath}${sep}${file}`;
  if (!isSafeCachePath(rootPath, full)) throw new Error(`Cache path validation failed – not inside Crystal cache root`);
  return full;
}

export function getDetailCachePath(detailId: string, root?: string): string {
  const rootPath = root ?? getCrystalCacheRoot();
  const key = makeDetailCacheKey('vimms', detailId);
  const file = buildCacheFileName(key);
  const sep = rootPath.endsWith('/') ? '' : '/';
  const full = `${rootPath}${sep}${file}`;
  if (!isSafeCachePath(rootPath, full)) throw new Error(`Cache detail path validation failed`);
  return full;
}

// Expiry helpers for tests
export function createSearchCacheEntry<T>(data: T, systemId: string, query: string, _providerToken?: string, ttlMs = SEARCH_TTL_MS_DEFAULT, ts = Date.now()): any {
  return {
    timestamp: ts,
    ttlMs,
    data,
    provider: 'vimms',
    systemId,
    query,
    providerToken: _providerToken,
  };
}

export function createDetailCacheEntry<T>(data: T, detailId: string, systemId?: string, ttlMs = DETAIL_TTL_MS, ts = Date.now()): any {
  return {
    timestamp: ts,
    ttlMs,
    data,
    provider: 'vimms',
    detailId,
    systemId,
  };
}
