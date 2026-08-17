/**
 * useCrystalNavigation – thin React hook wrapping navigation controller
 * Generic preservation for controller-first extraction.
 */

import { useCallback, useMemo, useState } from 'react'
import { navigationReducer, type NavigationContext, type CrystalRoute, type NavigationAction } from '../controllers/navigation'

const INITIAL_NAV: NavigationContext = {
  route: 'systems' as CrystalRoute,
  backgroundRoute: null,
  selectedSystemId: null,
  selectedFocus: { section: 'systems', index: 0 },
}

export function useCrystalNavigation() {
  const [state, setState] = useState<NavigationContext>(INITIAL_NAV)

  const dispatch = useCallback((action: NavigationAction) => {
    setState(prev => navigationReducer(prev, action))
  }, [])

  const navigate = useCallback((route: CrystalRoute) => dispatch({ type: 'NAVIGATE', payload: route }), [dispatch])
  const selectSystem = useCallback((systemId: string) => dispatch({ type: 'SELECT_SYSTEM', payload: systemId }), [dispatch])
  const back = useCallback(() => dispatch({ type: 'BACK' }), [dispatch])

  const memoized = useMemo(() => ({
    ...state,
    navigate,
    selectSystem,
    back,
    dispatch,
  }), [state, navigate, selectSystem, back, dispatch])

  return memoized
}
