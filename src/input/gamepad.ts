import type { NavigationAction, InputEvent, InputHandler, GamepadAdapter as GamepadAdapterInterface } from './types'

const DEADZONE = 0.25
const INITIAL_DELAY = 400
const REPEAT_INTERVAL = 120

type ButtonMap = Partial<Record<number, NavigationAction>>

/**
 * V8.4.1 – Controller mapping hardened (ADDITIVE, does not steal X/Y):
 * - System view: L/R system cycle, A = library, B not used, Menu = settings, Y stays FREE (not discover), View/Select (8) = DISCOVER additive.
 * - Library view: L/R game cycle, A play, B back to system, X = media cycle (preserved), Y = favorite toggle (preserved), View/Select (8)=DISCOVER prefilled.
 * - Gamepad Y (button 3) remains favorite for parity with keyboard Y; discover is dedicated to View/Search.
 */
const DEFAULT_BUTTON_MAP: ButtonMap = {
  0: 'confirm',
  1: 'back',
  2: 'media', // X (west) – MEDIA cycle – preserves existing Library X action (keyboard X = media)
  3: 'favorite', // Y (north) – favorite toggle – preserves existing Library Y action (keyboard Y/F = favorite)
  8: 'search', // Select/View – DISCOVER dedicated additive entry (search = / ? on keyboard)
  9: 'menu',   // Start/Menu = settings
  4: 'previousSystem',
  5: 'nextSystem',
}

export const ANALOG_DEADZONE = DEADZONE
export const GAMEPAD_INITIAL_DELAY = INITIAL_DELAY
export const GAMEPAD_REPEAT_INTERVAL = REPEAT_INTERVAL

export interface GamepadAdapterOptions {
  deadzone?: number
  initialDelay?: number
  repeatInterval?: number
}

type DirectionState = {
  pressed: boolean
  lastEmit: number
  repeatTimeoutId: number | null
  repeatIntervalId: number | null
  firstPressAt: number | null
}

export function gamepadButtonToAction(index: number): NavigationAction | null {
  if (index >= 12 && index <= 15) {
    const map: Record<number, NavigationAction> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' }
    return map[index] ?? null
  }
  return DEFAULT_BUTTON_MAP[index] ?? null
}

class GamepadAdapterImpl implements GamepadAdapterInterface {
  private handler: InputHandler
  private running = false
  private rafId: number | null = null
  private actionState = new Map<NavigationAction, DirectionState>()
  private opts: Required<GamepadAdapterOptions>

  constructor(handler: InputHandler, opts?: GamepadAdapterOptions) {
    this.handler = handler
    this.opts = {
      deadzone: opts?.deadzone ?? DEADZONE,
      initialDelay: opts?.initialDelay ?? INITIAL_DELAY,
      repeatInterval: opts?.repeatInterval ?? REPEAT_INTERVAL,
    }
    const all: NavigationAction[] = ['up','down','left','right','confirm','back','menu','favorite','search','nextSystem','previousSystem','media']
    for (const a of all) {
      this.actionState.set(a, { pressed: false, lastEmit: 0, repeatTimeoutId: null, repeatIntervalId: null, firstPressAt: null })
    }
  }

  isActive(): boolean {
    return this.running
  }

  getConnectedGamepads(): (Gamepad | null)[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
    try {
      return Array.from(navigator.getGamepads() || [])
    } catch {
      return []
    }
  }

  start() {
    if (this.running) return
    if (typeof window === 'undefined') return
    this.running = true
    window.addEventListener('gamepadconnected', this.onConnect)
    window.addEventListener('gamepaddisconnected', this.onDisconnect)
    this.poll()
  }

  stop() {
    if (!this.running && this.rafId === null) {
      // idempotent: already stopped – still ensure listeners removed safely (noop if never added)
      if (typeof window !== 'undefined') {
        try { window.removeEventListener('gamepadconnected', this.onConnect) } catch {}
        try { window.removeEventListener('gamepaddisconnected', this.onDisconnect) } catch {}
      }
      return
    }
    this.running = false
    if (typeof window !== 'undefined') {
      try { window.removeEventListener('gamepadconnected', this.onConnect) } catch {}
      try { window.removeEventListener('gamepaddisconnected', this.onDisconnect) } catch {}
    }
    if (this.rafId !== null) {
      try { cancelAnimationFrame(this.rafId) } catch {}
      this.rafId = null
    }
    for (const [, st] of this.actionState) {
      if (st.repeatTimeoutId !== null) {
        try { window.clearTimeout(st.repeatTimeoutId) } catch {}
      }
      if (st.repeatIntervalId !== null) {
        try { window.clearInterval(st.repeatIntervalId) } catch {}
      }
      st.repeatTimeoutId = null
      st.repeatIntervalId = null
      st.pressed = false
      st.firstPressAt = null
    }
  }

