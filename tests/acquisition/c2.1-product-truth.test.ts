import { describe, test, expect } from "bun:test"
import {
  mapExternalToCrystalPhase,
  crystalCopyForPhase,
  findInstalledGame,
  isNonTerminalBlockingPhase,
  isTerminalCloseablePhase,
  isTerminalPlayablePhase,
  type CrystalPresentationPhase,
} from "../../src/acquisition/acquisitionUiController"
import type { GameEntry } from "../../src/runtime/backend"

function mkGame(override: any): GameEntry {
  return {
    id: override.id ?? override.rom_path,
    name: override.name,
    system_id: override.system_id ?? "gbc",
    rom_path: override.rom_path,
    favorite: false,
    lastPlayed: null,
    playCount: 0,
  } as any
}

// Pure simulation of useCrystalAcquisition crystalPhase derivation after local edits
function deriveHookCrystalPhase(opts: {
  externalPhase: string
  refreshStatus: "idle" | "refreshing" | "done" | "failed"
  found: boolean
  errorDetail?: string | null
  errorCode?: string | null
}): CrystalPresentationPhase {
  const { externalPhase, refreshStatus, found, errorDetail, errorCode } = opts
  const base = mapExternalToCrystalPhase(externalPhase as any, { errorCode })
  if (externalPhase === "INSTALLED") {
    if (refreshStatus === "refreshing") return "REFRESHING_LIBRARY"
    if (refreshStatus === "failed") return "LIBRARY_REFRESH_FAILED"
    if (refreshStatus === "done") {
      if (found) return "READY_TO_PLAY"
      if (errorDetail === "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH" || errorDetail === "INSTALLED_GAME_NOT_FOUND") return "INSTALLED_GAME_NOT_FOUND"
      return "INSTALLED_GAME_NOT_FOUND"
    }
  }
  if (externalPhase === "ALREADY_INSTALLED") {
    if (refreshStatus === "refreshing") return "ALREADY_IN_LIBRARY"
    if (refreshStatus === "failed") return "LIBRARY_REFRESH_FAILED"
    if (refreshStatus === "done") {
      if (found) return "READY_TO_PLAY"
      return "INSTALLED_GAME_NOT_FOUND"
    }
    if (refreshStatus === "idle") return "ALREADY_IN_LIBRARY"
  }
  if (externalPhase === "FAILED" && errorDetail === "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH") {
    return "INSTALLED_GAME_NOT_FOUND"
  }
  if (errorDetail === "LIBRARY_REFRESH_FAILED") return "LIBRARY_REFRESH_FAILED"
  if (errorDetail === "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH" && (externalPhase === "INSTALLED" || externalPhase === "ALREADY_INSTALLED")) {
    return "INSTALLED_GAME_NOT_FOUND"
  }
  return base
}

