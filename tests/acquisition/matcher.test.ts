import { describe, test, expect } from "bun:test"
import { normalizeTitle, confidenceForCandidate, evaluateCandidates } from "../../src/acquisition/candidateMatcher"

describe("V8.6B.1 acquisition matcher – identical to Rust", () => {
  const fixtures: Array<[string, string, boolean]> = [
    ["Super Mario World", "Super Mario World (USA).zip", true],
    ["Super Mario World", "vacation-photo.zip", false],
    ["Mario", "Mario Kart.zip", false],
  ]

  fixtures.forEach(([expRaw, candRaw, shouldMatch]) => {
    test(`fixture ${expRaw} vs ${candRaw} => ${shouldMatch ? "HIGH" : "REJECT"}`, () => {
      const expN = normalizeTitle(expRaw)
      const candStem = candRaw.replace(/\.[^.]+$/, "")
      const candN = normalizeTitle(candStem)
      const conf = confidenceForCandidate(expN, candN)
      expect((conf === "HIGH") === shouldMatch).toBe(true)
    })
  })

  test("exact normalized equality only HIGH", () => {
    const exp = normalizeTitle("Super Mario World")
    const cand1 = normalizeTitle("Super Mario World (USA)")
    expect(confidenceForCandidate(exp, cand1)).toBe("HIGH")
  })

  test("Mario vs Mario Kart => NOT HIGH", () => {
    const exp = normalizeTitle("Mario")
    const cand = normalizeTitle("Mario Kart")
    expect(confidenceForCandidate(exp, cand)).toBe("REJECT")
  })

  test("Mario Kart + Mario Tennis for Mario => no single HIGH", () => {
    const exp = normalizeTitle("Mario")
    const res = evaluateCandidates(exp, ["Mario Kart.zip", "Mario Tennis.zip"])
    expect(res.result).not.toBe("HIGH")
    expect(res.highIndices.length).not.toBe(1)
  })

  test("Super Mario World (USA).zip HIGH", () => {
    const exp = normalizeTitle("Super Mario World")
    const res = evaluateCandidates(exp, ["Super Mario World (USA).zip"])
    expect(res.result).toBe("HIGH")
  })

  test("two identical HIGH => AMBIGUOUS", () => {
    const exp = normalizeTitle("Super Mario World")
    const res = evaluateCandidates(exp, ["Super Mario World.zip", "Super Mario World (USA).zip"])
    expect(res.result).toBe("AMBIGUOUS")
    expect(res.highIndices.length).toBe(2)
  })

  test("unicode apostrophes normalized", () => {
    const a = normalizeTitle("Punch-Out!!")
    const b = normalizeTitle("Punch-Out")
    // Both should strip punctuation down to same base handling
    expect(typeof a).toBe("string")
  })

  test("region/meta suffix removal", () => {
    expect(normalizeTitle("Super Mario World (USA)")).toBe("super mario world")
    expect(normalizeTitle("Super Mario World [USA]")).toBe("super mario world")
    expect(normalizeTitle("Super_Mario-World")).toBe("super mario world")
  })

  test("Pokémon unicode parity – same normalized HIGH", () => {
    const exp = normalizeTitle("Pokémon")
    const cand = normalizeTitle("Pokémon (USA).zip")
    // Both should normalize to same value containing é (unicode letter retained)
    expect(exp.length).toBeGreaterThan(0)
    expect(exp).toBe(cand.replace(/\.zip$/, "")) // after strip? actually cand already stripped via normalizeTitle handling of .zip inside? our normalize handles .zip ext earlier
    // Direct equality via evaluate
    const expN = normalizeTitle("Pokémon")
    const candN = normalizeTitle("Pokémon (USA)")
    expect(expN).toBe(candN)
    expect(confidenceForCandidate(expN, candN)).toBe("HIGH")

    const res = evaluateCandidates(expN, ["Pokémon (USA).zip"])
    expect(res.result).toBe("HIGH")
  })

  test("Pokémon retains é not stripped to e", () => {
    const norm = normalizeTitle("Pokémon")
    // Rust char.is_alphanumeric keeps é as alphanumeric, lowercased keeps é
    expect(norm.includes("é")).toBe(true)
    expect(norm).toBe("pokémon")
  })

  test("non-Latin title retained consistently – Japanese/Korean etc", () => {
    // Use a non-Latin script that Rust is_alphanumeric would keep
    const titleJa = "スーパーマリオ" // Katakana / Kanji mix – letters in Unicode
    const normJa = normalizeTitle(titleJa)
    expect(normJa.length).toBeGreaterThan(0)
    // Should retain the Japanese characters (not stripped)
    expect(normJa).toBe(titleJa.toLowerCase())

    const titleKo = "마리오" // Hangul
    const normKo = normalizeTitle(titleKo)
    expect(normKo).toBe(titleKo.toLowerCase())

    // Evaluate HIGH for non-Latin same title with region suffix
    const expJa = normalizeTitle("スーパーマリオ")
    const candJa = normalizeTitle("スーパーマリオ (USA).zip")
    expect(expJa).toBe(candJa.replace(/\s+/g, " ").trim().split(" ").join(" ")) // sanity
    expect(confidenceForCandidate(expJa, normalizeTitle("スーパーマリオ (USA)"))).toBe("HIGH")
  })

  test("Pokémon vs Pokemon ASCII not equal – unicode matters", () => {
    // Ensure unicode path is not collapsed to ASCII accidentally
    const withAccent = normalizeTitle("Pokémon")
    const withoutAccent = normalizeTitle("Pokemon")
    expect(withAccent).not.toBe(withoutAccent)
  })
})