  private onConnect = (e: Event) => {
    const ge = e as GamepadEvent
    if (typeof console !== 'undefined' && console.info) {
      console.info('[Gamepad] connected', ge.gamepad.id)
    }
  }

  private onDisconnect = (e: Event) => {
    const ge = e as GamepadEvent
    if (typeof console !== 'undefined' && console.info) {
      console.info('[Gamepad] disconnected', ge.gamepad.id)
    }
    for (const [, st] of this.actionState) {
      if (st.repeatTimeoutId !== null) window.clearTimeout(st.repeatTimeoutId)
      if (st.repeatIntervalId !== null) window.clearInterval(st.repeatIntervalId)
      st.repeatTimeoutId = null
      st.repeatIntervalId = null
      st.pressed = false
      st.firstPressAt = null
    }
  }

  private poll = () => {
    if (!this.running) return
    try {
      const gps = this.getConnectedGamepads()
      const pressedThisFrame = new Set<NavigationAction>()

      for (const gp of gps) {
        if (!gp) continue
        this.collectActionsFromGamepad(gp, pressedThisFrame)
      }

      for (const [action, st] of this.actionState) {
        const isPressed = pressedThisFrame.has(action)
        if (isPressed) {
          if (!st.pressed) {
            st.pressed = true
            st.firstPressAt = performance.now()
            this.emit(action, false)
            st.lastEmit = performance.now()
            if (st.repeatTimeoutId !== null) window.clearTimeout(st.repeatTimeoutId)
            if (st.repeatIntervalId !== null) window.clearInterval(st.repeatIntervalId)
            st.repeatTimeoutId = window.setTimeout(() => {
              st.repeatIntervalId = window.setInterval(() => {
                if (st.pressed) this.emit(action, true)
              }, this.opts.repeatInterval) as unknown as number
            }, this.opts.initialDelay) as unknown as number
          }
        } else {
          if (st.pressed) {
            if (st.repeatTimeoutId !== null) window.clearTimeout(st.repeatTimeoutId)
            if (st.repeatIntervalId !== null) window.clearInterval(st.repeatIntervalId)
            st.repeatTimeoutId = null
            st.repeatIntervalId = null
            st.pressed = false
            st.firstPressAt = null
          }
        }
      }
    } catch {
      // polling must never throw
    }
    this.rafId = requestAnimationFrame(this.poll)
  }

  private emit(action: NavigationAction, repeat: boolean) {
    const ts = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    const evt: InputEvent = { action, source: 'gamepad', repeat, timestamp: ts }
    try {
      this.handler(evt)
    } catch {
      // handler errors must not break polling
    }
    const st = this.actionState.get(action)
    if (st) st.lastEmit = ts as number
  }

  private collectActionsFromGamepad(gp: Gamepad, pressed: Set<NavigationAction>) {
    const dz = this.opts.deadzone
    const dpadMap: Record<number, NavigationAction> = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' }
    for (const [idxStr, act] of Object.entries(dpadMap)) {
      const idx = parseInt(idxStr, 10)
      const btn = gp.buttons[idx]
      if (btn && btn.pressed) pressed.add(act)
    }

    const ax0 = gp.axes[0] ?? 0
    const ax1 = gp.axes[1] ?? 0
    if (Math.abs(ax0) > dz || Math.abs(ax1) > dz) {
      if (ax1 < -dz) pressed.add('up')
      else if (ax1 > dz) pressed.add('down')
      if (ax0 < -dz) pressed.add('left')
      else if (ax0 > dz) pressed.add('right')
    }

    const ax2 = gp.axes[2] ?? 0
    const ax3 = gp.axes[3] ?? 0
    if (Math.abs(ax2) > dz || Math.abs(ax3) > dz) {
      if (!(Math.abs(ax0) > dz || Math.abs(ax1) > dz)) {
        if (ax3 < -dz) pressed.add('up')
        else if (ax3 > dz) pressed.add('down')
        if (ax2 < -dz) pressed.add('left')
        else if (ax2 > dz) pressed.add('right')
      }
    }

    for (const [btnIdxStr, action] of Object.entries(DEFAULT_BUTTON_MAP)) {
      const btnIdx = parseInt(btnIdxStr, 10)
      const btn = gp.buttons[btnIdx]
      if (btn && btn.pressed) {
        pressed.add(action)
      }
    }
  }
}

export function createGamepadAdapter(handler: InputHandler, options?: GamepadAdapterOptions): GamepadAdapterInterface {
  return new GamepadAdapterImpl(handler, options)
}

// Legacy class export – avoid merging conflict by exporting under distinct name but also as GamepadAdapterImpl for interop
export { GamepadAdapterImpl as GamepadAdapterClass }
export const GamepadAdapter = GamepadAdapterImpl
