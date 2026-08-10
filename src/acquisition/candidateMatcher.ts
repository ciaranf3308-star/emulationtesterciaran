import type { Confidence } from "./types"

/**
 * Conservative title normalization for acquisition matching.
 * Mirrors backend logic for determinism.
 * Does NOT mutate display title – matching only.
 */

export function normalizeTitle(input: string): string {
  if (!input) return ""
  let s = input.trim()

  // Strip archive extension for comparison
  const lower = s.toLowerCase()
  const archiveExts = [".zip", ".7z", ".rar", ".iso", ".cue", ".bin", ".chd"]
  for (const ext of archiveExts) {
    if (lower.endsWith(ext)) {
      s = s.slice(0, -ext.length)
      break
    }
  }

  s = s.toLowerCase()
  s = s.replace(/_/g, " ")
  // Unicode apostrophes -> '
  s = s.replace(/[’‘`´]/g, "'")

  // Remove region / metadata brackets entirely for matching
  // Remove (...) and [...] blocks containing typical ROM metadata keywords OR any brackets
  // Conservative: remove all parentheses/brackets content for title matching as spec allows
  s = s.replace(/\(.*?\)/g, " ")
  s = s.replace(/\[.*?\]/g, " ")

  // Punctuation differences: colon, dash, dot, exclamation etc -> space
  s = s.replace(/[:\-–—_.,!;+]/g, " ")

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim()

  return s
}

export function confidenceForCandidate(
  normalizedExpected: string,
  normalizedCandidate: string
): Confidence {
  if (!normalizedExpected || !normalizedCandidate) return "REJECT"
  if (normalizedExpected === normalizedCandidate) return "HIGH"

  // Substring but only if expected not too generic
  // If expected is generic single word like "mario" and candidate is "mario kart", we treat as ambiguous if caller will have multiple
  // For single-candidate determination, we return HIGH only on exact normalized equality
  // Partial contains is considered AMBIGUOUS for high safety, caller decides based on uniqueness
  if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) {
    // Weak generic guard: if expected <= 4 chars and is substring of candidate, do not auto-select
    if (normalizedExpected.length <= 4) return "REJECT"
    return "AMBIGUOUS"
  }
  return "REJECT"
}

/**
 * Determine HIGH / AMBIGUOUS / REJECT across a list
 * Returns { result, highIndex } for single HIGH determination
 */
export function evaluateCandidates(
  normalizedExpected: string,
  candidateFileNames: string[] // basenames without ext, already normalized? we normalize inside
): { result: Confidence; highIndices: number[] } {
  const highs: number[] = []
  const ambiguous: number[] = []

  candidateFileNames.forEach((raw, idx) => {
    const norm = normalizeTitle(raw)
    const conf = confidenceForCandidate(normalizedExpected, norm)
    if (conf === "HIGH") highs.push(idx)
    else if (conf === "AMBIGUOUS") ambiguous.push(idx)
  })

  if (highs.length === 1) return { result: "HIGH", highIndices: highs }
  if (highs.length > 1) return { result: "AMBIGUOUS", highIndices: highs }
  if (ambiguous.length >= 1) return { result: "AMBIGUOUS", highIndices: ambiguous }
  return { result: "REJECT", highIndices: [] }
}
