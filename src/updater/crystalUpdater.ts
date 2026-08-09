/**
 * V8.3.1 – Crystal signed auto-updater service (Tauri v2 official architecture)
 * - Uses @tauri-apps/plugin-updater when available (JS API)
 * - Falls back to raw invoke plugin:updater|check if npm pkg not installed
 * - Safe: never touches EmuDeck / ES-DE / ROM / BIOS / saves / gamelists / scraped media
 * - Only updates Crystal binaries/assets via signed GitHub Release artifacts
 * - Async, non-blocking, failure-tolerant
 * - DEV shows version + commit SHA via secondary panel
 */

import { isTauriEnvironment } from '../runtime/environment'

export type CrystalUpdateInfo = {
  version: string // e.g. "4.4.0"
  currentVersion: string
  date?: string
  body?: string // release notes / changelog
  available: boolean
}

export type UpdaterProgressEvent =
  | { event: 'Started'; data?: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number; contentLength?: number } }
  | { event: 'Finished'; data?: any }

type UpdaterModule = {
  check: () => Promise<any>
}

let cachedModule: UpdaterModule | null = null
let moduleChecked = false

async function loadUpdaterModule(): Promise<UpdaterModule | null> {
  if (moduleChecked && cachedModule) return cachedModule
  // Attempt official JS API
  try {
    // dynamic import so build doesn't fail if not installed
    // @ts-ignore – optional dependency
    const mod = await import('@tauri-apps/plugin-updater')
    if (mod && typeof mod.check === 'function') {
      cachedModule = { check: mod.check }
      moduleChecked = true
      return cachedModule
    }
  } catch {
    // Fall through to raw invoke fallback
  }
  // Raw invoke fallback – Tauri v2 plugin exposes commands directly
  try {
    if (!isTauriEnvironment()) return null
    const { invoke } = await import('@tauri-apps/api/core').catch(async () => {
      // alias stubs may exist in Vite dev – try core directly
      // @ts-ignore
      return { invoke: (window as any).__TAURI__?.core?.invoke }
    })
    if (!invoke) return null
    cachedModule = {
      check: async () => {
        // plugin:updater|check returns null or Update object with similar shape
        // @ts-ignore
        const res = await (invoke as any)('plugin:updater|check')
        return res
      },
    }
    moduleChecked = true
    return cachedModule
  } catch {
    moduleChecked = true
    cachedModule = null
    return null
  }
}

function normalizeUpdate(raw: any, currentVersionFallback: string): CrystalUpdateInfo | null {
  if (!raw) return null
  // Tauri check() returns null when no update
  // When update available, returns object with version field
  if (typeof raw === 'object' && raw.version) {
    return {
      version: raw.version,
      currentVersion: raw.currentVersion || currentVersionFallback,
      date: raw.date,
      body: raw.body,
      available: true,
    }
  }
  // Some backends return { shouldUpdate: false }
  if (raw.shouldUpdate === false) return null
  return null
}

function getCurrentVersionFallback(): string {
  try {
    // @ts-ignore vite will inline package.json? Try import of version.json
    // We use runtime DOM fallback
    const meta = (typeof document !== 'undefined' ? document.querySelector('meta[name="crystal-version"]')?.getAttribute('content') : null)
    if (meta) return meta
  } catch {}
  return '4.3.0'
}

/**
 * Non-blocking async check – MUST never throw to caller that blocks startup.
 * Returns null if no update / unavailable, or info if available.
 */
export async function checkForUpdate(): Promise<CrystalUpdateInfo | null> {
  if (!isTauriEnvironment()) return null
  try {
    const mod = await loadUpdaterModule()
    if (!mod) return null
    const raw = await mod.check().catch(() => null)
    if (!raw) return null
    const info = normalizeUpdate(raw, getCurrentVersionFallback())
    return info
  } catch (err) {
    // silent – network/offline should not spam
    console.debug('[updater] check failed (non-blocking):', err)
    return null
  }
}

