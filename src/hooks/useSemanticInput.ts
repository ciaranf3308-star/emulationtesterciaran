import { useEffect, useMemo } from 'react'
import { createKeyboardAdapter } from '../input/keyboard'
import { createGamepadAdapter } from '../input/gamepad'
import type { NavigationAction } from '../input/types'

export function useSemanticInput(onAction: (a: NavigationAction)=>void) {
  const keyboardAdapter = useMemo(()=> createKeyboardAdapter((e)=> onAction(e.action)), [onAction])
  const gamepadAdapter = useMemo(()=> createGamepadAdapter((e)=> onAction(e.action)), [onAction])

  useEffect(()=>{
    keyboardAdapter.start()
    gamepadAdapter.start()
    return ()=>{
      keyboardAdapter.stop()
      gamepadAdapter.stop()
    }
  },[keyboardAdapter, gamepadAdapter])
}
