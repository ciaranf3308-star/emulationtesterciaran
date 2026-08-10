/**
 * V8.6C2 – Acquisition UI Bridge
 * Thin React-facing layer over generic C1 coordinator.
 * Provider-agnostic: still accepts openExternalPage: () => Promise<void>.
 * No provider URL, no scraping.
 */

import type { ExternalAcquisitionState, ExternalAcquisitionController, ExternalAcquisitionPhase } from "./externalAcquisition"
import { startExternalAcquisition, cancelExternalAcquisition } from "./externalAcquisition"
import type { AcquisitionSession } from "./types"
import { normalizeTitle as normalizeTitleExact } from "./candidateMatcher"
import type { GameEntry } from "../runtime/backend"

// Crystal product-facing presentation phases
export type CrystalPresentationPhase =
  | "IDLE"
  | "PREPARING"
  | "OPENING_GAME_PAGE"
  | "WAITING_FOR_DOWNLOAD"
  | "DOWNLOAD_DETECTED"
  | "FINISHING_DOWNLOAD"
  | "ADDING_TO_LIBRARY"
  | "REFRESHING_LIBRARY"
  | "READY_TO_PLAY"
  | "ALREADY_IN_LIBRARY"
  | "FILE_CONFLICT"
  | "MULTIPLE_DOWNLOADS_FOUND"
  | "FAILED"
  | "SAFE_MODE"
  | "TIMED_OUT"
  | "CANCELLED"
  | "INSTALLED_GAME_NOT_FOUND"
  | "LIBRARY_REFRESH_FAILED"

export type CrystalAcquisitionCopy = {
  title: string
  subtitle?: string
  titleDetail?: string // secondary small line
}

export interface BeginCrystalAcquisitionRequest {
  systemId: string
  expectedTitle: string
  openExternalPage: () => Promise<void>
}

export type RefreshFn = (systemId: string) => Promise<GameEntry[]>
export type FindResult = { found: GameEntry | null; reason?: string }

const TERMINAL_CRYSTAL = new Set<CrystalPresentationPhase>([
  "READY_TO_PLAY", "FILE_CONFLICT", "MULTIPLE_DOWNLOADS_FOUND", "FAILED", "SAFE_MODE", "TIMED_OUT", "CANCELLED", "INSTALLED_GAME_NOT_FOUND", "LIBRARY_REFRESH_FAILED"
])

export function isCrystalTerminal(p: CrystalPresentationPhase): boolean {
  return TERMINAL_CRYSTAL.has(p)
}

export function mapExternalToCrystalPhase(ext: ExternalAcquisitionPhase, opts?: { errorCode?: string | null }): CrystalPresentationPhase {
  switch (ext) {
    case "IDLE": return "IDLE"
    case "STARTING_WATCH": return "PREPARING"
    case "OPENING_EXTERNAL_PAGE": return "OPENING_GAME_PAGE"
    case "WAITING_FOR_DOWNLOAD": return "WAITING_FOR_DOWNLOAD"
    case "DOWNLOAD_DETECTED": return "DOWNLOAD_DETECTED"
    case "WAITING_FOR_STABILITY": return "FINISHING_DOWNLOAD"
    case "IMPORTING": return "ADDING_TO_LIBRARY"
    case "INSTALLED": return "REFRESHING_LIBRARY"
    case "ALREADY_INSTALLED": return "ALREADY_IN_LIBRARY"
    case "COLLISION": return "FILE_CONFLICT"
    case "AMBIGUOUS": return "MULTIPLE_DOWNLOADS_FOUND"
    case "TIMED_OUT": return "TIMED_OUT"
    case "CANCELLED": return "CANCELLED"
    case "FAILED": {
      const code = opts?.errorCode
      if (code === "SAFE_MODE_BLOCKED_IMPORT") return "SAFE_MODE"
      if (code === "TIMED_OUT") return "TIMED_OUT"
      if (code === "COLLISION") return "FILE_CONFLICT"
      return "FAILED"
    }
    default: return "WAITING_FOR_DOWNLOAD"
  }
}

