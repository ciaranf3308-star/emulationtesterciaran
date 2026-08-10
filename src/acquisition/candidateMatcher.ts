/**
 * Conservative title normalization – must mirror backend normalize_title exactly.
 * Backend authoritative logic (Rust char.is_alphanumeric = Unicode):
 *  - trim, strip archive ext .zip/.7z/.rar/.iso/.cue/.bin/.chd/.rvz/.wud/.wbfs case-insensitive
 *  - lowercase (Unicode-aware)
 *  - _ -> space
 *  - unicode apostrophes ’ ‘ ` ´ -> '
 *  - : - – — -> space
 *  - remove (...) and [...] entirely
 *  - any non-alphanumeric non-whitespace -> space (punctuation, ', ., ! etc) – Unicode letters/numbers retained
 *  - collapse whitespace
 */

import type { Confidence } from "./types"

export function normalizeTitle(input: string): string {
  if (!input || !(input.trim())) return ""
  let s = input.trim()

  const lowerExt = s.toLowerCase()
  const archiveExts = [".zip", ".7z", ".rar", ".iso", ".cue", ".bin", ".chd", ".rvz", ".wud", ".wbfs"]
  for (const ext of archiveExts) {
    if (lowerExt.endsWith(ext)) {
      s = s.slice(0, -ext.length)
      break
    }
  }

  s = s.toLowerCase()
  s = s.replace(/_/g, " ")
  s = s.replace(/[’‘`´]/g, "'")
  s = s.replace(/[:\-–—]/g, " ")
  s = s.replace(/\([^)]*\)/g, " ")
  s = s.replace(/\[[^\]]*\]/g, " ")
  // Unicode-aware: keep letters (any script), numbers, whitespace; else -> space
  // Mirrors Rust char.is_alphanumeric() which is Unicode
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ")
  s = s.replace(/\s+/g, " ").trim()

  return s
}

// HIGH only on exact normalized equality – V8.6B authoritative
export function confidenceForCandidate(
  normalizedExpected: string,
  normalizedCandidate: string
): Confidence {
  if (!normalizedExpected || !normalizedCandidate) return "REJECT"
  if (normalizedExpected === normalizedCandidate) return "HIGH"
  return "REJECT"
}

/**
 * Documented fixture table (must match Rust tests):
 * Super Mario World + Super Mario World (USA).zip => HIGH
 * Super Mario World + vacation-photo.zip => REJECT
 * Mario + Mario Kart.zip => REJECT (not HIGH)
 * Mario with [Mario Kart.zip, Mario Tennis.zip] => no single HIGH auto-import
 * Pokémon + Pokémon (USA).zip => HIGH (Unicode é retained)
 * Non-Latin titles retain Unicode letters consistently with Rust
 */
export function evaluateCandidates(
  normalizedExpected: string,
  candidateFileNames: string[]
): { result: Confidence; highIndices: number[] } {
  const highs: number[] = []

  candidateFileNames.forEach((raw, idx) => {
    const norm = normalizeTitle(raw)
    if (confidenceForCandidate(normalizedExpected, norm) === "HIGH") {
      highs.push(idx)
    }
  })

  if (highs.length === 1) return { result: "HIGH", highIndices: highs }
  if (highs.length > 1) return { result: "AMBIGUOUS", highIndices: highs }
  return { result: "REJECT", highIndices: [] }
}
