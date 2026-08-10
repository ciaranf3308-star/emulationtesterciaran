/**
 * titleNormalizer – lookup normalization without mutating display title.
 *
 * Handles:
 * - unicode apostrophes ’ ‘ ` ´ → '
 * - region suffixes [USA]/[Europe] / (USA)/(Europe)
 * - disc numbers Disc 1 / (Disc 1) / - Disc 1
 * - revision (Rev 1)/(Rev A)
 * - parenthesized ROM metadata (En,Ja) / (En,Fr,De) etc.
 * - punctuation, colon/dash collapse to spaces
 * - lower-case, trim, keep alphanumeric, collapse spaces
 *
 * Display title stays intact – caller preserves original.
 */

const UNICODE_APOSTROPHE_RE = /[\u2018\u2019\u201A\u201B\u2032\u2035\u02B9\u02BC\u02C8\u0060\u00B4\u201B]/g;

// Regions commonly seen on Vimm/ROM sets
const REGION_TOKENS = [
  'usa', 'us', 'europe', 'eu', 'eur', 'japan', 'jp', 'jpn',
  'world', 'australia', 'au', 'uk', 'germany', 'france', 'spain', 'italy',
  'korea', 'china', 'asia', 'brazil', 'canada', 'sweden', 'norway', 'denmark',
  'finland', 'netherlands', 'portugal', 'russia',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeTitle(input: string): string {
  if (!input) return '';

  let t = input.trim();

  // 1. unicode apostrophes -> '
  t = t.replace(UNICODE_APOSTROPHE_RE, "'");

  // 2. NFKD strip diacritics for robust lookup, but keep ascii
  try {
    t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    // normalize may not be available in very old env – ignore
  }

  // 3. lower
  t = t.toLowerCase();

  // 4. colon / dash / underscore / semicolon variants -> space
  // preserves word boundaries for "Title: Subtitle" and "Foo-Bar"
  t = t.replace(/[:;_–—\-]+/g, ' ');

  // 5. disc / disk markers – remove explicit tokens
  // matches "disc 1", "disc 2 (etc)", "(disc 1)", "[disc 1]", "- disc 1", "cd 1"
  t = t.replace(/\b(?:disc|disk|cd)\s*\d*\b/gi, ' ');
  // also with parentheses already broken to spaces, but ensure "(disc 1)" style after lowercasing gets covered
  t = t.replace(/\(\s*disc\s*\d*[^)]*\)/gi, ' ');
  t = t.replace(/\[\s*disc\s*\d*[^\]]*\]/gi, ' ');

  // 6. revision markers: (rev 1), (rev a), rev 1, v1.0, revision, r1, etc.
  t = t.replace(/\(?\s*rev\s*[a-z0-9]+\s*\)?/gi, ' ');
  t = t.replace(/\(?\s*revision\s*[a-z0-9]*\s*\)?/gi, ' ');
  t = t.replace(/\(?\s*v\s*\d+(?:\.\d+)?[a-z]?\s*\)?/gi, ' '); // v1, v1.1 etc – cautious but okay for lookup

  // 7. remove language/region bracket groups entirely for lookup
  // Example: (En,Ja) , (En,Fr,De) , [En] . We also want (USA), [USA] etc.
  // Strategy: remove any parenthesized or bracketed segment that contains a comma or is pure region token or is short (<12 chars) alphabetic mix.
  // For safety we remove all bracketed content for lookup normalization – display stays untouched.
  // This matches spec: "remove [ ] ( ) , keep alphanumeric, collapse spaces."
  t = t.replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/\([^)]*\)/g, ' ');

  // 8. Remove stray bracket chars themselves (just in case)
  t = t.replace(/[\[\]\(\)]/g, ' ');

  // 9. apostrophe handling – after unicode normalization, strip remaining ' for alphanumeric continuity
  // "Mario's" -> "marios" helps matching
  t = t.replace(/'/g, '');

  // 10. keep alphanumeric only, replace others with space
  t = t.replace(/[^a-z0-9]+/g, ' ');

  // 11. collapse spaces, trim
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

/**
 * Optional helper for UI display stripping – removes noise but keeps pretty casing.
 * Not used for lookup key; use normalizeTitle for that.
 */
export function stripNoiseForDisplay(title: string): string {
  if (!title) return '';
  let t = title.trim();
  // unicode apostrophe normalize to straight
  t = t.replace(UNICODE_APOSTROPHE_RE, "'");
  // strip simple region tokens at end? keep rest intact
  // remove trailing " - Disc 1" style
  t = t.replace(/\s*[-–—]\s*(?:disc|disk|cd)\s*\d+\s*$/i, '');
  t = t.replace(/\s*\(disc\s*\d+\)\s*$/i, '');
  t = t.replace(/\s*\[disc\s*\d+\]\s*$/i, '');
  // collapse inner whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Best-effort extraction of disc number if present in original title.
 * Used for display, not normalization.
 */
export function extractDiscNumber(title: string): number | undefined {
  if (!title) return undefined;
  const m = title.match(/(?:disc|disk|cd)\s*(\d+)/i);
  if (m && m[1]) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > 0 && n < 20) return n;
  }
  return undefined;
}

/**
 * Simple exact token preservation check for tests
 */
export function _internal_regionList(): string[] {
  return REGION_TOKENS.map(escapeRegExp);
}