export function crystalCopyForPhase(phase: CrystalPresentationPhase, opts?: { errorCode?: string | null; message?: string | null; expectedTitle?: string }): CrystalAcquisitionCopy {
  switch (phase) {
    case "PREPARING": return { title: "PREPARING" }
    case "OPENING_GAME_PAGE": return { title: "OPENING GAME PAGE" }
    case "WAITING_FOR_DOWNLOAD":
      return { title: "WAITING FOR DOWNLOAD", subtitle: "Complete the download in your browser.\nCrystal will take it from there." }
    case "DOWNLOAD_DETECTED": return { title: "DOWNLOAD DETECTED" }
    case "FINISHING_DOWNLOAD": return { title: "FINISHING DOWNLOAD" }
    case "ADDING_TO_LIBRARY": return { title: "ADDING TO LIBRARY" }
    case "REFRESHING_LIBRARY": return { title: "REFRESHING LIBRARY" }
    case "READY_TO_PLAY": return { title: "READY TO PLAY" }
    case "ALREADY_IN_LIBRARY": return { title: "ALREADY IN YOUR LIBRARY" }
    case "FILE_CONFLICT": return { title: "FILE CONFLICT", subtitle: "A different file with this name is already in your library." }
    case "MULTIPLE_DOWNLOADS_FOUND": return { title: "MULTIPLE DOWNLOADS FOUND", subtitle: "Crystal couldn't safely determine which file belongs to this game." }
    case "SAFE_MODE": return { title: "SAFE MODE", subtitle: "Game detected, but adding games is disabled." }
    case "TIMED_OUT": {
      const map = errorCodeCopy(opts?.errorCode)
      if (map) return map
      return { title: "DOWNLOAD NOT FOUND", subtitle: "Crystal didn't see a matching download." }
    }
    case "CANCELLED": return { title: "CANCELLED" }
    case "INSTALLED_GAME_NOT_FOUND": return { title: "GAME ADDED", subtitle: "Crystal couldn't select it automatically." }
    case "LIBRARY_REFRESH_FAILED": return { title: "GAME ADDED", subtitle: "Crystal couldn't refresh your library." }
    case "FAILED": {
      const mapped = errorCodeCopy(opts?.errorCode)
      if (mapped) return mapped
      const code = opts?.errorCode
      const base: CrystalAcquisitionCopy = code && code !== "FAILED" ? { title: "COULDN'T ADD GAME", titleDetail: code } : { title: "COULDN'T ADD GAME" }
      if (opts?.message && !code) base.subtitle = opts.message.slice(0, 160)
      return base
    }
    default: return { title: phase }
  }
}

export function errorCodeCopy(code?: string | null): CrystalAcquisitionCopy | null {
  if (!code) return null
  const c = code.toUpperCase()
  const mapping: Record<string, CrystalAcquisitionCopy> = {
    "DOWNLOADS_DIRECTORY_UNAVAILABLE": { title: "DOWNLOADS FOLDER UNAVAILABLE", subtitle: "Crystal couldn't access your Downloads folder." },
    "DOWNLOADS_FOLDER_UNAVAILABLE": { title: "DOWNLOADS FOLDER UNAVAILABLE" },
    "UNKNOWN_SYSTEM": { title: "SYSTEM NOT AVAILABLE" },
    "SYSTEM_ID_EMPTY": { title: "SYSTEM NOT AVAILABLE" },
    "EXPECTED_TITLE_EMPTY": { title: "COULDN'T ADD GAME", titleDetail: code },
    "INVALID_EXTENSION": { title: "FILE TYPE NOT SUPPORTED" },
    "NO_VALID_ROM_IN_ARCHIVE": { title: "GAME FILE NOT RECOGNIZED" },
    "INCOMPLETE_CUE_SET": { title: "GAME FILES INCOMPLETE" },
    "COLLISION": { title: "FILE CONFLICT", subtitle: "A different file with this name is already in your library." },
    "SAFE_MODE_BLOCKED_IMPORT": { title: "SAFE MODE", subtitle: "Game detected, but adding games is disabled." },
    "EXTERNAL_PAGE_OPEN_FAILED": { title: "COULDN'T OPEN GAME PAGE" },
    "POLL_FAILED": { title: "CONNECTION TO CRYSTAL SERVICE LOST", subtitle: "Crystal lost connection to its background service." },
    "TIMED_OUT": { title: "DOWNLOAD NOT FOUND" },
    "EXTERNAL_ACQUISITION_ALREADY_ACTIVE": { title: "ALREADY ACTIVE", subtitle: "One acquisition at a time." },
    "ACQUISITION_WATCH_START_FAILED": { title: "COULDN'T ADD GAME" },
    "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH": { title: "GAME ADDED", subtitle: "Crystal couldn't select it automatically." },
    "LIBRARY_REFRESH_FAILED": { title: "GAME ADDED", subtitle: "Crystal couldn't refresh your library." },
  }
  return mapping[c] || null
}

// Windows path handling
export function normalizeWindowsPath(p: string): string {
  if (!p) return ""
  let s = p.trim()
  s = s.replace(/\\/g, "/")
  // lowercase for case-insensitive comparison
  s = s.toLowerCase()
  // collapse // except leading?
  s = s.replace(/\/+/g, "/")
  return s
}

function isPrimaryDescriptor(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith(".cue") || lower.endsWith(".m3u") || lower.endsWith(".gdi") // primary descriptors preferred over bin track
}

function isSupportingTrack(path: string): boolean {
  const lower = path.toLowerCase()
  // bin tracks commonly supporting
  return lower.endsWith(".bin") || lower.endsWith(".track") || lower.endsWith(".iso") && false // iso is actually game but treat as primary generally
}

