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

// Convenience for externalUrl building – reuses route builder validation indirectly
export function isHttpRejected(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'http:';
  } catch {
    return false;
  }
}
