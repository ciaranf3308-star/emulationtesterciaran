import { useEffect, useMemo, useRef } from 'react'
import { createKeyboardAdapter } from '../input/keyboard'
import { createGamepadAdapter } from '../input/gamepad'
import type { NavigationAction } from '../input/types'

/**
 * StrictMode-safe semantic input hook.
 * - Construction side-effect free
 * - Stable adapter instances (useMemo empty dep) reading latest onAction via ref
 * - Effect owns start/stop lifecycle, handles mount/unmount/remount
 */
export function useSemanticInput(onAction: (a: NavigationAction)=>void) {
  const handlerRef = useRef(onAction)
  useEffect(()=>{ handlerRef.current = onAction }, [onAction])

  const keyboardAdapter = useMemo(()=> createKeyboardAdapter((e)=> {
    try { handlerRef.current(e.action) } catch {}
  }), [])

  const gamepadAdapter = useMemo(()=> createGamepadAdapter((e)=> {
    try { handlerRef.current(e.action) } catch {}
  }), [])

  useEffect(()=>{
    keyboardAdapter.start()
    gamepadAdapter.start()
    return ()=>{
      keyboardAdapter.stop()
      gamepadAdapter.stop()
    }
  },[keyboardAdapter, gamepadAdapter])
}
