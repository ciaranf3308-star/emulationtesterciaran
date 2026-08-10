/**
 * V8.6C1 – Generic External Acquisition Coordinator
 *
 * Provider-agnostic orchestration:
 *  selected game -> start existing B acquisition watch
 *  -> open user-facing external page via supplied callback
 *  -> poll B session while Crystal unfocused
 *  -> surface state changes
 *  -> cancel cleanly
 *
 * MUST NOT know provider name, hostname, URL construction, Discovery routing,
 * browser DOM, download endpoint.
 *
 * Mandatory ordering: BEGIN WATCH then OPEN PAGE.
 * Coordinator accepts openExternalPage: () => Promise<void>, NOT raw URL.
 *
 * No downloader logic, no HTML parsing, no scraping.
 */

import type { AcquisitionSession, AcquisitionState } from "./types"
import {
  beginAcquisitionWatch as defaultBegin,
  getAcquisitionWatchStatus as defaultGet,
  cancelAcquisitionWatch as defaultCancel,
} from "./acquisitionService"

export type ExternalAcquisitionPhase =
  | "IDLE"
  | "STARTING_WATCH"
  | "OPENING_EXTERNAL_PAGE"
  | "WAITING_FOR_DOWNLOAD"
  | "DOWNLOAD_DETECTED"
  | "WAITING_FOR_STABILITY"
  | "IMPORTING"
  | "INSTALLED"
  | "ALREADY_INSTALLED"
  | "COLLISION"
  | "AMBIGUOUS"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"

export interface ExternalAcquisitionState {
  coordinatorId: string
  systemId: string
  expectedTitle: string
  sessionId?: string | null
  phase: ExternalAcquisitionPhase
  acquisitionSession?: AcquisitionSession | null
  startedAt: number // ms epoch
  lastUpdatedAt: number // ms epoch
  errorCode?: string | null
  message?: string | null
}

export interface StartExternalAcquisitionOptions {
  systemId: string
  expectedTitle: string
  openExternalPage: () => Promise<void>
  onUpdate?: (state: ExternalAcquisitionState) => void
}

export interface ExternalAcquisitionDeps {
  beginAcquisitionWatch: (params: {
    systemId: string
    expectedTitle: string
    startedAt?: number
    customWatchDirectory?: string
    replaceExisting?: boolean
  }) => Promise<AcquisitionSession>
  getAcquisitionWatchStatus: (sessionId: string) => Promise<AcquisitionSession>
  cancelAcquisitionWatch: (sessionId: string) => Promise<AcquisitionSession>
  sleep?: (ms: number) => Promise<void>
}

export interface ExternalAcquisitionController {
  coordinatorId: string
  getState(): ExternalAcquisitionState
  subscribe(listener: (state: ExternalAcquisitionState) => void): () => void
  cancel(): Promise<ExternalAcquisitionState>
  done: Promise<ExternalAcquisitionState>
}

const TERMINAL_PHASES = new Set<ExternalAcquisitionPhase>([
  "INSTALLED",
  "ALREADY_INSTALLED",
  "COLLISION",
  "AMBIGUOUS",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
])

function isTerminalPhase(p: ExternalAcquisitionPhase): boolean {
  return TERMINAL_PHASES.has(p)
}

function translateBackendState(s: AcquisitionState): ExternalAcquisitionPhase {
  switch (s) {
    case "WATCHING":
      return "WAITING_FOR_DOWNLOAD"
    case "CANDIDATE_DETECTED":
      return "DOWNLOAD_DETECTED"
    case "WAITING_FOR_STABILITY":
      return "WAITING_FOR_STABILITY"
    case "READY":
      // No explicit READY presentation – still stabilizing/import prep
      return "WAITING_FOR_STABILITY"
    case "IMPORTING":
      return "IMPORTING"
    case "INSTALLED":
      return "INSTALLED"
    case "ALREADY_INSTALLED":
      return "ALREADY_INSTALLED"
    case "COLLISION":
      return "COLLISION"
    case "AMBIGUOUS":
      return "AMBIGUOUS"
    case "FAILED":
      return "FAILED"
    case "CANCELLED":
      return "CANCELLED"
    case "TIMED_OUT":
      return "TIMED_OUT"
    default:
      return "WAITING_FOR_DOWNLOAD"
  }
}

