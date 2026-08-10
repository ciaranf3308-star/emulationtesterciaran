/**
 * V8.6C2 – React hook wrapping C1 coordinator + C2 library refresh + selection + transition
 * Thin, product-aware: injects real library refresh, conservative find, auto transition to Library via callbacks.
 */

import { useCallback, useRef, useState, useEffect, useMemo } from "react"
import type { ExternalAcquisitionState, ExternalAcquisitionController } from "./externalAcquisition"
import { startExternalAcquisition } from "./externalAcquisition"
import {
  mapExternalToCrystalPhase,
  crystalCopyForPhase,
  findInstalledGame,
  type CrystalPresentationPhase,
} from "./acquisitionUiController"
import type { GameEntry } from "../runtime/backend"
import { normalizeTitle as normalizeTitleExact } from "./candidateMatcher"

export type UseCrystalAcquisitionOpts = {
  refreshLibrary?: (systemId: string) => Promise<GameEntry[]>
  onGameFound?: (systemId: string, game: GameEntry) => void
  onRefreshComplete?: (systemId: string, games: GameEntry[]) => void
  deps?: {
    beginAcquisitionWatch?: any
    getAcquisitionWatchStatus?: any
    cancelAcquisitionWatch?: any
    sleep?: (ms:number)=>Promise<void>
  }
}

export type CrystalAcquisitionHook = {
  active: boolean
  externalState: ExternalAcquisitionState | null
  crystalPhase: CrystalPresentationPhase
  copy: ReturnType<typeof crystalCopyForPhase>
  foundGame: GameEntry | null
  refreshStatus: "idle" | "refreshing" | "done" | "failed"
  errorDetail?: string | null
  begin: (req: { systemId: string; expectedTitle: string; openExternalPage: () => Promise<void> }) => ExternalAcquisitionController
  cancel: () => Promise<void>
  close: () => void
  controllerRef: React.MutableRefObject<ExternalAcquisitionController | null>
}

