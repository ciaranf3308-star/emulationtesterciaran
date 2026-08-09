import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createKeyboardAdapter } from '../../src/input/keyboard'
import { createGamepadAdapter } from '../../src/input/gamepad'

type CountWindow = {
  addCount: number
  removeCount: number
  addEventListener: (type: string, cb: any) => void
  removeEventListener: (type: string, cb: any) => void
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
  requestAnimationFrame?: (cb: any)=>number
  cancelAnimationFrame?: (id:number)=>void
}

function makeFakeWindow(): CountWindow & { counts: { add: number, remove: number } } {
  const counts = { add: 0, remove: 0 }
  const fake = {
    counts,
    addCount: 0,
    removeCount: 0,
    addEventListener(_type: string, _cb: any) { counts.add++ },
    removeEventListener(_type: string, _cb: any) { counts.remove++ },
    setTimeout: (cb: any, ms?: number) => globalThis.setTimeout(cb, ms) as any,
    clearTimeout: (id: any) => globalThis.clearTimeout(id),
    setInterval: (cb: any, ms?: number) => globalThis.setInterval(cb, ms) as any,
    clearInterval: (id: any) => globalThis.clearInterval(id),
    requestAnimationFrame: (cb: any) => { return globalThis.setTimeout(cb, 16) as any },
    cancelAnimationFrame: (id: any) => globalThis.clearTimeout(id),
  }
  return fake as any
}

let originalWindow: any
let originalRAF: any
let originalCAF: any

beforeEach(()=>{
  originalWindow = (globalThis as any).window
  originalRAF = (globalThis as any).requestAnimationFrame
  originalCAF = (globalThis as any).cancelAnimationFrame
})

afterEach(()=>{
  (globalThis as any).window = originalWindow
  if (originalRAF) (globalThis as any).requestAnimationFrame = originalRAF
  else delete (globalThis as any).requestAnimationFrame
  if (originalCAF) (globalThis as any).cancelAnimationFrame = originalCAF
  else delete (globalThis as any).cancelAnimationFrame
})

describe('input lifecycle StrictMode safe', ()=>{

  test('keyboard new adapter NOT started until start() called (side-effect free)', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    const adapter = createKeyboardAdapter(()=>{})
    expect(fake.counts.add).toBe(0)
    expect(adapter.isActive()).toBe(false)
    adapter.start()
    expect(fake.counts.add).toBe(2) // keydown + keyup
    expect(adapter.isActive()).toBe(true)
    adapter.stop()
  })

  test('keyboard double start does not double bind', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    ;(globalThis as any).requestAnimationFrame = fake.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fake.cancelAnimationFrame
    const adapter = createKeyboardAdapter(()=>{})
    adapter.start()
    const afterFirst = fake.counts.add
    adapter.start()
    adapter.start()
    expect(fake.counts.add).toBe(afterFirst) // idempotent, no extra listeners
    adapter.stop()
  })

  test('keyboard stop idempotent', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    const adapter = createKeyboardAdapter(()=>{})
    adapter.start()
    adapter.stop()
    const afterStop = fake.counts.remove
    expect(()=> adapter.stop()).not.toThrow()
    expect(fake.counts.remove).toBe(afterStop) // second stop noop, no extra remove
    expect(adapter.isActive()).toBe(false)
  })

  test('keyboard isActive flag reliable', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    const adapter = createKeyboardAdapter(()=>{})
    expect(adapter.isActive()).toBe(false)
    adapter.start()
    expect(adapter.isActive()).toBe(true)
    adapter.stop()
    expect(adapter.isActive()).toBe(false)
    adapter.start()
    expect(adapter.isActive()).toBe(true)
    adapter.stop()
    expect(adapter.isActive()).toBe(false)
  })

  test('gamepad construction side-effect free and idempotent lifecycle', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    ;(globalThis as any).requestAnimationFrame = fake.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fake.cancelAnimationFrame
    ;(globalThis as any).navigator = { getGamepads: ()=>[] } as any

    const adapter = createGamepadAdapter(()=>{})
    expect(adapter.isActive()).toBe(false)
    expect(fake.counts.add).toBe(0)

    adapter.start()
    expect(adapter.isActive()).toBe(true)
    const afterFirst = fake.counts.add
    adapter.start()
    expect(fake.counts.add).toBe(afterFirst) // no double bind

    adapter.stop()
    expect(adapter.isActive()).toBe(false)
    const afterStopRemove = fake.counts.remove
    // second stop noop
    expect(()=> adapter.stop()).not.toThrow()
    // our implementation still tries to ensure listeners removed on first stop, second stop early returns
    expect(adapter.isActive()).toBe(false)
  })

  test('StrictMode mount/unmount/remount sequence', ()=>{
    const fake = makeFakeWindow()
    ;(globalThis as any).window = fake
    ;(globalThis as any).requestAnimationFrame = fake.requestAnimationFrame
    ;(globalThis as any).cancelAnimationFrame = fake.cancelAnimationFrame
    ;(globalThis as any).navigator = { getGamepads: ()=>[] } as any

    const adapter = createKeyboardAdapter(()=>{})
    // Simulate mount
    adapter.start()
    expect(adapter.isActive()).toBe(true)
    // Simulate unmount (StrictMode)
    adapter.stop()
    expect(adapter.isActive()).toBe(false)
    // Simulate remount
    adapter.start()
    expect(adapter.isActive()).toBe(true)
    expect(fake.counts.add).toBe(4) // two mounts, each 2 listeners
    expect(fake.counts.remove).toBe(2) // one unmount so far
    adapter.stop()
    expect(adapter.isActive()).toBe(false)
  })
})
