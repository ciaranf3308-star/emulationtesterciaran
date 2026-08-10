import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createGamepadAdapter } from '../../src/input/gamepad'
import type { NavigationAction } from '../../src/input/types'

type FakeButton = { pressed: boolean; value?: number }
type FakeGamepad = { id: string; buttons: FakeButton[]; axes: number[] }

function makeFakeWindow() {
  const counts = { add: 0, remove: 0 }
  const fake: any = {
    counts,
    addEventListener(_: string, __: any) { counts.add++ },
    removeEventListener(_: string, __: any) { counts.remove++ },
    setTimeout: (cb: any, ms?: number) => globalThis.setTimeout(cb, ms) as any,
    clearTimeout: (id: any) => globalThis.clearTimeout(id),
    setInterval: (cb: any, ms?: number) => globalThis.setInterval(cb, ms) as any,
    clearInterval: (id: any) => globalThis.clearInterval(id),
    requestAnimationFrame: (cb: any) => globalThis.setTimeout(cb, 16) as any,
    cancelAnimationFrame: (id: any) => globalThis.clearTimeout(id),
  }
  return fake
}

let originalWindow: any
let originalRAF: any
let originalCAF: any
let originalNav: any
let originalPerf: any

beforeEach(() => {
  originalWindow = (globalThis as any).window
  originalRAF = (globalThis as any).requestAnimationFrame
  originalCAF = (globalThis as any).cancelAnimationFrame
  originalNav = (globalThis as any).navigator
  originalPerf = (globalThis as any).performance
  // deterministic perf.now
  ;(globalThis as any).performance = { now: () => Date.now() }
})

afterEach(() => {
  ;(globalThis as any).window = originalWindow
  if (originalRAF) (globalThis as any).requestAnimationFrame = originalRAF
  else delete (globalThis as any).requestAnimationFrame
  if (originalCAF) (globalThis as any).cancelAnimationFrame = originalCAF
  else delete (globalThis as any).cancelAnimationFrame
  ;(globalThis as any).navigator = originalNav
  ;(globalThis as any).performance = originalPerf
})

describe('gamepad media action regression V8.4.1', () => {
  test('press button 2 / X -> exactly one media on initial press', async () => {
    const fakeWin = makeFakeWindow()
    ;(globalThis as any).window = fakeWin
    ;(globalThis as any).requestAnimationFrame = fakeWin.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fakeWin.cancelAnimationFrame

    const emitted: NavigationAction[] = []
    const handler = (e: any) => emitted.push(e.action)

    const gamepad: FakeGamepad = {
      id: 'test-pad',
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 2 })), // only button 2 pressed
      axes: [0, 0, 0, 0],
    }
    ;(globalThis as any).navigator = {
      getGamepads: () => [gamepad as unknown as Gamepad],
    }

    const adapter = createGamepadAdapter(handler, { initialDelay: 1000, repeatInterval: 500 })
    adapter.start()

    // wait ~50ms for RAF poll tick to fire
    await new Promise(r => setTimeout(r, 50))

    adapter.stop()

    const mediaEvents = emitted.filter(a => a === 'media')
    expect(mediaEvents.length).toBe(1)

    // Ensure no other media duplicates within same frame – exactly one initial emit
    expect(emitted).toContain('media')
  })

  test('release clears pressed, repeat can fire after hold, release prevents further media', async () => {
    const fakeWin = makeFakeWindow()
    ;(globalThis as any).window = fakeWin
    ;(globalThis as any).requestAnimationFrame = fakeWin.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fakeWin.cancelAnimationFrame

    const emitted: { action: NavigationAction; repeat: boolean }[] = []
    const handler = (e: any) => emitted.push({ action: e.action, repeat: e.repeat })

    let pressed = true
    const btn = () => ({ pressed })

    const gp = {
      id: 'test-pad-2',
      get buttons() {
        const arr = Array.from({ length: 16 }, () => ({ pressed: false } as FakeButton))
        arr[2] = btn() as any
        return arr
      },
      axes: [0, 0, 0, 0],
    }

    ;(globalThis as any).navigator = {
      getGamepads: () => [gp as unknown as Gamepad],
    }

    // short delays to test repeat logic
    const adapter = createGamepadAdapter(handler, { initialDelay: 30, repeatInterval: 30 })
    adapter.start()
    await new Promise(r => setTimeout(r, 20))
    // first should have fired
    let mediaNow = emitted.filter(e => e.action === 'media')
    expect(mediaNow.length).toBeGreaterThanOrEqual(1)
    expect(mediaNow[0].repeat).toBe(false)

    // keep holding > initialDelay so repeat kicks
    await new Promise(r => setTimeout(r, 80))
    mediaNow = emitted.filter(e => e.action === 'media')
    // should have at least 2 total (initial + at least one repeat)
    expect(mediaNow.length).toBeGreaterThanOrEqual(2)
    expect(mediaNow[1].repeat).toBe(true)

    // release
    pressed = false
    await new Promise(r => setTimeout(r, 40))

    const beforeReleaseCount = emitted.filter(e => e.action === 'media').length
    await new Promise(r => setTimeout(r, 60))
    const afterReleaseCount = emitted.filter(e => e.action === 'media').length
    expect(afterReleaseCount).toBe(beforeReleaseCount) // no more after release

    adapter.stop()
  })

  test('A confirm, B back, View/Select Discover, Menu Settings remain intact, Y favorite not hijacked', async () => {
    const fakeWin = makeFakeWindow()
    ;(globalThis as any).window = fakeWin
    ;(globalThis as any).requestAnimationFrame = fakeWin.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fakeWin.cancelAnimationFrame

    // Press mapping: 0=A confirm, 1=B back, 3=Y favorite, 8=View Select search, 9=Menu
    const mapping: Record<number, NavigationAction> = {
      0: 'confirm',
      1: 'back',
      3: 'favorite',
      8: 'search',
      9: 'menu',
    }

    for (const btnIdx of Object.keys(mapping).map(n => parseInt(n))) {
      const emitted: NavigationAction[] = []
      const handler = (e: any) => emitted.push(e.action)
      const gp = {
        id: 'pad',
        buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === btnIdx } as FakeButton)),
        axes: [0, 0, 0, 0],
      }
      ;(globalThis as any).navigator = { getGamepads: () => [gp as unknown as Gamepad] }
      const adapter = createGamepadAdapter(handler, { initialDelay: 1000, repeatInterval: 500 })
      adapter.start()
      await new Promise(r => setTimeout(r, 30))
      adapter.stop()
      expect(emitted).toContain(mapping[btnIdx])
    }
  })
})
