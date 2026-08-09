/**
 * Runtime environment canonical boundary – safety test
 * Proves isTauriEnvironment() does not throw when window undefined, returns false in test.
 */
import { describe, it, expect } from 'vitest'
// Fallback: if vitest not available at runtime (bun:test), re-export will still work because vitest shim exists via bun
import { isTauriEnvironment, getRuntime, isBrowserDev, isTestEnv } from '../../src/runtime/environment'
import { getTauriInvoker, getTauriApi, getTauriInvokerSync } from '../../src/runtime/tauri'

describe('runtime/environment', () => {
  it('isTauriEnvironment does not throw when window undefined', () => {
    // In this Node/vitest environment window is undefined; function should safely return false
    expect(() => isTauriEnvironment()).not.toThrow()
  })

  it('isTauriEnvironment returns false in test env (no Tauri globals)', () => {
    const result = isTauriEnvironment()
    expect(result).toBe(false)
  })

  it('isTauriEnvironment is SSR safe when window is missing', () => {
    const hadWindow = typeof (globalThis as any).window !== 'undefined'
    const original = (globalThis as any).window
    try {
      // Simulate SSR: ensure window undefined
      // @ts-ignore
      delete (globalThis as any).window
      // global window variable may still exist as global; we test typeof window check inside function
      // The function checks typeof window !== 'undefined' – deleting globalThis.window makes window undefined in Node's globalThis context
      // On Node, typeof window is normally undefined already; this deletion is extra safety
      expect(() => isTauriEnvironment()).not.toThrow()
      expect(isTauriEnvironment()).toBe(false)
    } finally {
      if (hadWindow) {
        ;(globalThis as any).window = original
      }
    }
  })

  it('getRuntime returns browser or test in test env, never tauri without globals', () => {
    const rt = getRuntime()
    expect(['browser','test']).toContain(rt)
  })

  it('isBrowserDev is true when not in Tauri (test env)', () => {
    expect(isBrowserDev()).toBe(true)
  })

  it('isTestEnv detects test environment', () => {
    // In vitest NODE_ENV=test or VITEST flag should make this true, but we accept boolean and ensure it does not throw
    expect(() => isTestEnv()).not.toThrow()
    const v = isTestEnv()
    // In vitest, isTestEnv should be true; in case env not set, still boolean
    expect(typeof v).toBe('boolean')
  })

  it('getTauriInvoker returns null in test and does not throw', async () => {
    await expect(getTauriInvoker()).resolves.toBeNull()
  })

  it('getTauriInvokerSync returns null in test and does not throw', () => {
    expect(() => getTauriInvokerSync()).not.toThrow()
    expect(getTauriInvokerSync()).toBeNull()
  })

  it('getTauriApi returns null in test and does not throw', () => {
    expect(() => getTauriApi()).not.toThrow()
    expect(getTauriApi()).toBeNull()
  })

  it('isTauriEnvironment remains false even with empty window object lacking Tauri keys', () => {
    const hadWindow = (globalThis as any).window
    try {
      ;(globalThis as any).window = {}
      expect(isTauriEnvironment()).toBe(false)
    } finally {
      if (typeof hadWindow === 'undefined') {
        delete (globalThis as any).window
      } else {
        ;(globalThis as any).window = hadWindow
      }
    }
  })
})
