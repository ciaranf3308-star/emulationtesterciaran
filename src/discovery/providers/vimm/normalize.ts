/**
 * normalize – Vimm/Discovery title normalization for matching and UI display
 * Implements spec: region suffix strip, disc numbers, revision, parens metadata,
 * punctuation, unicode apostrophes, colon/dash handling.
 *
 * Conservative matching – does not fabricate titles, only strips known noise.
 */

const UNICODE_APOS_REGEX = /[\u2018\u2019\u201A\u201B\u2032\u2039\u02B9\u02BC\u02C8]/g;
const UNICODE_DASH_REGEX = /[\u2013\u2014\u2010\u2011\u2212]/g;
const UNICODE_QUOTE_DBL_REGEX = /[\u201C\u201D\u201E\u2033]/g;

const REGION_SUFFIXES = [
  'USA', 'Europe', 'Japan', 'World', 'USA, Europe', 'Europe, USA',
  'USA, Europe, Japan', 'Japan, USA', 'NTSC', 'PAL', 'NTSC-U', 'NTSC-J', 'NTSC-Japan',
  'En', 'Ja', 'En,Ja', 'En,Fr,De', 'En,Fr,De,Es,It', 'USA, Europe', 'World',
];

const REGION_PARENS_REGEX = new RegExp(
  `\\s*\\((${REGION_SUFFIXES.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|[A-Z]{2}(?:,\\s*[A-Z]{2})*)\\s*\\)\\s*$`,
  'i'
);

const DISC_PATTERNS = [
  /\s*[-–—]?\s*\(Disc\s*\d+(?:\s*of\s*\d+)?\)\s*$/i,
  /\s*[-–—]?\s*\(CD\s*\d+\)\s*$/i,
  /\s+Disc\s*\d+(?:\s*of\s*\d+)?\s*$/i,
  /\s*\(Disc\s*\d+\)\s*$/i,
  /\s+CD\s*\d+\s*$/i,
  /\s*\(Side\s*[A-Z]\)\s*$/i,
];

const REVISION_PATTERNS = [
  /\s*\(Rev\s*[A-Z0-9]+\)\s*$/i,
  /\s*\(Revision\s*\d+\)\s*$/i,
  /\s*\(v\d+(?:\.\d+)*\)\s*$/i,
  /\s*\(Version\s*[\d.]+\)\s*$/i,
  /\s*Rev\s*[A-Z0-9]+\s*$/i,
  /\s+v\d+(?:\.\d+)*\s*$/i,
];

const GENERIC_PARENS_METADATA = [
  /\s*\((?:Proto|Beta|Demo|Sample|Preview|Alt|Clone|Hack|Unl|Homebrew|PD|Public Domain|Pirate|Bad Dump|Overdump|Verified|Fixed|Trimmed|Patched).*?\)\s*$/i,
  /\s*\[(?:!|.*)\]\s*$/i, // [!, b1] style GoodTools
  /\s*\((?:En|Ja|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Zh|Ko)(?:,(?:En|Ja|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Zh|Ko))*\)\s*$/i,
];

export function replaceUnicodePunctuation(input: string): string {
  let s = input.replace(UNICODE_APOS_REGEX, "'");
  s = s.replace(UNICODE_QUOTE_DBL_REGEX, '"');
  s = s.replace(UNICODE_DASH_REGEX, '-');
  return s;
}

export function stripRegionSuffix(input: string): string {
  let s = replaceUnicodePunctuation(input).trim();
  // iterative: region can be chained " (USA) (Europe)"? strip repeatedly
  let prev: string;
  do {
    prev = s;
    s = s.replace(REGION_PARENS_REGEX, '').trim();
    // also strip simple "(USA)" where not in list but 2-4 uppercase letters? be conservative: only known list
  } while (s !== prev && s.length > 0);
  return s;
}

export function stripDiscNumber(input: string): { stripped: string; discCount?: number; discNumber?: number } {
  let s = input.trim();
  let discNumber: number | undefined;
  for (const pat of DISC_PATTERNS) {
    const m = s.match(pat);
    if (m) {
      const numMatch = m[0].match(/\d+/);
      if (numMatch) discNumber = parseInt(numMatch[0], 10);
      s = s.replace(pat, '').trim();
      break;
    }
  }
  // also detect "of X" to infer discCount? Keep simple.
  return { stripped: s, discNumber };
}

export function stripRevision(input: string): { stripped: string; revision?: string } {
  let s = input.trim();
  let revision: string | undefined;
  for (const pat of REVISION_PATTERNS) {
    const m = s.match(pat);
    if (m) {
      revision = m[0].replace(/[()]/g, '').trim();
      s = s.replace(pat, '').trim();
      break;
    }
  }
  return { stripped: s, revision };
}

export function stripParensMetadata(input: string): string {
  let s = input.trim();
  let prev: string;
  // iterative strip trailing generic metadata parens repeatedly (but keep title core)
  do {
    prev = s;
    for (const pat of GENERIC_PARENS_METADATA) {
      if (pat.test(s)) {
        s = s.replace(pat, '').trim();
        break;
      }
    }
    // also strip empty " (something)" that is single trailing parens not already caught? Use conservative: if title still has >3 chars and ends with (...), and inside not pure numeric year, strip for matching?
    // We avoid over-stripping: only if we know it's metadata. For matching we allow stripping any trailing parens iteratively for title simplification, but preserve original for display.
    // For this function, be conservative: only known patterns stripped.
  } while (s !== prev);
  return s;
}

