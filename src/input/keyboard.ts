import type { NavigationAction, InputEvent, InputAdapter, InputHandler } from './types'

const KEY_MAP: Record<string, NavigationAction> = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  k: 'up',
  K: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  j: 'down',
  J: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  h: 'left',
  H: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  l: 'right',
  L: 'right',
  Enter: 'confirm',
  ' ': 'confirm',
  Spacebar: 'confirm',
  Escape: 'back',
  Esc: 'back',
  Backspace: 'back',
  m: 'menu',
  M: 'menu',
  p: 'menu',
  P: 'menu',
  f: 'favorite',
  F: 'favorite',
  y: 'favorite',
  Y: 'favorite',
  x: 'media',
  X: 'media',
  '/': 'search',
  '?': 'search',
  q: 'previousSystem',
  Q: 'previousSystem',
  PageUp: 'previousSystem',
  '[': 'previousSystem',
  e: 'nextSystem',
  E: 'nextSystem',
  PageDown: 'nextSystem',
  ']': 'nextSystem',
}

const NAV_KEYS_BLOCK_SCROLL = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Spacebar','PageUp','PageDown'])

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target as (EventTarget & { tagName?: string; isContentEditable?: boolean }) | null
  if (!el) return false
  const tag = String(el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable
}

export function keyboardToAction(e: KeyboardEvent): NavigationAction | null {
  if (isEditableKeyboardTarget(e.target)) return null
  if (e.key === 'Tab') return null
  const direct = KEY_MAP[e.key]
  if (direct) return direct
  const codeMap: Record<string, NavigationAction> = {
    KeyW: 'up',
    KeyA: 'left',
    KeyS: 'down',
    KeyD: 'right',
    KeyQ: 'previousSystem',
    KeyE: 'nextSystem',
    KeyM: 'menu',
    KeyF: 'favorite',
  }
  if (e.code && codeMap[e.code]) return codeMap[e.code]
  return null
}

const DEFAULT_INITIAL_DELAY = 400
const DEFAULT_REPEAT_INTERVAL = 120

interface KeyState {
  action: NavigationAction
  timeoutId: number | null
  intervalId: number | null
}

export type KeyboardAdapter = InputAdapter & ((() => void) & { start: () => void; stop: () => void; isActive: () => boolean })

export function createKeyboardAdapter(onAction: InputHandler): KeyboardAdapter {
  const keyStates = new Map<string, KeyState>()
  let active = false

  function emit(action: NavigationAction, repeat: boolean) {
    const ts = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    onAction({ action, source: 'keyboard', repeat, timestamp: ts } as InputEvent)
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (isEditableKeyboardTarget(ev.target)) return
    const action = keyboardToAction(ev)
    if (!action) return
    if (NAV_KEYS_BLOCK_SCROLL.has(ev.key) || action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      ev.preventDefault()
    }
    const keyId = ev.code || ev.key
    const existing = keyStates.get(keyId)
    if (existing && ev.repeat) return
    if (existing) return
    emit(action, false)
    const state: KeyState = { action, timeoutId: null, intervalId: null }
    const timeoutId = window.setTimeout(() => {
      const intervalId = window.setInterval(() => {
        emit(action, true)
      }, DEFAULT_REPEAT_INTERVAL) as unknown as number
      state.intervalId = intervalId
      state.timeoutId = null
    }, DEFAULT_INITIAL_DELAY) as unknown as number
    state.timeoutId = timeoutId
    keyStates.set(keyId, state)
  }

  function handleKeyUp(ev: KeyboardEvent) {
    const keyId = ev.code || ev.key
    const state = keyStates.get(keyId)
    if (!state) return
    if (state.timeoutId !== null) window.clearTimeout(state.timeoutId)
    if (state.intervalId !== null) window.clearInterval(state.intervalId)
    keyStates.delete(keyId)
  }

  function start() {
    if (active) return
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    active = true
  }

  function stop() {
    if (!active) return
    if (typeof window !== 'undefined') {
      try { window.removeEventListener('keydown', handleKeyDown) } catch {}
      try { window.removeEventListener('keyup', handleKeyUp) } catch {}
    }
    for (const [, st] of keyStates) {
      if (st.timeoutId !== null) {
        try { window.clearTimeout(st.timeoutId) } catch {}
      }
      if (st.intervalId !== null) {
        try { window.clearInterval(st.intervalId) } catch {}
      }
    }
    keyStates.clear()
    active = false
  }

  const cleanup = function cleanup() {
    stop()
  } as unknown as KeyboardAdapter

  Object.assign(cleanup, {
    start,
    stop,
    isActive: () => active,
  })

  return cleanup
}

/** Variant returning explicit cleanup function – side-effect free construction */
export function createKeyboardCleanup(onAction: InputHandler): () => void {
  const adapter = createKeyboardAdapter(onAction)
  return () => adapter.stop()
}
