/**
 * redirect validation – same host only
 * No open redirect across hosts.
 */

import { isValidVimmUrl } from './hostValidation';

const VIMM_HOST = 'vimm.net';

export function isSameHostRedirect(fromUrl: string, toUrl: string): boolean {
  try {
    const from = new URL(fromUrl);
    const to = new URL(toUrl, from); // allow relative redirects resolving against from
    // both must be https and vimm.net
    if (from.protocol !== 'https:' || to.protocol !== 'https:') return false;
    if (from.hostname !== VIMM_HOST) return false;
    if (to.hostname !== VIMM_HOST) return false;
    return true;
  } catch {
    return false;
  }
}

export function validateRedirectChain(chain: string[]): { valid: boolean; violatingIndex?: number; reason?: string } {
  if (chain.length <= 1) return { valid: true };
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const cur = chain[i];
    if (!isSameHostRedirect(prev, cur)) {
      return { valid: false, violatingIndex: i, reason: `redirect from ${prev} to ${cur} crosses host/protocol` };
    }
    if (!isValidVimmUrl(cur) && !cur.startsWith('/vault')) {
      // relative /vault/... is okay if resolved same host
      // we already resolved in isSameHostRedirect, but double-check path
      try {
        const u = new URL(cur, prev);
        if (!u.pathname.startsWith('/vault')) {
          return { valid: false, violatingIndex: i, reason: `path must stay in /vault, got ${u.pathname}` };
        }
      } catch {
        return { valid: false, violatingIndex: i, reason: `invalid redirect url ${cur}` };
      }
    }
  }
  return { valid: true };
}

export function assertSameHostRedirect(from: string, to: string): void {
  if (!isSameHostRedirect(from, to)) {
    throw new Error(`Redirect blocked – cross-host or protocol change from ${from} to ${to} – only https://vimm.net same-host allowed`);
  }
}

export function resolveRedirectLocation(base: string, locationHeader: string): string | null {
  try {
    const baseUrl = new URL(base);
    const resolved = new URL(locationHeader, baseUrl).toString();
    if (!isSameHostRedirect(base, resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}