function extractCode(err: unknown, fallback: string): { code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err ?? fallback)
  const colon = msg.indexOf(":")
  let code = fallback
  if (colon > 0) {
    const maybe = msg.slice(0, colon).trim()
    // codes are SCREAMING_SNAKE
    if (/^[A-Z0-9_]+$/.test(maybe)) code = maybe
  } else if (/^[A-Z0-9_]+$/.test(msg.trim().split(" ")[0] ?? "")) {
    const first = msg.trim().split(" ")[0] as string
    if (first.length <= 40) code = first
  }
  return { code, message: msg }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

function genCoordinatorId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID()
    }
  } catch {}
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Singleton active coordinator tracking for V8.6
let activeImpl: Impl | null = null

function defaultDeps(): ExternalAcquisitionDeps {
  return {
    beginAcquisitionWatch: (p) => defaultBegin(p as any),
    getAcquisitionWatchStatus: (id) => defaultGet(id),
    cancelAcquisitionWatch: (id) => defaultCancel(id),
    sleep: defaultSleep,
  }
}

class Impl {
  readonly coordinatorId: string
  readonly systemId: string
  readonly expectedTitle: string
  sessionId: string | null = null
  phase: ExternalAcquisitionPhase = "IDLE"
  acquisitionSession: AcquisitionSession | null = null
  startedAt: number
  lastUpdatedAt: number
  errorCode: string | null = null
  message: string | null = null

  listeners = new Set<(s: ExternalAcquisitionState) => void>()

  cancelled = false
  generation = 0
  statusFailureCount = 0
  maxStatusFailures = 3

  pollIntervalMs = 850 // 750-1000 spec
  transientRetryDelayMs = 300

  deps: ExternalAcquisitionDeps
  openExternalPage: () => Promise<void>

  private doneResolver!: (v: ExternalAcquisitionState) => void
  donePromise: Promise<ExternalAcquisitionState>

  private backendCancelCalled = false

  constructor(
    coordinatorId: string,
    systemId: string,
    expectedTitle: string,
    openExternalPage: () => Promise<void>,
    deps: ExternalAcquisitionDeps
  ) {
    this.coordinatorId = coordinatorId
    this.systemId = systemId
    this.expectedTitle = expectedTitle
    this.openExternalPage = openExternalPage
    this.deps = deps
    this.startedAt = Date.now()
    this.lastUpdatedAt = this.startedAt

    this.donePromise = new Promise<ExternalAcquisitionState>((res) => {
      this.doneResolver = res
    })
  }

  getState(): ExternalAcquisitionState {
    return {
      coordinatorId: this.coordinatorId,
      systemId: this.systemId,
      expectedTitle: this.expectedTitle,
      sessionId: this.sessionId,
      phase: this.phase,
      acquisitionSession: this.acquisitionSession,
      startedAt: this.startedAt,
      lastUpdatedAt: this.lastUpdatedAt,
      errorCode: this.errorCode,
      message: this.message,
    }
  }

  emit(): void {
    this.lastUpdatedAt = Date.now()
    const snapshot = this.getState()
    for (const l of this.listeners) {
      try {
        l(snapshot)
      } catch {
        // swallow listener errors – coordinator must not break
      }
    }
  }

  setPhase(
    phase: ExternalAcquisitionPhase,
    opts?: {
      acquisitionSession?: AcquisitionSession | null
      errorCode?: string | null
      message?: string | null
      sessionId?: string | null
    }
  ): void {
    this.phase = phase
    if (opts?.acquisitionSession !== undefined) this.acquisitionSession = opts.acquisitionSession
    if (opts?.errorCode !== undefined) this.errorCode = opts.errorCode
    if (opts?.message !== undefined) this.message = opts.message
    if (opts?.sessionId !== undefined) this.sessionId = opts.sessionId
    this.emit()

    if (isTerminalPhase(phase)) {
      // Resolve done exactly once
      try {
        this.doneResolver(this.getState())
      } catch {}
      // Clear active singleton if this is active
      if (activeImpl === this) {
        activeImpl = null
      }
    }
  }

  subscribe(listener: (s: ExternalAcquisitionState) => void): () => void {
    this.listeners.add(listener)
    // Immediate update per spec
    try {
      listener(this.getState())
    } catch {}
    return () => {
      this.listeners.delete(listener)
    }
  }

