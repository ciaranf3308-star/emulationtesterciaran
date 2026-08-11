/**
 * CRYSTAL FRONTEND — V8.6B Acquisition Watcher types
 * Provider-agnostic, local-file focused.
 */

export type AcquisitionState =
  | "IDLE"
  | "WATCHING"
  | "CANDIDATE_DETECTED"
  | "WAITING_FOR_STABILITY"
  | "READY"
  | "IMPORTING"
  | "INSTALLED"
  | "ALREADY_INSTALLED"
  | "AMBIGUOUS"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "COLLISION" // extended for collision propagation

export type Confidence = "HIGH" | "AMBIGUOUS" | "REJECT"

export interface AcquisitionSession {
  sessionId: string
  systemId: string
  expectedTitle: string
  normalizedExpectedTitle: string
  watchDirectory: string
  startedAt: number // epoch seconds
  state: AcquisitionState
  candidatePaths: string[]
  selectedCandidate?: string | null
  lastObservedSize?: number | null
  stableSince?: number | null
  importResult?: unknown | null
  errorCode?: string | null
  message?: string | null
}

export interface BeginWatchParams {
  systemId: string
  expectedTitle: string
  startedAt?: number
  customWatchDirectory?: string
  replaceExisting?: boolean
  externalUrl?: string
}

export interface AcquisitionSettings {
  watchDirectoryMode: "default-downloads" | "custom"
  customWatchDirectory?: string
}
