/**
 * V8.6D1 ROMsFun host validation – strict
 * Only https://romsfun.com and optional www.romsfun.com (if actually observed redirect)
 * No credentials, no custom ports, no arbitrary caller URLs
 */

const ROMSFUN_HOSTS = new Set<string>(['romsfun.com', 'www.romsfun.com']);

export function isAllowedRomsFunHost(hostname: string): boolean {
  if (!hostname) return false;
  return ROMSFUN_HOSTS.has(hostname.toLowerCase());
}

export function validateRomsFunUrl(urlStr: string): { valid: boolean; reason?: string; parsed?: URL } {
  // Strict pre-parse traversal check – raw string must not contain .. or backslash, URL normalizes ../ away
  if (urlStr.includes('..')) {
    return { valid: false, reason: 'path contains .. traversal (raw)' };
  }
  if (urlStr.includes('\\')) {
    return { valid: false, reason: 'backslash in raw URL blocked' };
  }
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') {
      return { valid: false, reason: `only https allowed, got ${u.protocol}` };
    }
    if (!isAllowedRomsFunHost(u.hostname)) {
      return { valid: false, reason: `host ${u.hostname} not allowed – only romsfun.com / www.romsfun.com` };
    }
    if (u.port && u.port !== '' && u.port !== '443') {
      return { valid: false, reason: `custom port ${u.port} not allowed` };
    }
    if (u.username || u.password) {
      return { valid: false, reason: 'credentials not allowed' };
    }
    // Path must start with '/' and be either "/" or "/roms" family per fetch_romsfun policy
    // For detail validation we allow /roms/<slug> but for generic validation we allow "/" and "/roms" prefix
    const path = u.pathname;
    if (path !== '/' && path !== '/roms' && path !== '/roms/' && !path.startsWith('/roms/')) {
      return { valid: false, reason: `path must be / or /roms/*, got ${path}` };
    }
    if (path.includes('..')) {
      return { valid: false, reason: 'path contains .. traversal' };
    }
    if (path.includes('\\')) {
      return { valid: false, reason: 'backslash in path blocked' };
    }
    // Reject URL containing search with suspicious? Allow query for search but validated elsewhere
    return { valid: true, parsed: u };
  } catch (e) {
    return { valid: false, reason: `invalid URL: ${(e as Error).message}` };
  }
}

export function assertValidRomsFunUrl(urlStr: string): URL {
  const res = validateRomsFunUrl(urlStr);
  if (!res.valid) throw new Error(`ROMsFun URL validation failed – ${res.reason} – "${urlStr}"`);
  return res.parsed!;
}

export function isValidRomsFunUrl(urlStr: string): boolean {
  return validateRomsFunUrl(urlStr).valid;
}

// Native open URL security – only canonical https://romsfun.com/ and /roms/* allowed, no arbitrary
export function validateRomsFunOpenUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    if (!isAllowedRomsFunHost(u.hostname)) return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== '' && u.port !== '443') return false;
    if (u.search && u.search.length > 0) {
      // For open we forbid search params (catalog page navigation should use path only)
      // However search with ?q= may be allowed for search intent – we allow limited query for search route
      // For strict open validation we reject query to prevent injection
      // Exception: allow ?q=... for search? For metadata opening we keep simple: reject query
      // Frontend will use canonical without query for detail
      return false;
    }
    const path = u.pathname;
    if (path === '/' || path === '/roms' || path === '/roms/') return true;
    if (path.startsWith('/roms/')) {
      // Slug must not have empty segments, not traversal
      if (path.includes('..') || path.includes('\\')) return false;
      if (path.includes('//')) return false; // double slash
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function buildCanonicalRomsFunHome(): string {
  return 'https://romsfun.com/';
}

// Do NOT allowlist galaxylanesandgames.com – explicit constant for regression test documentation
export const FORBIDDEN_THIRD_PARTY_HOSTS = ['galaxylanesandgames.com'] as const;

export function isForbiddenThirdParty(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return (FORBIDDEN_THIRD_PARTY_HOSTS as readonly string[]).includes(host) ||
      host.includes('galaxylanesandgames.com');
  } catch {
    return false;
  }
}
