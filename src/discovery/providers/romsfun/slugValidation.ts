/**
 * ROMsFun slug validation – no traversal/UNC
 * Used for buildCanonicalDetailUrl
 */

const RESERVED_DOS = new Set(['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9']);

export function isValidRomsFunSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  let t = slug.trim();
  if (t.length === 0 || t.length > 256) return false;
  if (t.startsWith('/') || t.endsWith('/')) return false;
  if (t.includes('\\')) return false;
  if (t.includes(':')) return false;
  if (t.includes('//')) return false;
  if (t.includes('..')) return false;
  if (t.startsWith('\\\\') || t.startsWith('//')) return false;
  if (/[\0-\x1F\x7F]/.test(t)) return false;
  const segs = t.split('/');
  for (const seg of segs) {
    if (seg.length === 0) return false;
    if (seg === '.' || seg === '..') return false;
    if (seg.length > 64) return false;
    if (!/^[a-z0-9\-_.]+$/.test(seg.toLowerCase())) return false;
    const upper = seg.toUpperCase().split('.')[0];
    if (RESERVED_DOS.has(upper)) return false;
  }
  return true;
}

export function normalizeSlug(slug: string): string {
  return slug.trim().replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}