// Conservative installed game finder
export function findInstalledGame(params: {
  systemId: string
  expectedTitle: string
  installedPaths?: string[] | null
  refreshedGames: GameEntry[]
  normalizeTitleFn?: (s: string) => string
  importResultGetter?: (session?: AcquisitionSession | null) => any
}): FindResult {
  const { systemId, expectedTitle, installedPaths, refreshedGames } = params
  const normFn = params.normalizeTitleFn ?? normalizeTitleExact

  // 1. Exact installed path authority ONLY – no basename fallback, no Downloads source
  if (installedPaths && installedPaths.length > 0 && refreshedGames.length > 0) {
    // Prefer primary descriptors over supporting tracks
    const ordered = [...installedPaths].sort((a, b) => {
      const aPrim = isPrimaryDescriptor(a) ? 0 : isSupportingTrack(a) ? 2 : 1
      const bPrim = isPrimaryDescriptor(b) ? 0 : isSupportingTrack(b) ? 2 : 1
      return aPrim - bPrim
    })

    // Build lookup map for refreshed games normalized paths
    const gamePathMap = new Map<string, GameEntry>()
    for (const g of refreshedGames) {
      if (!g.rom_path) continue
      const normRom = normalizeWindowsPath(g.rom_path)
      gamePathMap.set(normRom, g)
    }

    for (const ip of ordered) {
      const normIp = normalizeWindowsPath(ip)
      const byExact = gamePathMap.get(normIp)
      if (byExact) {
        return { found: byExact }
      }
    }
  }

  // 2. Title fallback – same systemId + exact normalized expected title only if exactly ONE
  const normExpected = normFn(expectedTitle)
  if (!normExpected) return { found: null, reason: "NO_UNIQUE_MATCH" }

  const sameSystem = refreshedGames.filter(g => {
    // refreshedGames already filtered per-system by caller typically – but double-check system_id match if present
    if ((g as any).system_id && systemId && (g as any).system_id !== systemId) return false
    return true
  })

  const titleMatches = sameSystem.filter(g => {
    const n = normFn(g.name)
    return n === normExpected
  })

  if (titleMatches.length === 1) {
    return { found: titleMatches[0] }
  }
  if (titleMatches.length === 0) {
    return { found: null, reason: "NO_MATCH" }
  }
  // >1 candidates => fail closed
  return { found: null, reason: "MULTIPLE_TITLE_MATCHES" }
}

export function isTerminalExternalPhase(p: ExternalAcquisitionPhase): boolean {
  return (["INSTALLED","ALREADY_INSTALLED","COLLISION","AMBIGUOUS","FAILED","CANCELLED","TIMED_OUT"] as string[]).includes(p)
}

// Product wrapper class for thin React layer – dependency injectable for tests

export interface CrystalAcquisitionControllerHandle {
  coordinatorId: string
  getExternalState(): ExternalAcquisitionState
  subscribe(listener: (state: ExternalAcquisitionState, crystalPhase: CrystalPresentationPhase, copy: CrystalAcquisitionCopy) => void): () => void
  cancel(): Promise<ExternalAcquisitionState>
  done: Promise<ExternalAcquisitionState>
}

export function beginCrystalAcquisition(
  req: BeginCrystalAcquisitionRequest,
  deps?: {
    beginAcquisitionWatch?: any
    getAcquisitionWatchStatus?: any
    cancelAcquisitionWatch?: any
    sleep?: (ms:number)=>Promise<void>
  }
): ExternalAcquisitionController {
  // Delegates to generic coordinator – provider agnostic
  const ctrl = startExternalAcquisition(
    {
      systemId: req.systemId,
      expectedTitle: req.expectedTitle,
      openExternalPage: req.openExternalPage,
    },
    deps as any
  )
  return ctrl
}

export { startExternalAcquisition, cancelExternalAcquisition }

// Higher-level helper used by tests to map copy
export function deriveCrystalCopy(extState: ExternalAcquisitionState): CrystalAcquisitionCopy {
  const phase = mapExternalToCrystalPhase(extState.phase, { errorCode: extState.errorCode })
  return crystalCopyForPhase(phase, { errorCode: extState.errorCode, message: extState.message, expectedTitle: extState.expectedTitle })
}


// Controller behavior helpers – exported for testability and App nav guard reuse
export function isNonTerminalBlockingPhase(p: CrystalPresentationPhase): boolean {
  return ["PREPARING","OPENING_GAME_PAGE","WAITING_FOR_DOWNLOAD","DOWNLOAD_DETECTED","FINISHING_DOWNLOAD","ADDING_TO_LIBRARY","REFRESHING_LIBRARY","ALREADY_IN_LIBRARY"].includes(p as any)
}
export function isTerminalCloseablePhase(p: CrystalPresentationPhase): boolean {
  return ["FILE_CONFLICT","MULTIPLE_DOWNLOADS_FOUND","FAILED","SAFE_MODE","TIMED_OUT","INSTALLED_GAME_NOT_FOUND","LIBRARY_REFRESH_FAILED","CANCELLED"].includes(p as any)
}
export function isTerminalPlayablePhase(p: CrystalPresentationPhase): boolean {
  return (p as any)==="READY_TO_PLAY"
}
export function shouldBlockConfirmDuringWaiting(p: CrystalPresentationPhase): boolean {
  return isNonTerminalBlockingPhase(p)
}
