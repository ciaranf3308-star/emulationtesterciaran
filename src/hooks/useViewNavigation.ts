import { useCallback } from 'react'
import type { NavigationAction } from '../input/types'

export type View = 'systems'|'library'|'allgames'|'favorites'|'recent'|'settings'

export interface ViewNavigationDeps {
  view: View
  systemIds: string[]
  selected?: string
  setSelected?: (id: string)=>void
  setView?: (v: View)=>void
}

export const DIRECTIONAL_FOR_SYSTEM_SWITCH = new Set<NavigationAction>(['up','down','left','right','previousSystem','nextSystem'])
export const SYSTEM_SWITCH_ACTIONS = new Set<NavigationAction>(['left','right','up','down','previousSystem','nextSystem'])

/**
 * Core pure factory – no hooks – view-aware routing.
 * Returns handler (action)=>void that routes appropriately.
 *
 * Rules:
 * - systems view: left/right/up/down/previousSystem/nextSystem = system nav, confirm opens library.
 * - library view: directional reserved (noop, future game focus), back -> systems, previousSystem/nextSystem blocked (do NOT mutate selected) to prevent bug.
 * - settings/allgames/favorites/recent: directional blocked from mutating selected, back -> systems.
 * - Do NOT implement fake game-grid movement.
 */
export function createViewAwareHandler(deps: ViewNavigationDeps): (action: NavigationAction)=>void {
  const { view, systemIds, selected, setSelected, setView } = deps

  function sysStep(dir: 1 | -1) {
    if (!setSelected) return
    if (!systemIds.length) return
    const idx = selected ? systemIds.indexOf(selected) : 0
    const safeIdx = idx < 0 ? 0 : idx
    const next = (safeIdx + dir + systemIds.length) % systemIds.length
    setSelected(systemIds[next])
  }

  return (action: NavigationAction) => {
    switch (view) {
      case 'systems': {
        if (action === 'left' || action === 'up' || action === 'previousSystem') {
          sysStep(-1)
        } else if (action === 'right' || action === 'down' || action === 'nextSystem') {
          sysStep(1)
        } else if (action === 'confirm') {
          setView?.('library')
        } else if (action === 'back') {
          // noop / maybe close – keep on systems
        } else if (action === 'menu') {
          setView?.('settings')
        }
        break
      }
      case 'library': {
        // directional reserved for future game focus – MUST NOT switch systems
        if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
          // reserved – noop
          return
        }
        if (action === 'previousSystem' || action === 'nextSystem') {
          // Spec-safe: block global mutation in unrelated view.
          // Optionally could switch platform inside library if intentionally supported,
          // but for V5 prevent bug. Log for debug.
          if (typeof console !== 'undefined' && console.debug) {
            console.debug(`[view-nav] blocked ${action} in library view (reserved)`)
          }
          return
        }
        if (action === 'back') {
          setView?.('systems')
          return
        }
        if (action === 'menu') {
          setView?.('settings')
          return
        }
        // confirm reserved for future game launch
        break
      }
      case 'settings':
      case 'allgames':
      case 'favorites':
      case 'recent': {
        if (DIRECTIONAL_FOR_SYSTEM_SWITCH.has(action)) {
          // directional belongs to settings focus or reserved sub-view – block system switch
          if (typeof console !== 'undefined' && console.debug) {
            console.debug(`[view-nav] blocked ${action} in ${view} view`)
          }
          return
        }
        if (action === 'back') {
          setView?.('systems')
          return
        }
        if (action === 'menu' && view !== 'settings') {
          setView?.('settings')
          return
        }
        if (action === 'confirm' && view === 'settings') {
          // settings internal confirm handled by component focus – noop here
          return
        }
        break
      }
      default:
        break
    }
  }
}

/**
 * Hook wrapper – stable callback identity tied to deps.
 */
export function useViewNavigation(deps: ViewNavigationDeps): (action: NavigationAction)=>void {
  const { view, systemIds, selected, setSelected, setView } = deps
  const handler = useCallback(
    createViewAwareHandler({ view, systemIds, selected, setSelected, setView }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, selected, /* systemIds deep */ JSON.stringify(systemIds), setSelected, setView]
  )
  return handler
}
