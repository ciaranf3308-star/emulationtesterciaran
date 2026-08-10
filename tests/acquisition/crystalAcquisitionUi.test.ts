import { describe, test, expect } from "bun:test"
import {
  mapExternalToCrystalPhase,
  crystalCopyForPhase,
  errorCodeCopy,
  normalizeWindowsPath,
  findInstalledGame,
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

describe("V8.6C2 acquisitionUiController mapping + copy", () => {
  test("product-facing states mapping", () => {
    expect(mapExternalToCrystalPhase("IDLE")).toBe("IDLE")
    expect(mapExternalToCrystalPhase("STARTING_WATCH")).toBe("PREPARING")
    expect(mapExternalToCrystalPhase("OPENING_EXTERNAL_PAGE")).toBe("OPENING_GAME_PAGE")
    expect(mapExternalToCrystalPhase("WAITING_FOR_DOWNLOAD")).toBe("WAITING_FOR_DOWNLOAD")
    expect(mapExternalToCrystalPhase("DOWNLOAD_DETECTED")).toBe("DOWNLOAD_DETECTED")
    expect(mapExternalToCrystalPhase("WAITING_FOR_STABILITY")).toBe("FINISHING_DOWNLOAD")
    expect(mapExternalToCrystalPhase("IMPORTING")).toBe("ADDING_TO_LIBRARY")
    expect(mapExternalToCrystalPhase("INSTALLED")).toBe("REFRESHING_LIBRARY")
    expect(mapExternalToCrystalPhase("ALREADY_INSTALLED")).toBe("ALREADY_IN_LIBRARY")
    expect(mapExternalToCrystalPhase("COLLISION")).toBe("FILE_CONFLICT")
    expect(mapExternalToCrystalPhase("AMBIGUOUS")).toBe("MULTIPLE_DOWNLOADS_FOUND")
    expect(mapExternalToCrystalPhase("TIMED_OUT")).toBe("TIMED_OUT")
    expect(mapExternalToCrystalPhase("CANCELLED")).toBe("CANCELLED")
    expect(mapExternalToCrystalPhase("FAILED", { errorCode: "SAFE_MODE_BLOCKED_IMPORT" } as any)).toBe("SAFE_MODE")
    expect(mapExternalToCrystalPhase("FAILED", { errorCode: "TIMED_OUT" } as any)).toBe("TIMED_OUT")
    expect(mapExternalToCrystalPhase("FAILED", { errorCode: "COLLISION" } as any)).toBe("FILE_CONFLICT")
  })
  test("copy titles – polished Crystal", () => {
    expect(crystalCopyForPhase("PREPARING").title).toBe("PREPARING")
    expect(crystalCopyForPhase("OPENING_GAME_PAGE").title).toBe("OPENING GAME PAGE")
    expect(crystalCopyForPhase("WAITING_FOR_DOWNLOAD").title).toBe("WAITING FOR DOWNLOAD")
    expect(crystalCopyForPhase("DOWNLOAD_DETECTED").title).toBe("DOWNLOAD DETECTED")
    expect(crystalCopyForPhase("FINISHING_DOWNLOAD").title).toBe("FINISHING DOWNLOAD")
    expect(crystalCopyForPhase("ADDING_TO_LIBRARY").title).toBe("ADDING TO LIBRARY")
    expect(crystalCopyForPhase("READY_TO_PLAY").title).toBe("READY TO PLAY")
    expect(crystalCopyForPhase("ALREADY_IN_LIBRARY").title).toMatch(/ALREADY/)
    expect(crystalCopyForPhase("FILE_CONFLICT").title).toMatch(/CONFLICT|ALREADY/i)
    expect(crystalCopyForPhase("MULTIPLE_DOWNLOADS_FOUND").title).toMatch(/MULTIPLE/)
    expect(crystalCopyForPhase("FAILED").title).toMatch(/COULDN/)
    expect(crystalCopyForPhase("SAFE_MODE").title).toBe("SAFE MODE")
    expect(crystalCopyForPhase("TIMED_OUT").title).toBe("DOWNLOAD NOT FOUND")
  })
  test("errorCodeCopy mapping", () => {
    expect(errorCodeCopy("DOWNLOADS_DIRECTORY_UNAVAILABLE")?.title).toBe("DOWNLOADS FOLDER UNAVAILABLE")
    expect(errorCodeCopy("UNKNOWN_SYSTEM")?.title).toBe("SYSTEM NOT AVAILABLE")
    expect(errorCodeCopy("INVALID_EXTENSION")?.title).toBe("FILE TYPE NOT SUPPORTED")
    expect(errorCodeCopy("NO_VALID_ROM_IN_ARCHIVE")?.title).toBe("GAME FILE NOT RECOGNIZED")
    expect(errorCodeCopy("INCOMPLETE_CUE_SET")?.title).toBe("GAME FILES INCOMPLETE")
    expect(errorCodeCopy("COLLISION")?.title).toBe("FILE CONFLICT")
    expect(errorCodeCopy("SAFE_MODE_BLOCKED_IMPORT")?.title).toBe("SAFE MODE")
    expect(errorCodeCopy("EXTERNAL_PAGE_OPEN_FAILED")?.title).toBe("COULDN'T OPEN GAME PAGE")
    expect(errorCodeCopy("POLL_FAILED")?.title).toBe("CONNECTION TO CRYSTAL SERVICE LOST")
    expect(errorCodeCopy("TIMED_OUT")?.title).toBe("DOWNLOAD NOT FOUND")
  })
  test("normalizeWindowsPath handles casing/separators", () => {
    expect(normalizeWindowsPath("C:\\Users\\Test\\ROMs\\Game.zip")).toBe("c:/users/test/roms/game.zip")
    expect(normalizeWindowsPath("D:/Roms/Game.CUE")).toBe("d:/roms/game.cue")
    expect(normalizeWindowsPath("  GBC/Pokémon Crystal.gbc  ")).toBe("gbc/pokémon crystal.gbc")
  })
})

describe("V8.6C2 findInstalledGame – conservative authority order", () => {
  test("1. exact installedPaths vs refreshed rom_path normalized casing/separator – selects correct", () => {
    const games = [
      mkGame({ name: "Pokémon Crystal", rom_path: "D:\\Roms\\gbc\\Pokemon Crystal.gbc", system_id: "gbc" }),
      mkGame({ name: "Other", rom_path: "D:/Roms/gbc/Other.gbc", system_id: "gbc" }),
    ]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: ["d:/roms/gbc/Pokemon Crystal.gbc"],
      refreshedGames: games,
    })
    expect(res.found?.rom_path).toBe(games[0].rom_path)
  })
  test("multi-file CUE primary over BIN track", () => {
    const games = [
      mkGame({ name: "Game", rom_path: "Roms/ps2/Game.cue", system_id: "ps2" }),
      mkGame({ name: "Game (Track 01)", rom_path: "Roms/ps2/Game/track01.bin", system_id: "ps2" }),
    ]
    const res = findInstalledGame({
      systemId: "ps2",
      expectedTitle: "Game",
      installedPaths: ["Roms/ps2/Game/track01.bin", "Roms/ps2/Game.cue"],
      refreshedGames: games,
    })
    expect(res.found?.rom_path?.toLowerCase().endsWith(".cue")).toBe(true)
  })
  test("2. same systemId + exact normalized title only if exactly ONE", () => {
    const unique = [mkGame({ name: "Pokémon Crystal", rom_path: "a.gbc", system_id: "gbc" })]
    const res1 = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: [],
      refreshedGames: unique,
    })
    expect(res1.found?.name).toBe("Pokémon Crystal")
  })
  test("title fallback – two same-title => fail closed", () => {
    const games = [
      mkGame({ id: "1", name: "Mario", rom_path: "mario1.zip", system_id: "nes" }),
      mkGame({ id: "2", name: "Mario", rom_path: "mario2.zip", system_id: "nes" }),
    ]
    const res = findInstalledGame({
      systemId: "nes",
      expectedTitle: "Mario",
      installedPaths: [],
      refreshedGames: games,
    })
    expect(res.found).toBeNull()
    expect(res.reason).toBe("MULTIPLE_TITLE_MATCHES")
  })
  test("no candidate => not found", () => {
    const games = [mkGame({ name: "Other", rom_path: "other.zip", system_id: "gbc" })]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: ["C:/roms/notfound.gbc"],
      refreshedGames: games,
    })
    expect(res.found).toBeNull()
  })
  test("Windows case differences handled", () => {
    const games = [mkGame({ name: "Game", rom_path: "C:\\ROMS\\GBC\\GAME.GBC", system_id: "gbc" })]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Game",
      installedPaths: ["c:/roms/gbc/game.gbc"],
      refreshedGames: games,
    })
    expect(res.found).not.toBeNull()
  })
  test("slash/backslash normalization", () => {
    const games = [mkGame({ name: "Game", rom_path: "roms/gbc/game.gbc", system_id: "gbc" })]
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Game",
      installedPaths: ["roms\\gbc\\game.gbc"],
      refreshedGames: games,
    })
    expect(res.found).not.toBeNull()
  })
  test("title fallback only within target system exact unique – does not cross systems", () => {
    const games = [
      mkGame({ name: "Pokémon Crystal", rom_path: "gbc/game.gbc", system_id: "gbc" }),
      mkGame({ name: "Pokémon Crystal", rom_path: "nds/game.nds", system_id: "nds" }),
    ]
    const gbcOnly = games.filter((g:any) => g.system_id === "gbc")
    const res = findInstalledGame({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      installedPaths: [],
      refreshedGames: gbcOnly,
    })
    expect(res.found?.system_id).toBe("gbc")
  })
})