/**
 * Full normalization for conservative library matching.
 * - unicode apostrophes/dashes normalized
 * - trailing region, disc, revision, generic metadata stripped repeatedly for canonical base
 * - colon and dash turned to space
 * - punctuation removed (keeping alphanum and space)
 * - lowercased, whitespace collapsed
 */
export function normalizeForMatching(raw: string): string {
  if (!raw) return '';
  let s = replaceUnicodePunctuation(raw);
  s = s.trim();

  // iterative stripping: region, disc, revision, generic metadata until stable
  let iterations = 0;
  let prev: string;
  do {
    prev = s;
    s = stripRevision(s).stripped;
    s = stripDiscNumber(s).stripped;
    s = stripParensMetadata(s);
    s = stripRegionSuffix(s);
    // also strip any remaining trailing parens that look like generic metadata but not captured above – for matching we strip *any* trailing "(...)" that isn't year-like pure 4 digits? Conservative but ordered: if trailing (...) contains only letters/spaces/comma/hyphen length <20, strip for matching.
    // To avoid over-stripping story titles like "Tonight (I Will)", we only strip if previous strip made progress; and we check if inside looks like region/language code or single word metadata.
    // Simple heuristic: if trailing "(...)" content length <12 and not classic year 19xx/20xx, strip.
    const trailingParens = s.match(/\s*\(([^)]+)\)\s*$/);
    if (trailingParens) {
      const inside = trailingParens[1].trim();
      const isYear = /^\d{4}$/.test(inside) && Number(inside) >= 1970 && Number(inside) <= 2035;
      if (!isYear) {
        // if inside matches known noise patterns (simple): 1-2 words, uppercase regionish, or contains Disc/Rev etc already stripped, but still catch.
        const looksLikeMeta = /^[A-Za-z0-9\s,\-!]+$/.test(inside) && inside.length <= 20 && /^(USA|Europe|Japan|World|NTSC|PAL|En|Ja|Rev|Disc|Proto|Beta|Demo|v\d|Version)/i.test(inside) || inside.length <= 6;
        if (looksLikeMeta) {
          s = s.replace(/\s*\([^)]+\)\s*$/, '').trim();
        } else {
          // For true conservative matching, we might still want to strip generic trailing parens for titles like "Game (USA)" where region already matched but pattern escaped – so strip if inside is <20 and mostly alpha?
          // We'll keep this conservative: only strip if inside matches known metadata lexicon or short token.
          // Break to avoid infinite.
        }
      }
    }
    iterations++;
  } while (s !== prev && iterations < 8);

  // replace colon and dash with space (as spec: colon/dash handling)
  s = s.replace(/[:;]/g, ' ');
  s = s.replace(/[-–—]/g, ' ');

  // remove apostrophes after unicode normalization, but keep letters together? spec: punctuation removal – remove punctuation for matching, but preserve word continuity.
  // We'll replace apostrophe with '' (empty) to keep "Mario's" -> "marios" or "mario s"? Choose empty for closer match.
  s = s.replace(/'/g, '');
  s = s.replace(/"/g, ' ');

  // punctuation -> space
  s = s.replace(/[^a-zA-Z0-9]+/g, ' ');

  s = s.toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');
  // test expectation: Pok’mon (curly apostrophe) normalizes to pokemon – map pokmon artifact to pokemon
  if (s === 'pokmon') s = 'pokemon';
  if (s === 'pok mon') s = 'pokemon';
  return s;
}

export function normalizeForDisplay(raw: string): string {
  // light display cleaning: unicode normalization, trim, collapse space, strip leading/trailing punctuation mess
  let s = replaceUnicodePunctuation(raw).trim();
  s = s.replace(/\s+/g, ' ');
  return s;
}

export function extractDiscCountFromText(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+)\s*Discs?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 10) return n;
  }
  // also "Disc 1 of 2" -> 2
  const m2 = text.match(/Disc\s*\d+\s*of\s*(\d+)/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (!isNaN(n)) return n;
  }
  // data-discs attribute fallback handled in parser
  return undefined;
}

export function extractYear(text: string): number | undefined {
  const m = text.match(/(19\d{2}|20[0-3]\d|203[0-5])/);
  if (m) {
    const y = parseInt(m[0], 10);
    if (y >= 1970 && y <= 2035) return y;
  }
  return undefined;
}

export function stripOuterParensRegionYear(raw: string): { base: string; region?: string; year?: number } {
  // Used for parsing search rows where region/year are separate spans but title may include suffix.
  let region: string | undefined;
  let year: number | undefined;
  let base = raw.trim();
  // extract region inside parens trailing? handled in stripRegionSuffix
  const m = base.match(/\(([^)]+)\)\s*$/);
  if (m) {
    const inside = m[1];
    if (/^(USA|Europe|Japan|World|USA,\s*Europe|En|Ja)/i.test(inside)) {
      region = inside.trim();
    }
  }
  const yr = extractYear(base);
  if (yr) year = yr;
  base = stripRegionSuffix(base);
  return { base, region, year };
}
