/**
 * ROMsFun routes – canonical URL construction strict https/no port/no creds
 * No arbitrary caller URLs – provider owns canonical construction
 */

import { isValidRomsFunSlug, normalizeSlug } from './slugValidation';

export function buildCanonicalDetailUrl(slug: string): string {
  if (!isValidRomsFunSlug(slug)) {
    throw new Error(`Invalid ROMsFun slug – traversal/UNC/illegal chars – "${slug}"`);
  }
  let normalized = normalizeSlug(slug).toLowerCase();
  // Ensure no leading slash left after normalize
  normalized = normalized.replace(/^\/+/, '');

  // If slug does not start with roms/, we will produce roms/ prefix for safety unless caller already included
  // Spec: must be inside /roms family, so canonical must point to /roms/<slug>
  let finalPath: string;
  if (normalized.startsWith('roms/')) {
    finalPath = `/${normalized}`;
  } else {
    finalPath = `/roms/${normalized}`;
  }

  // Strict https, host exactly romsfun.com, no port, no creds
  const url = `https://romsfun.com${finalPath}`;

  // Validate constructed URL strictly
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('only https');
    if (u.hostname !== 'romsfun.com') throw new Error('host must be romsfun.com');
    if (u.port && u.port !== '' && u.port !== '443') throw new Error('custom port');
    if (u.username || u.password) throw new Error('no creds');
    if (u.pathname.includes('..') || u.pathname.includes('\\')) throw new Error('traversal');
    // Must be /roms/*
    if (!u.pathname.startsWith('/roms/') && u.pathname !== '/roms' && u.pathname !== '/roms/') {
      throw new Error('must be /roms');
    }
    return url;
  } catch (e) {
    throw new Error(`buildCanonicalDetailUrl failed validation for slug "${slug}" -> url "${url}": ${(e as Error).message}`);
  }
}

export function buildCanonicalSearchUrl(systemToken: string, query: string): string {
  // ROMsFun search likely uses /roms/<system>?search= or /search?q=
  // For metadata-only catalog we construct conservative search URL:
  // https://romsfun.com/roms/<systemToken>?q=<encoded>
  // But fetch_romsfun only allows / and /roms/* paths – query params are allowed in URL parser but our hostValidation for fetch may allow search? For safety we allow query here but final fetch will go through fetch_romsfun which validates path prefix /roms/ – query allowed.
  // Validate system token similar to slug segment
  if (!systemToken || typeof systemToken !== 'string' || systemToken.trim().length === 0) {
    throw new Error(`Invalid system token for ROMsFun search: "${systemToken}"`);
  }
  const token = systemToken.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  if (!token) throw new Error(`System token empty after sanitization: "${systemToken}"`);
  const q = query.trim();
  if (!q) throw new Error('Search query empty');
  // Encode query for URL
  const encoded = encodeURIComponent(q);
  // Construct canonical search – path inside /roms
  return `https://romsfun.com/roms/${token}?q=${encoded}`;
}

export function buildVaultRoot(): string {
  return 'https://romsfun.com/';
}

export function extractSlugFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== 'romsfun.com' && u.hostname !== 'www.romsfun.com') return null;
    let p = u.pathname;
    if (p.startsWith('/roms/')) return p.slice(6); // remove leading /roms/
    if (p.startsWith('/')) return p.slice(1);
    return p;
  } catch {
    return null;
  }
}
