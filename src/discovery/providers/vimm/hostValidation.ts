/**
 * hostValidation – ensure only https://vimm.net allowed, reject arbitrary, reject http, reject other hosts
 */

const VIMM_HOST = 'vimm.net';
const ALLOWED_HOSTS_SET = new Set<string>(['vimm.net' /* strict per spec – could also allow www.vimm.net but spec says only https://vimm.net/ allowed */]);

export function isAllowedHost(hostname: string): boolean {
  if (!hostname) return false;
  return ALLOWED_HOSTS_SET.has(hostname.toLowerCase());
}

export function validateHost(urlStr: string): { valid: boolean; reason?: string; parsed?: URL } {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') {
      return { valid: false, reason: `only https allowed, got ${u.protocol}` };
    }
    if (!isAllowedHost(u.hostname)) {
      return { valid: false, reason: `host ${u.hostname} not allowed – only ${VIMM_HOST}` };
    }
    if (!u.pathname.startsWith('/vault')) {
      return { valid: false, reason: `path must start /vault, got ${u.pathname}` };
    }
    return { valid: true, parsed: u };
  } catch (e) {
    return { valid: false, reason: `invalid URL: ${(e as Error).message}` };
  }
}

export function assertAllowedVimmUrl(urlStr: string): URL {
  const res = validateHost(urlStr);
  if (!res.valid) {
    throw new Error(`Vimm URL validation failed – ${res.reason} – "${urlStr}"`);
  }
  return res.parsed!;
}

export function isValidVimmUrl(urlStr: string): boolean {
  return validateHost(urlStr).valid;
}

// --- Native Open URL Security ------------------------------------------------
// Only allow opening canonical public pages, nothing arbitrary:
//   https://vimm.net/
//   https://vimm.net/vault
//   https://vimm.net/vault/{numericId}
// Reject http, other hosts, subdomain tricks, credentials, non-/vault paths,
// search queries, and arbitrary scraped hrefs. Always generate canonical internally
// from numeric providerId.

export function validateOpenUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'vimm.net') return false;
    // No credentials
    if (u.username || u.password) return false;
    // No port funny business? Allow default 443 only (empty port). If port present, reject unless 443.
    if (u.port && u.port !== '' && u.port !== '443') return false;

    // Must not have search/query for open action – canonical only
    if (u.search && u.search.length > 0) return false;

    const path = u.pathname;
    // Allowed:
    // "/" -> https://vimm.net/
    // "/vault" and "/vault/" -> https://vimm.net/vault
    // "/vault/{digits}" with optional trailing slash
    if (path === '/' || path === '') return true;
    if (path === '/vault' || path === '/vault/') return true;
    const m = path.match(/^\/vault\/(\d+)\/?$/);
    if (m && m[1]) {
      // numeric id validated
      return /^\d+$/.test(m[1]);
    }
    return false;
  } catch {
    return false;
  }
}

export function assertValidOpenUrl(urlStr: string): URL {
  if (!validateOpenUrl(urlStr)) {
    throw new Error(`External open URL not allowed – must be canonical https://vimm.net/, /vault or /vault/{id}, got "${urlStr}"`);
  }
  return new URL(urlStr);
}

export function buildCanonicalDetailIdChecked(id: string): string | null {
  if (!/^\d+$/.test(id.trim())) return null;
  return id.trim();
}

// Convenience for externalUrl building – reuses route builder validation indirectly
export function isHttpRejected(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'http:';
  } catch {
    return false;
  }
}
