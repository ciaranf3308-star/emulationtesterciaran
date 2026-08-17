/**
 * V3 navigation controller – extracted from App.tsx monolith
 * Thin, framework-agnostic navigation state machine.
 * Handles route transitions, system selection, carousel index management.
 */

export type CrystalRoute = 'systems' | 'library' | 'store' | 'settings' | 'diagnostics'

export type NavigationContext = {
  route: CrystalRoute
  backgroundRoute: CrystalRoute | null
  selectedSystemId: string | null
  selectedFocus: { section: 'systems' | 'library' | 'settings'; index: number }
}

export type NavigationAction =
  | { type: 'NAVIGATE'; payload: CrystalRoute }
  | { type: 'SELECT_SYSTEM'; payload: string }
  | { type: 'BACK' }
  | { type: 'SET_SYSTEM_FOCUS'; payload: number }

const SECTIONS_ORDER: CrystalRoute[] = ['systems', 'library', 'store', 'settings']

export function navigationReducer(ctx: NavigationContext, action: NavigationAction): NavigationContext {
  switch (action.type) {
    case 'NAVIGATE':
      if (ctx.route === action.payload) return ctx
      // preserve background route for return transitions (V3 choreography)
      return { ...ctx, backgroundRoute: ctx.route, route: action.payload }
    case 'SELECT_SYSTEM':
      return { ...ctx, selectedSystemId: action.payload, backgroundRoute: ctx.route, route: 'library' }
    case 'SET_SYSTEM_FOCUS':
      return { ...ctx, selectedFocus: { ...ctx.selectedFocus, index: action.payload } }
    case 'BACK':
      if (ctx.route === 'library') {
        return { ...ctx, route: 'systems', backgroundRoute: null }
      }
      // fallback home
      return { ...ctx, route: 'systems', backgroundRoute: ctx.backgroundRoute }
    default:
      return ctx
  }
}

export function getNextSystemIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0
  let next = current + delta
  if (next < 0) next = length - 1
  if (next >= length) next = 0
  return next
}

export function getSectionIndex(route: CrystalRoute): number {
  const idx = SECTIONS_ORDER.indexOf(route)
  return idx >= 0 ? idx : 0
}