  async cancel(): Promise<ExternalAcquisitionState> {
    if (isTerminalPhase(this.phase)) {
      return this.getState()
    }
    this.cancelled = true
    this.generation++ // invalidate in-flight polls
    if (this.sessionId && !this.backendCancelCalled) {
      this.backendCancelCalled = true
      try {
        await this.deps.cancelAcquisitionWatch(this.sessionId)
      } catch {
        // best-effort
      }
    }
    if (!isTerminalPhase(this.phase)) {
      this.setPhase("CANCELLED", {
        errorCode: "CANCELLED",
        message: "External acquisition cancelled by user",
      })
    }
    return this.getState()
  }

  async start(): Promise<void> {
    const sleep = this.deps.sleep ?? defaultSleep

    // ---- Frontend basic validation ----
    if (!this.systemId || !this.systemId.trim()) {
      this.setPhase("FAILED", {
        errorCode: "SYSTEM_ID_EMPTY",
        message: "SYSTEM_ID_EMPTY: systemId is required",
      })
      return
    }
    if (!this.expectedTitle || !this.expectedTitle.trim()) {
      this.setPhase("FAILED", {
        errorCode: "EXPECTED_TITLE_EMPTY",
        message: "EXPECTED_TITLE_EMPTY: expectedTitle is required",
      })
      return
    }

    // ---- 1. Begin B watch ----
    this.setPhase("STARTING_WATCH")
    let session: AcquisitionSession
    try {
      session = await this.deps.beginAcquisitionWatch({
        systemId: this.systemId,
        expectedTitle: this.expectedTitle,
      })
    } catch (e) {
      const { code, message } = extractCode(e, "ACQUISITION_WATCH_START_FAILED")
      this.setPhase("FAILED", { errorCode: code, message })
      return
    }

    this.sessionId = session.sessionId
    this.acquisitionSession = session
    // Translate initial watch state (typically WATCHING -> WAITING_FOR_DOWNLOAD) but we move to OPENING_EXTERNAL_PAGE next
    const initialPhase = translateBackendState(session.state as AcquisitionState)

    this.setPhase("OPENING_EXTERNAL_PAGE", {
      acquisitionSession: session,
      sessionId: session.sessionId,
      // preserve initialPhase if needed? we go through OPENING_EXTERNAL_PAGE explicitly
    })
    // Notify with initial backend status for C2 prep
    this.emit()

    // ---- 2. Open external page (must after watch) ----
    try {
      await this.openExternalPage()
    } catch (e) {
      const { message: underlying } = extractCode(e, "EXTERNAL_PAGE_OPEN_FAILED")
      // Cancel watcher best-effort, no zombie
      if (this.sessionId && !this.backendCancelCalled) {
        this.backendCancelCalled = true
        try {
          await this.deps.cancelAcquisitionWatch(this.sessionId)
        } catch {}
      }
      this.setPhase("FAILED", {
        errorCode: "EXTERNAL_PAGE_OPEN_FAILED",
        message: `EXTERNAL_PAGE_OPEN_FAILED: ${underlying}`,
      })
      return
    }

    // After open success, set to waiting for download if still same generation
    if (this.cancelled || this.generation !== 0 && this.generation > 0 && isTerminalPhase(this.phase)) {
      return
    }
    if (!isTerminalPhase(this.phase)) {
      this.setPhase(initialPhase === "WAITING_FOR_DOWNLOAD" ? "WAITING_FOR_DOWNLOAD" : initialPhase, {
        acquisitionSession: session,
      })
      // Explicit ensure we are in waiting state for browser interaction
      if (this.phase === "OPENING_EXTERNAL_PAGE") {
        this.setPhase("WAITING_FOR_DOWNLOAD", { acquisitionSession: session })
      }
    }

    // ---- 3. Polling loop ----
    const currentGen = this.generation
    this.statusFailureCount = 0

    while (true) {
      if (this.cancelled) break
      if (this.generation !== currentGen) break
      if (isTerminalPhase(this.phase)) break

      let status: AcquisitionSession
      try {
        if (!this.sessionId) break
        status = await this.deps.getAcquisitionWatchStatus(this.sessionId)
        this.statusFailureCount = 0
      } catch (e) {
        this.statusFailureCount++
        if (this.statusFailureCount <= this.maxStatusFailures) {
          // transient retry
          await sleep(this.transientRetryDelayMs)
          continue
        }
        // exhausted retries -> fail cleanly, attempt backend cancel best-effort
        if (this.sessionId && !this.backendCancelCalled) {
          this.backendCancelCalled = true
          try {
            await this.deps.cancelAcquisitionWatch(this.sessionId)
          } catch {}
        }
        const { code, message } = extractCode(e, "POLL_FAILED")
        if (!this.cancelled && this.generation === currentGen && !isTerminalPhase(this.phase)) {
          this.setPhase("FAILED", { errorCode: code, message })
        }
        break
      }

      // Generation check – ignore stale results after cancel
      if (this.generation !== currentGen) break
      if (this.cancelled) break

      const translated = translateBackendState(status.state as AcquisitionState)
      const isTerminal = isTerminalPhase(translated)

      this.acquisitionSession = status
      if (isTerminal) {
        this.setPhase(translated, {
          acquisitionSession: status,
          errorCode: status.errorCode ?? (translated === "FAILED" ? "FAILED" : null),
          message: status.message ?? null,
        })
        break
      } else {
        // non-terminal progress
        if (translated !== this.phase) {
          this.setPhase(translated, { acquisitionSession: status })
        } else {
          // same phase – still update session/context
          this.acquisitionSession = status
          this.emit()
        }
      }

      await sleep(this.pollIntervalMs)
    }

  }
}

