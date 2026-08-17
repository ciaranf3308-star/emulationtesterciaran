/**
 * vimmRoutes – URL building and validation for https://vimm.net/vault only
 * No arbitrary hosts. No open proxy.
 * LIVE VERIFIED 2026-08-10: search route requires q param; empty q returns 404 / unreliable.
 * Therefore builder rejects empty query – caller must not hit network for empty query.
 */

import { isValidVimmUrl as hostIsValid } from './hostValidation'

const VIMM_HOST = 'vimm.net';
const VAULT_ROOT = `https://${VIMM_HOST}/vault`;

export function buildVaultRoot(): string {
  return VAULT_ROOT;
}

export function buildBrowseUrl(systemToken: string, letter: string): string {
  const token = systemToken.trim();
  const bucket = letter.trim().toUpperCase();
  if (!token) throw new Error('Vimm system token required');
  if (bucket === 'FEATURED') {
    const url = `${VAULT_ROOT}/${encodeURIComponent(token)}`;
    if (!isValidVimmUrl(url)) throw new Error(`Built Vimm featured URL invalid: ${url}`);
    return url;
  }
  if (!/^(?:[A-Z]|#)$/.test(bucket)) throw new Error(`Invalid Vimm browse bucket '${letter}'`);
  const url = `${VAULT_ROOT}/${encodeURIComponent(token)}/${encodeURIComponent(bucket)}`;
  if (!isValidVimmUrl(url)) throw new Error(`Built Vimm browse URL invalid: ${url}`);
  return url;
}

export function isValidVimmUrl(urlStr: string): boolean {
  try { return hostIsValid(urlStr) } catch { return false }
}

/**
 * Build Vimm search URL.
 * @param systemToken – exact Vimm token (e.g. PS2, PS1, 3DS, GameCube)
 * @param query – non-empty search term
 * @throws if query empty – empty query must NOT trigger network request per V8.4.1 hardening
 */
export function buildSearchUrl(systemToken: string, query: string): string {
  const token = systemToken.trim();
  if (!token) throw new Error('Vimm system token required');
  const q = query.trim();
  if (q.length === 0) {
    throw new Error('Empty query – no network request should be made – use browse route separately (/vault/{SYSTEM}/{LETTER})');
  }
  // Vimm route: /vault/?p=list&system=XXX&q=YYY
  const base = `${VAULT_ROOT}/`;
  const systemParam = `system=${encodeURIComponent(token)}`;
  const listParam = `p=list`;
  const qParam = `q=${encodeURIComponent(q)}`;
  const url = `${base}?${listParam}&${systemParam}&${qParam}`;
  if (!isValidVimmUrl(url)) throw new Error(`Built Vimm search URL invalid: ${url}`);
  return url;
}

export function buildAdvSearchUrl(systemToken: string, query: string, options?: { sort?: string }): string {
  // delegates – will throw on empty query as well
  const base = buildSearchUrl(systemToken, query);
  if (options?.sort) {
    try {
      const u = new URL(base);
      u.searchParams.set('sort', options.sort);
      const out = u.toString();
      if (!isValidVimmUrl(out)) throw new Error('Adv URL validation failed');
      return out;
    } catch {
      return base;
    }
  }
  return base;
}

export function buildDetailUrl(numericId: string): string {
  const id = numericId.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`Vimm detail id must be numeric, got '${numericId}'`);
  }
  const url = `${VAULT_ROOT}/${encodeURIComponent(id)}`;
  if (!isValidVimmUrl(url)) throw new Error(`Built Vimm detail URL invalid: ${url}`);
  return url;
}

export function parseIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== VIMM_HOST) return null;
    const m = u.pathname.match(/\/vault\/(\d+)/);
    if (m && m[1]) return m[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;
    return null;
  } catch {
    const m2 = url.match(/\/vault\/(\d+)/);
    if (m2 && m2[1]) return m2[1];
    return null;
  }
}
