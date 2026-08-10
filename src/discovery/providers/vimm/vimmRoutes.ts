/**
 * vimmRoutes – URL building and validation for https://vimm.net/vault only
 * No arbitrary hosts. No open proxy.
 */

import { isValidVimmUrl as hostIsValid } from './hostValidation'

const VIMM_HOST = 'vimm.net';
const VAULT_ROOT = `https://${VIMM_HOST}/vault`;

export function buildVaultRoot(): string {
  return VAULT_ROOT;
}

export function isValidVimmUrl(urlStr: string): boolean {
  // Delegate to canonical hostValidation single source of truth; if that changes, this follows
  try { return hostIsValid(urlStr) } catch { return false }
}

export function buildSearchUrl(systemToken: string, query: string): string {
  const token = systemToken.trim();
  const q = query.trim();
  // encode token & query safely, but preserve empty query handling (list all for system)
  // Vimm route: /vault/?p=list&system=XXX&q=YYY
  // When query empty, omit q or send empty? Send without q to avoid weird server behaviour.
  const base = `${VAULT_ROOT}/`;
  const systemParam = `system=${encodeURIComponent(token)}`;
  const listParam = `p=list`;
  if (q.length === 0) {
    const url = `${base}?${listParam}&${systemParam}`;
    if (!isValidVimmUrl(url)) throw new Error(`Built Vimm search URL invalid: ${url}`);
    return url;
  }
  const qParam = `q=${encodeURIComponent(q)}`;
  const url = `${base}?${listParam}&${systemParam}&${qParam}`;
  if (!isValidVimmUrl(url)) throw new Error(`Built Vimm search URL invalid: ${url}`);
  return url;
}

export function buildAdvSearchUrl(systemToken: string, query: string, options?: { sort?: string }): string {
  // optional advanced mode – currently mirrors basic but documents slot for future
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
    // expect /vault/{numeric}
    const m = u.pathname.match(/\/vault\/(\d+)/);
    if (m && m[1]) return m[1];
    // also accept ? id= param fallback
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;
    return null;
  } catch {
    // also handle relative /vault/123
    const m2 = url.match(/\/vault\/(\d+)/);
    if (m2 && m2[1]) return m2[1];
    return null;
  }
}