export function startExternalAcquisition(
  opts: StartExternalAcquisitionOptions,
  depsOverride?: Partial<ExternalAcquisitionDeps>
): ExternalAcquisitionController {
  if (activeImpl && !isTerminalPhase(activeImpl.phase)) {
    const err: any = new Error(
      "EXTERNAL_ACQUISITION_ALREADY_ACTIVE: an external acquisition is already active"
    )
    err.code = "EXTERNAL_ACQUISITION_ALREADY_ACTIVE"
    throw err
  }

  const coordinatorId = genCoordinatorId()
  const deps: ExternalAcquisitionDeps = {
    ...defaultDeps(),
    ...(depsOverride as any),
  }

  const impl = new Impl(
    coordinatorId,
    opts.systemId,
    opts.expectedTitle,
    opts.openExternalPage,
    deps
  )

  // Optional onUpdate hook
  if (opts.onUpdate) {
    impl.subscribe(opts.onUpdate)
  }

  activeImpl = impl

  // Kick off async start without blocking creation – but expose done promise
  // Defer start to next microtask so controller is returned immediately and listeners can attach
  // However mandatory ordering still enforced internally: beginAcquisitionWatch resolves before openExternalPage
  setTimeout(() => {
    impl.start().catch((e) => {
      const { code, message } = extractCode(e, "FAILED")
      if (!isTerminalPhase(impl.phase)) {
        impl.setPhase("FAILED", { errorCode: code, message })
      }
    })
  }, 0)

  const controller: ExternalAcquisitionController = {
    coordinatorId,
    getState: () => impl.getState(),
    subscribe: (l) => impl.subscribe(l),
    cancel: () => impl.cancel(),
    done: impl.donePromise,
  }

  return controller
}

export function cancelExternalAcquisition(coordinatorId?: string): Promise<ExternalAcquisitionState | null> {
  if (!activeImpl) return Promise.resolve(null)
  if (coordinatorId && activeImpl.coordinatorId !== coordinatorId) {
    return Promise.resolve(null)
  }
  return activeImpl.cancel()
}

export function getActiveExternalAcquisitionState(): ExternalAcquisitionState | null {
  return activeImpl ? activeImpl.getState() : null
}

/**
 * Test-only helpers
 */
export function __resetForTests(): void {
  if (activeImpl) {
    // Cancel best-effort but don't await backend in test reset to avoid mock leakage
    activeImpl.cancelled = true
    activeImpl.generation++
  }
  activeImpl = null
}

export function __setActiveImplForTests(impl: Impl | null): void {
  activeImpl = impl as any
}

export const __testables = {
  isTerminalPhase,
  translateBackendState,
  extractCode,
}