/**
 * Download + install with progress callback.
 * Caller must have already confirmed explicit user intent.
 * Returns { ok:true } on success (restart triggered by Tauri), { ok:false, error } on failure.
 * Uses Update.downloadAndInstall(progress) when available.
 */
export async function downloadAndInstallWithProgress(
  onProgress?: (pct: number, event: UpdaterProgressEvent) => void,
  rawUpdateObj?: any // optional pre-fetched Update object to avoid second check
): Promise<{ ok: boolean; error?: string }> {
  if (!isTauriEnvironment()) return { ok: false, error: 'not-tauri' }
  try {
    // Re-use passed object if already have full Update instance with download*
    let updateObj = rawUpdateObj
    if (!updateObj) {
      const mod = await loadUpdaterModule()
      if (!mod) return { ok: false, error: 'updater-unavailable' }
      updateObj = await mod.check().catch(() => null)
      if (!updateObj) return { ok: false, error: 'no-update' }
    }

    // If updateObj has downloadAndInstall method it's the rich object from check()
    if (updateObj && typeof updateObj.downloadAndInstall === 'function') {
      let totalContentLength: number | undefined
      let downloaded = 0
      await updateObj.downloadAndInstall((ev: any) => {
        try {
          const e = ev as UpdaterProgressEvent
          if (e.event === 'Started') {
            totalContentLength = e.data?.contentLength
            downloaded = 0
            onProgress?.(1, e)
          } else if (e.event === 'Progress') {
            downloaded += e.data.chunkLength
            if (totalContentLength) {
              const pct = Math.min(99, Math.round((downloaded / totalContentLength) * 100))
              onProgress?.(pct, e)
            } else if (e.data.contentLength) {
              const pct = Math.min(99, Math.round((downloaded / e.data.contentLength) * 100))
              onProgress?.(pct, e)
            } else {
              onProgress?.(50, e) // unknown length
            }
          } else if (e.event === 'Finished') {
            onProgress?.(100, e)
          }
        } catch {}
      })
      return { ok: true }
    }

    // Fallback: try raw invoke download-and-install command
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // Attempt download – progress not per-chunk via direct invoke, just start/finish
      onProgress?.(5, { event: 'Started', data: {} })
      // @ts-ignore
      await (invoke as any)('plugin:updater|download_and_install')
      onProgress?.(100, { event: 'Finished', data: {} })
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message || String(e)
      return { ok: false, error: msg }
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.warn('[updater] download/install failed:', msg)
    return { ok: false, error: msg }
  }
}

/** Separate download-only helper if UI wants pause before install */
export async function downloadOnly(
  onProgress?: (pct: number) => void
): Promise<any | null> {
  if (!isTauriEnvironment()) return null
  try {
    const mod = await loadUpdaterModule()
    if (!mod) return null
    const update = await mod.check()
    if (!update) return null
    if (typeof update.download === 'function') {
      let total = 0
      let got = 0
      await update.download((ev: any) => {
        if (ev.event === 'Started') total = ev.data?.contentLength || 0
        if (ev.event === 'Progress') {
          got += ev.data.chunkLength
          if (total) onProgress?.(Math.round((got / total) * 100))
        }
      })
      return update
    }
    return update
  } catch {
    return null
  }
}

export async function installAndRestart(updateObj?: any): Promise<boolean> {
  try {
    if (updateObj && typeof updateObj.install === 'function') {
      await updateObj.install()
    }
    // For downloadAndInstall flow, restart already handled? Tauri updater restart is via relaunch after install
    // Fallback invoke relaunch via plugin (plugin will relaunch anyway)
    const { invoke } = await import('@tauri-apps/api/core').catch(() => null as any)
    if (invoke) {
      // @ts-ignore
      await invoke('plugin:updater|install_and_restart').catch(() => null)
    }
    return true
  } catch (e) {
    console.warn('[updater] install+restart failed', e)
    return false
  }
}
