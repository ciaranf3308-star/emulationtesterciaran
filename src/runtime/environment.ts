/* eslint-disable */
// Node process may not be typed in tsconfig.app.json (vite/client)
declare const process: any
declare const globalThis: any
/**
 * Canonical runtime environment detection – V3/V4 architecture.
 * Safe under: browser dev, Tauri runtime, vitest/bun test, SSR (window undefined).
 * No hardcoded paths, no legacy emulator map constant (removed), no side effects.
 */

export type Runtime = 'browser' | 'tauri' | 'test'

/**
 * Detect Tauri WebView host – synchronous, safe for SSR.
 * Checks multiple injection points used by Tauri 1.x / 2.x:
 *  - window.__TAURI__
 *  - window.__TAURI_INTERNALS__
 *  - window.__TAURI_INVOKE__
 *  - window.__TAURI_IPC__
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const w = window as unknown as Record<string, unknown>
    return !!(
      (w as any).__TAURI__ ||
      (w as any).__TAURI_INTERNALS__ ||
      (w as any).__TAURI_INVOKE__ ||
      (w as any).__TAURI_IPC__
    )
  } catch {
    return false
  }
}

/**
 * Detect test environment – Node / Vitest / Bun.
 * Safe to call when window undefined or process undefined.
 */
export function isTestEnv(): boolean {
  try {
    // @ts-ignore – process may not exist in browser
    const env = typeof process !== 'undefined' ? (process as any).env : undefined
    if (env) {
      if (env.NODE_ENV === 'test') return true
      if (env.VITEST) return true
      if (env.BUN_TEST) return true
      if (env.npm_lifecycle_script && String(env.npm_lifecycle_script).includes('vitest')) return true
      if (env.VITEST_WORKER_ID) return true
    }
    // Secondary heuristic: Node without window and no Tauri flag is often a test/unit run if execArgv contains vitest
    // We avoid false positives for pure SSR by only returning true when explicit test env vars present,
    // otherwise caller falls through to browser/tauri classification.
    // However import.meta.env from Vite also exposes MODE
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && (globalThis as any).__vitest_worker__) return true
  } catch {
    // ignore
  }
  return false
}

/**
 * Resolve current runtime flavour.
 * Priority:
 *  1. tauri if isTauriEnvironment()
 *  2. test if isTestEnv() or Node without window and test env
 *  3. otherwise browser
 */
export function getRuntime(): Runtime {
  if (isTauriEnvironment()) return 'tauri'
  if (isTestEnv()) return 'test'
  try {
    // Heuristic: window undefined + Node process present => test or SSR build
    // If process env signals test, we already returned test; here we still
    // treat pure SSR (no window) as test to satisfy "window undefined" safety
    // while preserving browser default when window exists.
    // @ts-ignore
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      // If VITEST etc already caught return test; otherwise treat as test for safety,
      // but keep 'test' label distinct from browser.
      // In SSR without test env, falling back to 'test' avoids pretending to be browser with no window.
      const pEnv = (process as any).env
      if (pEnv && (pEnv.NODE_ENV === 'test' || pEnv.VITEST)) return 'test'
      // For pure SSR (Next-like) we still return 'test' placeholder to indicate non-browser non-tauri.
      // Consumers should treat isBrowserDev() as canonical for UI-allow rules.
      // To keep promise of never throwing on window undefined, we return 'test' here.
      // If caller specifically needs SSR distinction they can check window directly.
      // For now treat undefined window with non-test env as 'test' for safety? Spec says else 'browser'.
      // Spec says: "if typeof window === 'undefined' and process env test return 'test' else 'browser'"
      // So we implement spec literally: default to browser if not test, even when window undefined.
      // To honour spec we return 'test' only when isTestEnv true; else 'browser'.
    }
  } catch {}
  return 'browser'
}

/**
 * True when not in Tauri – i.e. browser dev or test/SSR.
 * Named isBrowserDev for compatibility with existing provider checks that block
 * example fallback when Tauri is present.
 */
export function isBrowserDev(): boolean {
  return !isTauriEnvironment()
}
