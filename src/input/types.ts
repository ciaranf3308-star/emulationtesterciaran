export type NavigationAction = 'up'|'down'|'left'|'right'|'confirm'|'back'|'menu'|'favorite'|'search'|'nextSystem'|'previousSystem'

export type InputSource = 'keyboard'|'gamepad'|'mouse'

export interface InputEvent {
  action: NavigationAction
  source: InputSource
  repeat: boolean
  timestamp: number
  /** Optional pointer details for mouse */
  pointer?: { x: number; y: number }
}

export interface InputAdapter {
  start(): void
  stop(): void
  isActive?: () => boolean
}

export interface GamepadAdapter extends InputAdapter {
  isActive(): boolean
  getConnectedGamepads(): (Gamepad | null)[]
}

export type InputHandler = (e: InputEvent) => void

export const DIRECTIONAL_ACTIONS: readonly NavigationAction[] = ['up','down','left','right','nextSystem','previousSystem'] as const
export const SYSTEM_SWITCH_ACTIONS: readonly NavigationAction[] = ['nextSystem','previousSystem'] as const

export function isDirectional(action: NavigationAction): boolean {
  return (DIRECTIONAL_ACTIONS as readonly string[]).includes(action)
}
