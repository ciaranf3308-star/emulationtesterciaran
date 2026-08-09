/**
 * Canonical Tauri-local media URL helper – V7.3
 *
 * verify_media may return absolute Windows filesystem paths.
 * A browser <video>/<img> should not blindly receive `D:\Emulation\...`.
 * Tauri v2 requires convertFileSrc (asset protocol) to render local files.
 *
 * Browser dev degrades safely – returns undefined to fall back to example assets.
 *
 * Usage:
 *   const url = await toAssetUrl(absolutePath)
 */

import { isTauriEnvironment } from './environment'

type ConvertFn = (path: string) => string

let cachedConverter: ConvertFn | null = null
let attemptedDynamic = false

function isAlreadyWeb(p: string): boolean {
  return p.startsWith('http://') || p.startsWith('https://') || p.startsWith('asset:') || p.startsWith('tauri:') || p.startsWith('blob:') || p.startsWith('/assets/') || p.startsWith('/config/') || p.startsWith('data:')
}

function resolveSync(): ConvertFn | null {
  if (typeof window === 'undefined') return null
  try {
    const w = window as any
    // Tauri 2: convertFileSrc from @tauri-apps/api/core via window.__TAURI__.core.convertFileSrc
    if (w.__TAURI__?.core?.convertFileSrc) {
      return (p: string) => w.__TAURI__.core.convertFileSrc(p)
    }
    // some bundlings expose directly
    if (typeof w.__TAURI_INTERNALS__?.plugins?.fs?.convertFileSrc === 'function') {
      return w.__TAURI_INTERNALS__.plugins.fs.convertFileSrc
    }
    // fallback: window.__TAURI__.convertFileSrc (v1 compat)
    if (w.__TAURI__?.convertFileSrc) {
      return (p: string) => w.__TAURI__.convertFileSrc(p)
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Try dynamic import for Tauri convertFileSrc – v2 API lives in '@tauri-apps/api/core'
 */
async function resolveAsync(): Promise<ConvertFn | null> {
  if (cachedConverter) return cachedConverter
  const sync = resolveSync()
  if (sync) {
    cachedConverter = sync
    return sync
  }
  if (attemptedDynamic) return null
  attemptedDynamic = true
  try {
    if (typeof window !== 'undefined') {
      const w = window as any
      if (w.__TAURI__ || w.__TAURI_INTERNALS__) {
        // dynamic – may fail in browser dev – wrapped try
        // @ts-ignore – optional peer dep
        const mod = await import('@tauri-apps/api/core')
        const c = (mod as any).convertFileSrc
        if (typeof c === 'function') {
          cachedConverter = c as ConvertFn
          return cachedConverter
        }
      }
    }
  } catch {
    // ignore – browser dev has no Tauri
  }
  return null
}

/**
 * Convert local filesystem path to something the WebView can render.
 * Returns string url or null if not convertible (browser dev safe).
 *
 * NOTE: Do NOT hardcode personal paths or invent media locations – only converts what backend gave us.
 */
export async function toAssetUrl(maybePath?: string | null): Promise<string | null> {
  if (!maybePath) return null
  const p = maybePath.trim()
  if (!p) return null
  if (isAlreadyWeb(p)) return p

  if (!isTauriEnvironment()) {
    // Browser preview – degrade safely – do not attempt Windows paths
    // If path looks like /assets/... already handled, else return null to trigger idle/fallback UI
    return null
  }

  // Tauri mode – need converter
  try {
    const converter = await resolveAsync()
    if (!converter) {
      // last-ditch: some Tauri builds allow direct asset://localhost – attempt naïve encoding?
      // Better return null than blind path injection
      return null
    }
    // Normalise Windows backslashes for Tauri – convertFileSrc accepts forward slashes as well
    const normalized = p.replace(/\\/g, '/')
    return converter(normalized)
  } catch {
    return null
  }
}

/**
 * Synchronous fallback – returns url if already web-safe, else null.
 * Use when async not possible (render path) – will attempt async later via effect.
 */
export function toAssetUrlSync(maybePath?: string | null): string | null {
  if (!maybePath) return null
  const p = maybePath.trim()
  if (!p) return null
  if (isAlreadyWeb(p)) return p

  if (!isTauriEnvironment()) return null

  const conv = cachedConverter || resolveSync()
  if (!conv) return null
  try {
    return conv(p.replace(/\\/g, '/'))
  } catch {
    return null
  }
}

/**
 * Resolve real game media dict from MediaVerificationResult to web-safe URLs.
 * Takes raw MediaCheck map { video?: {exists, path, candidates}, ... } and converts each existing path.
 */
export async function resolveMediaVerificationToUrls(
  media: Record<string, { exists: boolean; path?: string; candidates: string[] }>
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  const entries = Object.entries(media || {})
  for (const [type, check] of entries) {
    if (!check?.exists) {
      out[type] = null
      continue
    }
    const raw = (check as any).path as string | undefined
    if (!raw) {
      out[type] = null
      continue
    }
    const url = await toAssetUrl(raw)
    out[type] = url
  }
  return out
}

/* ------------------------------------------------------------------
 * Helpers for gameplay priority logic – documented policy
 * ------------------------------------------------------------------ */

export type ResolvedGameMedia = {
  video?: string | null
  screenshot?: string | null
  titleScreen?: string | null
  mixImage?: string | null
  cover?: string | null
  physicalMedia?: string | null
  marquee?: string | null
}

/**
 * Gameplay screen priority for selected game:
 *  1. real scraped video if available
 *  2. real screenshot / title-screen / miximage fallback
 *  3. premium empty/idle screen if no real media exists
 *
 * Physical media: real scraped physicalmedia only – never fake cartridge/disc.
 *
 * Truthful dual-screen: NDS/3DS have two independent regions.
 * If scraped media provides only one combined preview, we display it truthfully in primary
 * and leave secondary idle – do NOT blindly duplicate and claim dual-source.
 */
export function pickGameplayFromResolved(resolved: ResolvedGameMedia): { primaryUrl?: string | null; primaryType: 'video' | 'screenshot' | 'none'; fallbackReason: string } {
  if (resolved.video) {
    return { primaryUrl: resolved.video, primaryType: 'video', fallbackReason: 'real video' }
  }
  if (resolved.screenshot) {
    return { primaryUrl: resolved.screenshot, primaryType: 'screenshot', fallbackReason: 'real screenshot' }
  }
  if (resolved.titleScreen) {
    return { primaryUrl: resolved.titleScreen, primaryType: 'screenshot', fallbackReason: 'real titlescreen fallback' }
  }
  if (resolved.mixImage) {
    return { primaryUrl: resolved.mixImage, primaryType: 'screenshot', fallbackReason: 'real miximage fallback' }
  }
  if (resolved.cover) {
    return { primaryUrl: resolved.cover, primaryType: 'screenshot', fallbackReason: 'real cover fallback' }
  }
  return { primaryUrl: null, primaryType: 'none', fallbackReason: 'no real scraped media – idle glass' }
}