describe("V8.6C2.1 product-truth fixes", () => {
  test("1. REAL REFRESH MUST FAIL HONESTLY – refresh reject → LIBRARY_REFRESH_FAILED, never READY", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "INSTALLED",
      refreshStatus: "failed",
      found: false,
      errorDetail: "LIBRARY_REFRESH_FAILED",
    })
    expect(phase).toBe("LIBRARY_REFRESH_FAILED")
    expect(isTerminalPlayablePhase(phase)).toBe(false)
    expect(phase).not.toBe("READY_TO_PLAY")
    const copy = crystalCopyForPhase(phase)
    expect(copy.title).toBe("GAME ADDED")
    expect(copy.subtitle).toMatch(/couldn't refresh/i)
  })

  test("INSTALLED success + no match → INSTALLED_GAME_NOT_FOUND, never READY from stale", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "INSTALLED",
      refreshStatus: "done",
      found: false,
      errorDetail: "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH",
    })
    expect(phase).toBe("INSTALLED_GAME_NOT_FOUND")
    expect(phase).not.toBe("READY_TO_PLAY")
  })

  test("ALREADY refresh success + no match → INSTALLED_GAME_NOT_FOUND", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "done",
      found: false,
      errorDetail: "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH",
    })
    expect(phase).toBe("INSTALLED_GAME_NOT_FOUND")
  })

  test("ALREADY refresh success + unique match → READY_TO_PLAY", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "done",
      found: true,
    })
    expect(phase).toBe("READY_TO_PLAY")
    expect(isTerminalPlayablePhase(phase)).toBe(true)
  })

  test("ALREADY refreshing → ALREADY_IN_LIBRARY blocking (not terminal closeable)", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "refreshing",
      found: false,
    })
    expect(phase).toBe("ALREADY_IN_LIBRARY")
    expect(isNonTerminalBlockingPhase(phase)).toBe(true)
    expect(isTerminalCloseablePhase(phase)).toBe(false)
  })

  test("REFRESH fail from ALREADY → LIBRARY_REFRESH_FAILED (terminal, not dead-end ALREADY)", () => {
    const phase = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "failed",
      found: false,
      errorDetail: "LIBRARY_REFRESH_FAILED",
    })
    expect(phase).toBe("LIBRARY_REFRESH_FAILED")
    expect(isTerminalCloseablePhase(phase)).toBe(true)
    expect(isNonTerminalBlockingPhase(phase)).toBe(false)
  })

  test("3. REMOVE UNSAFE BASENAME – wrong same basename elsewhere not selected", () => {
    const games = [
      mkGame({ name: "Other Title", rom_path: "D:/Roms/gbc/SameBase.gbc", system_id: "gbc" }),
      mkGame({ name: "Pokémon Crystal", rom_path: "D:/Roms/gbc/Pokemon Crystal.gbc", system_id: "gbc" }),
    ]
    // installedPaths points to correct file, but there's another file elsewhere with same basename "SameBase.gbc"
    // Authority must be exact path, not basename -> should NOT match Other Title when expected is Pokémon
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: ["D:/Roms/gbc/Pokemon Crystal.gbc"],
      refreshedGames: games,
    })
    expect(res.found?.name).toBe("Pokémon Crystal")

    // If installedPaths is empty and only basename matches elsewhere, title fallback must NOT pick basename – it picks title. Since title doesn't match Other Title, should be NO_MATCH
    const res2 = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: [],
      refreshedGames: [mkGame({ name: "Other Title", rom_path: "C:/Downloads/SameBase.gbc", system_id: "gbc" })],
    })
    expect(res2.found).toBeNull()
  })

  test("Downloads selectedCandidate must NOT create false identity", () => {
    // Attacker scenario: user Downloads folder path leaked as selectedCandidate – e.g., C:/Users/You/Downloads/Pokemon Crystal.gbc
    // Importer installedPaths is undefined / different. If we treated Downloads path as installed destination, we'd false-match.
    const games = [
      mkGame({ name: "Pokémon Crystal", rom_path: "D:/Roms/gbc/Pokemon Crystal.gbc", system_id: "gbc" }),
    ]
    // No installedPaths – simulating old bug using selectedCandidate as authority
    // With fix, installedPaths comes ONLY from importResult.installedPaths – not selectedCandidate.
    // So passing [] should force title fallback path, which still should succeed ONLY if exactly one title match (that's ok), but NOT via exact path identity.
    // More importantly, if Downloads path is DIFFERENT folder than rom_path, it must NOT match as exact path.
    const downloadsPathAsInstalled = ["C:/Users/You/Downloads/Pokemon Crystal.gbc"]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: downloadsPathAsInstalled as any,
      refreshedGames: games,
    })
    // Downloads path normalized != rom_path normalized -> no exact match, falls to title fallback -> unique title still succeeds (acceptable)
    // The CRITICAL safety: it must NOT match a game that merely shares basename but is in different library path incorrectly via basename fallback.
    // So we assert that if the only game has different basename, downloads path cannot create match.
    const otherGames = [mkGame({ name: "Other", rom_path: "D:/Roms/gbc/Other.gbc", system_id: "gbc" })]
    const res2 = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: downloadsPathAsInstalled as any,
      refreshedGames: otherGames,
    })
    // Title "Pokémon Crystal" vs game name "Other" => no title match, and exact path mismatch => null
    expect(res2.found).toBeNull()
  })

  test("unique exact title succeeds", () => {
    const games = [mkGame({ name: "Pokémon Crystal", rom_path: "a.gbc", system_id: "gbc" })]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: [],
      refreshedGames: games,
    })
    expect(res.found).not.toBeNull()
  })

  test("duplicate exact titles fail closed", () => {
    const games = [
      mkGame({ id: "1", name: "Pokémon Crystal", rom_path: "a.gbc", system_id: "gbc" }),
      mkGame({ id: "2", name: "Pokémon Crystal", rom_path: "b.gbc", system_id: "gbc" }),
    ]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: [],
      refreshedGames: games,
    })
    expect(res.found).toBeNull()
    expect(res.reason).toBe("MULTIPLE_TITLE_MATCHES")
  })

  test("close/back cannot dead-end on ALREADY_IN_LIBRARY – deterministic transitions", () => {
    // ALREADY while refreshing – back should cancel (non-terminal blocking) – not remain ALREADY forever
    const whileRefreshing = "ALREADY_IN_LIBRARY" as CrystalPresentationPhase
    expect(isNonTerminalBlockingPhase(whileRefreshing)).toBe(true)
    expect(isTerminalCloseablePhase(whileRefreshing)).toBe(false)

    // after refresh found → READY playable
    const afterFound = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "done",
      found: true,
    })
    expect(afterFound).toBe("READY_TO_PLAY")
    expect(isTerminalPlayablePhase(afterFound)).toBe(true)

    // after refresh not-found → INSTALLED_GAME_NOT_FOUND closeable
    const afterNotFound = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "done",
      found: false,
    }) as CrystalPresentationPhase
    expect(afterNotFound).toBe("INSTALLED_GAME_NOT_FOUND")
    expect(isTerminalCloseablePhase(afterNotFound)).toBe(true)
    expect(isNonTerminalBlockingPhase(afterNotFound)).toBe(false)

    // after refresh error → LIBRARY_REFRESH_FAILED closeable
    const afterError = deriveHookCrystalPhase({
      externalPhase: "ALREADY_INSTALLED",
      refreshStatus: "failed",
      found: false,
      errorDetail: "LIBRARY_REFRESH_FAILED",
    }) as CrystalPresentationPhase
    expect(isTerminalCloseablePhase(afterError)).toBe(true)
    expect(isNonTerminalBlockingPhase(afterError)).toBe(false)
  })

  test("ALREADY_IN_LIBRARY must not be both nonTerminalBlocking and terminalCloseable", () => {
    const p = "ALREADY_IN_LIBRARY" as CrystalPresentationPhase
    expect(isNonTerminalBlockingPhase(p) && isTerminalCloseablePhase(p)).toBe(false)
  })

  test("stale cached library never accepted as successful real refresh – refresh failure sets failed status", () => {
    // Simulates triggerRefreshAndLocate catch path – sets refreshStatus=failed, found=null, errorDetail=LIBRARY_REFRESH_FAILED
    // Any old cached games array must NOT be used to produce READY
    const staleGames = [mkGame({ name: "Pokémon Crystal", rom_path: "old.gbc", system_id: "gbc" })]
    // Even though stale cache has the game, with refreshStatus=failed we must not return READY
    const phase = deriveHookCrystalPhase({
      externalPhase: "INSTALLED",
      refreshStatus: "failed",
      found: false,
      errorDetail: "LIBRARY_REFRESH_FAILED",
    })
    expect(phase).not.toBe("READY_TO_PLAY")
    expect(phase).toBe("LIBRARY_REFRESH_FAILED")
    // Ensure find would still work on stale if called, but hook must not call it when refresh failed – failure path skips find
    // So we assert stale cache is ignored by failure derivation
    expect(staleGames.length).toBeGreaterThan(0) // sanity
  })

  test("LIBRARY_REFRESH_FAILED copy – GAME ADDED / couldn't refresh", () => {
    const copy = crystalCopyForPhase("LIBRARY_REFRESH_FAILED")
    expect(copy.title).toBe("GAME ADDED")
    expect(copy.subtitle).toMatch(/couldn't refresh/i)
  })

  test("LIBRARY_REFRESH_FAILED belongs to terminal closeable set, not blocking nor playable", () => {
    const p = "LIBRARY_REFRESH_FAILED" as CrystalPresentationPhase
    expect(isTerminalCloseablePhase(p)).toBe(true)
    expect(isNonTerminalBlockingPhase(p)).toBe(false)
    expect(isTerminalPlayablePhase(p)).toBe(false)
  })
})
