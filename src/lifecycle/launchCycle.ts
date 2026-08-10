// src/lifecycle/launchCycle.ts – V8.7 zero-overhead game-launch handoff + return
// Minimal contract: bounded RestoreState persisted via Tauri, spawn watcher BEFORE Crystal exit,
// secure return path, pre-exit cleanup to free obvious resources.

import { invokeBackend } from '../runtime/backend'

export type RestoreState = {
  system_id: string
  rom_path: string
  rom_basename: string
  timestamp: number
  version: number
}

export type HandoffReady = {
  session_id: string
  pid: number
  restore_path: string
}

export async function saveRestoreState(systemId: string, romPath: string, romBasename: string): Promise<RestoreState> {
  return invokeBackend<RestoreState>('save_launch_restore_state', {
    systemId,
    romPath,
    romBasename,
  } as any)
}

// Alternate naming from Rust (launch_lifecycle prefix may also be registered as same command name)
export async function getRestoreState(): Promise<RestoreState | null> {
  try {
    const r = await invokeBackend<RestoreState | null>('get_launch_restore_state', {})
    return r
  } catch {
    // Try fallback namespaced command (if tauri handler duplicated)
    try {
      const r2 = await invokeBackend<RestoreState | null>('get_launch_restore_state' as any, {})
      return r2
    } catch {
      return null
    }
  }
}

export async function clearRestoreState(): Promise<void> {
  try {
    await invokeBackend<void>('clear_launch_restore_state', {})
  } catch {
    // non-fatal if already cleared
  }
}

export async function launchWithHandoff(backendRequest: any): Promise<HandoffReady> {
  return invokeBackend<HandoffReady>('launch_game_with_handoff', { request: backendRequest })
}

export async function exitAfterHandoff(): Promise<void> {
  return invokeBackend<void>('exit_crystal_after_handoff', {})
}

// Pre-exit cleanup requested by V8.7 spec: close provider surface, stop media decoding, animations, timers, large resources.
export function runPreExitCleanup(providerSurf?: any, crystalAcq?: any) {
  try {
    // 1. Close provider surface child WebView / acquisition UI session resources
    try {
      providerSurf?.cancel?.()
    } catch {}
    try {
      // Best-effort also close via direct tauri invoke
      // invoke fire-and-forget – will not block shutdown
      invokeBackend('close_provider_surface_with_app', {}).catch(() => {})
    } catch {}
    try {
      crystalAcq?.cancel?.()
    } catch {}

    // 2. Stop acquisition timer – useCrystalAcquisition exposes cancel, timer refs are internal but cancel clears them

    // 3. Stop gameplay/media video decoding – pause all <video> elements
    try {
      document.querySelectorAll('video').forEach((v: any) => {
        try {
          v.pause()
          v.src = ''
          v.load()
        } catch {}
      })
    } catch {}

    // 4. Stop animations – cancel Web Animations API, remove requestAnimationFrame loops via dispatch
    try {
      const anims = (document as any).getAnimations?.()
      anims?.forEach((a: any) => {
        try { a.cancel() } catch {}
      })
    } catch {}

    // 5. Stop polling/timers – acquisition timers cleared via cancel above, plus clear common app intervals
    try {
      // capped best-effort: nothing to CLEAR_REDUX_INTERVALS – main loops are React effects, unmount not possible before exit
      // Still dispatch custom event so hooks can self-clean
      window.dispatchEvent(new CustomEvent('crystal:pre-exit-cleanup' as any))
    } catch {}

    // 6. Release obvious large media resources – clear image src? Not destructive to FS, but revoke blob URLs
    try {
      document.querySelectorAll('img').forEach((img: any) => {
        try {
          const src = img.src
          if (src?.startsWith('blob:')) {
            URL.revokeObjectURL(src)
          }
        } catch {}
      })
    } catch {}

    // 7. Persist only small UI state – caller ensures saveRestoreState before spawn
  } catch (e) {
    console.debug('[lifecycle] pre-exit cleanup non-fatal', e)
  }
}

export function isRestoreRecent(state: RestoreState | null, maxAgeSeconds = 300): boolean {
  if (!state) return false
  if (!state.timestamp) return false
  const now = Math.floor(Date.now() / 1000)
  const age = now - state.timestamp
  if (age < 0) return false // far-future reject handled Rust-side also
  return age <= maxAgeSeconds
}
