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
    let adaptersActive = true
    const suspend = () => {
      if (!adaptersActive) return
      adaptersActive = false
      keyboardAdapter.stop()
      gamepadAdapter.stop()
    }
    const resume = () => {
      if (adaptersActive) return
      adaptersActive = true
      // Restoring a native Tauri window does not always restore keyboard
      // focus to WebView2. Give the web content a focus target once on resume
      // so keyboard/controller navigation works immediately after play.
      const focusTarget = document.getElementById('root') ?? document.body
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1')
      focusTarget.focus({ preventScroll: true })
      keyboardAdapter.start()
      gamepadAdapter.start()
    }
    window.addEventListener('blur', suspend)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)

    // WebView2 does not reliably emit a DOM focus event when Tauri regains the
    // foreground after an emulator exits. Subscribe to the native window
    // signal so keyboard and Ally gamepad polling always resume on return.
    let disposed = false
    let unlistenNativeFocus: (() => void) | null = null
    let nativeFocusPoll: number | null = null
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (disposed) return
      const nativeWindow = getCurrentWindow()
      const reconcileNativeFocus = async () => {
        try {
          if (await nativeWindow.isFocused()) resume()
          else suspend()
        } catch {}
      }
      unlistenNativeFocus = await nativeWindow.onFocusChanged(({ payload }) => {
        if (payload) resume()
        else suspend()
      })
      await reconcileNativeFocus()
      // Windows/WebView2 occasionally restores Crystal without delivering
      // either DOM or native focus-change callbacks. Two cheap native checks
      // per second close that gap while keeping gamepad polling suspended
      // whenever the emulator actually owns focus.
      nativeFocusPoll = window.setInterval(reconcileNativeFocus, 500)
    }).catch(() => {})
    return ()=>{
      disposed = true
      window.removeEventListener('blur', suspend)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      try { unlistenNativeFocus?.() } catch {}
      if (nativeFocusPoll !== null) window.clearInterval(nativeFocusPoll)
      adaptersActive = false
      keyboardAdapter.stop()
      gamepadAdapter.stop()
    }
  },[keyboardAdapter, gamepadAdapter])
}