export function useCrystalAcquisition(opts: UseCrystalAcquisitionOpts = {}): CrystalAcquisitionHook {
  const { refreshLibrary, onGameFound, onRefreshComplete, deps } = opts

  const controllerRef = useRef<ExternalAcquisitionController | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const refreshTriggeredRef = useRef(false)
  const [extState, setExtState] = useState<ExternalAcquisitionState | null>(null)
  const [found, setFound] = useState<GameEntry | null>(null)
  const [refreshStatus, setRefreshStatus] = useState<"idle"|"refreshing"|"done"|"failed">("idle")
  const [errorDetail, setErrorDetail] = useState<string|null>(null)

  const crystalPhase = useMemo<CrystalPresentationPhase>(() => {
    if (!extState) return "IDLE"
    const base = mapExternalToCrystalPhase(extState.phase as any, { errorCode: extState.errorCode })
    // Product-level overrides after refresh
    if (extState.phase === "INSTALLED") {
      if (refreshStatus === "refreshing") return "REFRESHING_LIBRARY"
      if (refreshStatus === "done") {
        if (found) return "READY_TO_PLAY"
        if (errorDetail === "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH") return "INSTALLED_GAME_NOT_FOUND"
        // no found yet but refresh done indicates fallback to ready? treat as READY still if no error?
        // conservative: stay REFRESHING briefly then fall to READY if found else NOT_FOUND
        return "REFRESHING_LIBRARY"
      }
    }
    if (extState.phase === "ALREADY_INSTALLED") {
      if (refreshStatus === "refreshing") return "ALREADY_IN_LIBRARY" // spec locates → library while refreshing; keep ALREADY title
      if (refreshStatus === "done" && found) return "READY_TO_PLAY" // unified PLAY path – still valid for ALREADY, allows A PLAY
      // if ALREADY but not found yet after refresh, stay ALREADY – will become PLAY when found
    }
    if (extState.phase === "FAILED" && errorDetail === "INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH") {
      return "INSTALLED_GAME_NOT_FOUND"
    }
    return base
  }, [extState, refreshStatus, found, errorDetail])

  const copy = useMemo(() => {
    if (!extState) return crystalCopyForPhase("IDLE")
    return crystalCopyForPhase(crystalPhase as any, { errorCode: extState.errorCode as any, message: extState.message, expectedTitle: extState.expectedTitle })
  }, [extState, crystalPhase, refreshStatus, errorDetail])

  const triggerRefreshAndLocate = useCallback(async (state: ExternalAcquisitionState) => {
    const session = state.acquisitionSession as any
    const importRes = session?.importResult as any
    const systemId = state.systemId
    const expectedTitle = state.expectedTitle

    const isInstalled = state.phase === "INSTALLED"
    const isAlready = state.phase === "ALREADY_INSTALLED"
    if (!isInstalled && !isAlready) return

    if (!refreshLibrary) {
      setErrorDetail("NO_REFRESH_FN")
      return
    }

    try {
      setRefreshStatus("refreshing")
      const games = await refreshLibrary(systemId)
      setRefreshStatus("done")
      onRefreshComplete?.(systemId, games)

      const installedPaths: string[] | undefined = importRes?.installedPaths ?? (session?.selectedCandidate ? [session.selectedCandidate] : undefined)

      const finder = findInstalledGame({
        systemId,
        expectedTitle,
        installedPaths: installedPaths as any,
        refreshedGames: games,
        normalizeTitleFn: normalizeTitleExact,
      })

      if (finder.found) {
        setFound(finder.found)
        onGameFound?.(systemId, finder.found)
      } else {
        setFound(null)
        setErrorDetail("INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH")
      }
    } catch (e: any) {
      setRefreshStatus("failed")
      setErrorDetail(e?.message || "REFRESH_FAILED")
    }
  }, [refreshLibrary, onGameFound, onRefreshComplete])

  const begin = useCallback((req: { systemId: string; expectedTitle: string; openExternalPage: () => Promise<void> }) => {
    if (controllerRef.current) {
      try {
        const existing = controllerRef.current.getState()
        const terms = ["INSTALLED","ALREADY_INSTALLED","COLLISION","AMBIGUOUS","FAILED","CANCELLED","TIMED_OUT"] as any[]
        if (!terms.includes(existing.phase)) {
          const err: any = new Error("EXTERNAL_ACQUISITION_ALREADY_ACTIVE: an external acquisition is already active")
          err.code = "EXTERNAL_ACQUISITION_ALREADY_ACTIVE"
          throw err
        }
      } catch (e) {
        if ((e as any)?.code === "EXTERNAL_ACQUISITION_ALREADY_ACTIVE") throw e
      }
      // If prior terminal, clean previous unsubscribe
      if (unsubscribeRef.current) { try { unsubscribeRef.current() } catch {} ; unsubscribeRef.current = null }
    }

    setExtState(null)
    setFound(null)
    setRefreshStatus("idle")
    setErrorDetail(null)
    refreshTriggeredRef.current = false

    const ctrl = startExternalAcquisition(
      {
        systemId: req.systemId,
        expectedTitle: req.expectedTitle,
        openExternalPage: req.openExternalPage,
      },
      deps as any
    )

    controllerRef.current = ctrl

    const unsub = ctrl.subscribe((s) => {
      setExtState(s)
      if (s.phase === "INSTALLED" || s.phase === "ALREADY_INSTALLED") {
        if (!refreshTriggeredRef.current) {
          refreshTriggeredRef.current = true
          // microtask – ensures state committed before refresh
          setTimeout(() => triggerRefreshAndLocate(s), 0)
        }
      }
    })
    unsubscribeRef.current = unsub as any

    // immediate sync to avoid flicker
    setExtState(ctrl.getState())

    return ctrl
  }, [deps, triggerRefreshAndLocate])

  const cancel = useCallback(async () => {
    const ctrl = controllerRef.current
    if (!ctrl) return
    try { await ctrl.cancel() } catch {}
  }, [])

  const close = useCallback(() => {
    const ctrl = controllerRef.current
    if (ctrl) {
      const st = ctrl.getState()
      const terminal = (["INSTALLED","ALREADY_INSTALLED","COLLISION","AMBIGUOUS","FAILED","CANCELLED","TIMED_OUT"] as any).includes(st.phase)
      if (!terminal) { try { ctrl.cancel() } catch {} }
      if (unsubscribeRef.current) { try { unsubscribeRef.current() } catch {} ; unsubscribeRef.current=null }
    }
    setExtState(null)
    setFound(null)
    setRefreshStatus("idle")
    setErrorDetail(null)
    refreshTriggeredRef.current = false
    controllerRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) { try { unsubscribeRef.current() } catch {} ; unsubscribeRef.current=null }
      controllerRef.current = null
    }
  }, [])

  const isNonDismissed = extState !== null

  return {
    active: isNonDismissed,
    externalState: extState,
    crystalPhase,
    copy,
    foundGame: found,
    refreshStatus,
    errorDetail,
    begin,
    cancel,
    close,
    controllerRef,
  }
}

export default useCrystalAcquisition
