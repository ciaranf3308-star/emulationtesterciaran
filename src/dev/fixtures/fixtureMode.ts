/**
 * Fixture Mode helper – V8.2
 * DEV-ONLY isolation:
 * - never auto-enable without ?fixture=golden param
 * - must be DEV (import.meta.env.DEV or NODE_ENV development)
 * - isDevFixtureAllowed = !isTauriEnvironment && DEV (web dev only)
 * - isFixtureEnabled respects Tauri real-mode gate via App.tsx; helper itself
 *   never forces Tauri real mode = false alone, but returns enabled flag for
 *   URL param + DEV. App.tsx must still enforce isTauri && isRealMachine => false.
 * Pure memory, no FS writes, no src-tauri change.
 */
import { isTauriEnvironment } from '../../runtime/environment'

export type FixtureSystemId = 'gbc' | 'ps2' | 'gc'
export type FixtureView = 'system' | 'library'
export type FixtureTheme = 'light' | 'dark'

export type FixtureModeResult = {
  enabled: boolean
  systemId?: FixtureSystemId
  view?: FixtureView
  theme?: FixtureTheme
  rawParams?: URLSearchParams
}

declare const process: any

function isDevEnv(): boolean {
  try {
    // @ts-ignore vite
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) return true
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      const ne = process.env.NODE_ENV
      if (ne === 'development') return true
      // allow explicit DEV check if already dev-like but not production
      // keep strict: only dev env true counts
    }
  } catch {}
  return false
}

/**
 * Strict web-only dev check – never in Tauri host.
 * DEV ONLY && not Tauri.
 */
export function isDevFixtureAllowed(): boolean {
  if (isTauriEnvironment()) return false
  return isDevEnv()
}

/**
 * Parses ?fixture=golden (&system &view &theme) and DEV gate.
 * Returns {enabled, systemId, view, theme}
 * - enabled true only when DEV && URLSearchParams fixture=golden
 * - does NOT auto-enable without param
 * - systemId default gbc, view default system, theme optional
 * - isolation: if !enabled returns only {enabled:false}
 */
export function isFixtureEnabled(): FixtureModeResult {
  if (typeof window === 'undefined') return { enabled: false }

  const dev = isDevEnv()
  if (!dev) return { enabled: false }

  let sp: URLSearchParams
  try {
    sp = new URLSearchParams(window.location.search)
  } catch {
    return { enabled: false }
  }

  const fixtureParam = sp.get('fixture')
  if (fixtureParam !== 'golden') {
    // strict isolation: must be exactly ?fixture=golden, no implicit enable
    return { enabled: false, rawParams: sp }
  }

  // DEV && param present => enabled (Tauri real-mode blocked downstream in App.tsx)
  // Extra safety: if we are in Tauri env, we still mark enabled true here
  // so App.tsx can decide (it must enforce isTauri && isRealMachine => false).
  // Optional: if we want to be ultra-safe, we could force false in Tauri always,
  // but spec isolation says only real machine (isRealMachine true) must be blocked,
  // so we leave enabled true and let App handle isRealMachine.
  const sysRaw = sp.get('system')
  const viewRaw = sp.get('view')
  const themeRaw = sp.get('theme')

  let systemId: FixtureSystemId = 'gbc'
  if (sysRaw === 'gbc' || sysRaw === 'ps2' || sysRaw === 'gc') systemId = sysRaw

  let view: FixtureView | undefined
  if (viewRaw === 'system' || viewRaw === 'library') view = viewRaw
  else view = 'system' // default view system

  let theme: FixtureTheme | undefined
  if (themeRaw === 'light' || themeRaw === 'dark') theme = themeRaw

  return { enabled: true, systemId, view, theme, rawParams: sp }
}

/**
 * Helper to check if current host would be blocked as Tauri real machine.
 * App.tsx should use machine config isRealMachine flag; this is a coarse helper.
 */
export function isTauriRealMachineBlocked(isRealMachine: boolean): boolean {
  return isTauriEnvironment() && !!isRealMachine
}
