/**
 * Lifecycle controller – visibilitychange / blur pause, crystal-background-suspended,
 * handoff restore, safe mode gating.
 */

export function setupLifecycleHandlers(opts: {
  onSuspend: () => void
  onResume: () => void
  onSafeModeDetected?: (safe: boolean) => void
}) {
  const { onSuspend, onResume } = opts

  let suspended = false
  const suspend = () => {
    if (suspended) return
    suspended = true
    document.documentElement.classList.add('crystal-background-suspended')
    onSuspend()
  }
  const resume = () => {
    if (!suspended) return
    suspended = false
    document.documentElement.classList.remove('crystal-background-suspended')
    onResume()
  }

  const handleVisibility = () => {
    if (document.hidden) suspend()
    else resume()
  }
  const handleBlur = () => suspend()
  const handleFocus = () => resume()

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('blur', handleBlur)
  window.addEventListener('focus', handleFocus)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('blur', handleBlur)
    window.removeEventListener('focus', handleFocus)
  }
}

export function shouldPauseMedia(hidden: boolean): boolean {
  // Pause videos animation on blur / visibilitychange + crystal-background-suspended
  if (hidden) return true
  if (document.documentElement.classList.contains('crystal-background-suspended')) return true
  return false
}
