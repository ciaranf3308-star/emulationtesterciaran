/**
 * V8.4 DISCOVER — Library Matching (READ-ONLY, no gamelist mutation)
 *
 * Conservative matching: only IN YOUR LIBRARY when exact normalized match or strong.
 * Normalized title helper shared — strips punctuation, case, region noise, edition noise,
 * normalizes unicode.
 */

export type GameEntryMinimal = {
  id: string
  system_id: string
  name: string
}

/**
 * Normalize title for conservative matching.
 * Lowercase, NFKD strip diacritics, remove (USA)/(Europe) region tags, brackets,
 * edition markers, punctuation except alphanumeric spaces collapsed.
 */
export function normalizeTitle(raw: string): string {
  if (!raw) return ''
  let s = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
  s = s.toLowerCase()
  // Remove bracketed regions/editions: (USA), [Europe], etc -> keep inner if meaningful? we strip fully for conservative? Keep content for matching? Remove only common region tokens.
  // First collapse parentheses content that looks like metadata
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.replace(/\[[^\]]*\]/g, ' ')
  // Remove common edition suffixes
  s = s.replace(/\b(rev\s*\d+|v\d+(\.\d+)?|disc\s*\d+|disk\s*\d+|track\s*\d+|part\s*\d+)\b/g, ' ')
  // Remove punctuation except alphanumerics and spaces
  s = s.replace(/[^a-z0-9]+/g, ' ')
  s = s.trim().replace(/\s+/g, ' ')
  return s
}

/**
 * Conservative in-library check.
 * Returns true when discovery title normalized exactly equals any library game normalized for same system,
 * OR when one normalized contains the other with strong token overlap (>= 85% token Jaccard or Levenshtein-like strict).
 * We implement exact normalized equality plus containment when lengths close.
 */
export function isInLibrary(
  discoveryTitle: string,
  discoverySystemId: string | null | undefined,
  library: GameEntryMinimal[] | null | undefined,
  normalizer: (s: string) => string = normalizeTitle
): boolean {
  if (!discoveryTitle || !library || library.length === 0) return false
  const normDisc = normalizer(discoveryTitle)
  if (!normDisc) return false

  for (const g of library) {
    // System filter: if discovery has systemId, require match, otherwise allow cross? Prefer same system conservative.
    if (discoverySystemId && g.system_id && g.system_id !== discoverySystemId) continue
    const normLocal = normalizer(g.name)
    if (!normLocal) continue
    if (normLocal === normDisc) return true
    // Strong secondary: containment when one length >= 0.8 of other and tokens subset
    // e.g., "Gran Turismo 4" vs "Gran Turismo 4 Prologue" should NOT match (conservative false), but "Metal Gear Solid 3 Snake Eater" exact after normalization will match.
    // So we check very tight: if normLocal length diff <= 3 chars and one contains other entirely.
    if (Math.abs(normLocal.length - normDisc.length) <= 3) {
      if (normLocal.includes(normDisc) || normDisc.includes(normLocal)) {
        // token count check
        const aTokens = new Set(normLocal.split(' '))
        const bTokens = new Set(normDisc.split(' '))
        let inter = 0
        for (const t of aTokens) if (bTokens.has(t)) inter++
        const union = new Set([...aTokens, ...bTokens]).size
        if (union > 0 && inter / union >= 0.85) return true
      }
    }
  }
  return false
}

/** Match score for sorting, not primary boolean but useful for UI grouping */
export function libraryMatchTier(
  discoveryTitle: string,
  discoverySystemId: string | undefined,
  library: GameEntryMinimal[] | undefined
): 'in-library' | 'not-in-library' {
  return isInLibrary(discoveryTitle, discoverySystemId, library) ? 'in-library' : 'not-in-library'
}
