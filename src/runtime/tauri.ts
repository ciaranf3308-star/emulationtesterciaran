/**
 * Canonical Tauri boundary – V3/V4.
 * Centralizes all access to Tauri globals for safe usage in:
 *  - browser dev (no globals)
 *  - Tauri runtime (globals present)
 *  - vitest / bun test
 *  - SSR (window undefined)
 *
 * No legacy emulation root, no hardcoded paths, no uiDialog().
 */

export type TauriInvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>

/**
 * Synchronous low-level accessor – returns invoke fn if present else null.
 * Safe when window undefined.
 */
function resolveInvokerSync(): TauriInvokeFn | null {
  if (typeof window === 'undefined') return null
  try {
    const w = window as unknown as any
    // Tauri 2.x: window.__TAURI__.core.invoke
    if (w.__TAURI__?.core?.invoke && typeof w.__TAURI__.core.invoke === 'function') {
      return w.__TAURI__.core.invoke.bind(w.__TAURI__.core)
    }
    // Tauri 1.x: window.__TAURI__.invoke
    if (w.__TAURI__?.invoke && typeof w.__TAURI__.invoke === 'function') {
      return w.__TAURI__.invoke.bind(w.__TAURI__)
    }
    // Tauri internal: window.__TAURI_INVOKE__ (raw)
    if (typeof w.__TAURI_INVOKE__ === 'function') {
      return w.__TAURI_INVOKE__ as TauriInvokeFn
    }
    // Tauri IPC shim
    if (w.__TAURI_IPC__?.invoke && typeof w.__TAURI_IPC__.invoke === 'function') {
      return w.__TAURI_IPC__.invoke.bind(w.__TAURI_IPC__)
    }
    // Legacy nested: __TAURI__.tauri.invoke
    if (w.__TAURI__?.tauri?.invoke && typeof w.__TAURI__.tauri.invoke === 'function') {
      return w.__TAURI__.tauri.invoke.bind(w.__TAURI__.tauri)
    }
  } catch {
    // swallow – browser dev should not throw
  }
  return null
}

/**
 * Async accessor required by task spec – resolves to invoke fn or null.
 * Wrapped in Promise for future dynamic import fallback if desired.
 */
export async function getTauriInvoker(): Promise<TauriInvokeFn | null> {
  try {
    const inv = resolveInvokerSync()
    if (inv) return inv
    // Optional dynamic import fallback – only in Tauri context, ignore errors otherwise
    // This path is intentionally best-effort and never throws in browser/test.
    if (typeof window !== 'undefined') {
      const w = window as any
      if (w.__TAURI__ || w.__TAURI_INTERNALS__) {
        try {
          // @ts-ignore – optional peer
          const api = await import('@tauri-apps/api/core')
          if (api && typeof (api as any).invoke === 'function') {
            return (api as any).invoke as TauriInvokeFn
          }
        } catch {
          // ignore – not installed in browser dev
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Synchronous variant for providers that need sync caching (e.g., launcher bridge).
 * Safe wrapper around same logic.
 */
export function getTauriInvokerSync(): TauriInvokeFn | null {
  return resolveInvokerSync()
}

/**
 * Returns raw __TAURI__ object if present, else null.
 * Safe under SSR / browser.
 */
export function getTauriApi(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const w = window as any
    return w.__TAURI__ ?? null
  } catch {
    return null
  }
}
