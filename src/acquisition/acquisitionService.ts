/**
 * Acquisition service – narrow Tauri wrapper, provider agnostic.
 */
import { getTauriInvoker } from "../runtime/tauri"
import type { AcquisitionSession, BeginWatchParams, AcquisitionSettings } from "./types"

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const inv = await getTauriInvoker()
  if (!inv) throw new Error("Tauri invoke unavailable – running in browser dev?")
  return inv<T>(cmd, args)
}

export async function getDefaultDownloadDirectory(): Promise<string> {
  const result = await invoke<string | { path?: string; error?: string }>("get_default_download_directory")
  // Backend may return string path directly or object with error
  if (typeof result === "string") return result
  if (typeof result === "object" && result && "error" in result) {
    throw new Error((result as any).error || "DOWNLOADS_DIRECTORY_UNAVAILABLE")
  }
  if (typeof result === "object" && result && "path" in result) {
    return (result as any).path
  }
  return result as unknown as string
}

export async function beginAcquisitionWatch(params: BeginWatchParams): Promise<AcquisitionSession> {
  return invoke<AcquisitionSession>("start_acquisition_watch", {
    systemId: params.systemId,
    expectedTitle: params.expectedTitle,
    startedAt: params.startedAt,
    customWatchDirectory: params.customWatchDirectory,
    replaceExisting: params.replaceExisting,
    externalUrl: params.externalUrl,
  } as any)
}

export async function getAcquisitionWatchStatus(sessionId: string): Promise<AcquisitionSession> {
  return invoke<AcquisitionSession>("get_acquisition_watch_status", { sessionId })
}

export async function cancelAcquisitionWatch(sessionId: string): Promise<AcquisitionSession> {
  return invoke<AcquisitionSession>("cancel_acquisition_watch", { sessionId })
}

export async function getAcquisitionSettings(): Promise<AcquisitionSettings> {
  try {
    return await invoke<AcquisitionSettings>("get_acquisition_settings")
  } catch {
    return { watchDirectoryMode: "default-downloads" }
  }
}

// Dev harness – non-production, temp fixture directory only
export async function beginAcquisitionWatchDevFixture(
  params: BeginWatchParams & { fixtureWatchDirectory: string }
): Promise<AcquisitionSession> {
  // This path is intentionally fixture-only; production UI must not use fixtureWatchDirectory
  // Guard: only allow within dev/tests by checking env if possible, but backend validates
  return invoke<AcquisitionSession>("start_acquisition_watch", {
    systemId: params.systemId,
    expectedTitle: params.expectedTitle,
    customWatchDirectory: params.fixtureWatchDirectory,
    replaceExisting: true,
  } as any)
}
