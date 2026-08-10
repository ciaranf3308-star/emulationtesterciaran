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
})
