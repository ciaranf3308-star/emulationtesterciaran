/**
 * Micro Sound + Haptic – V3.1
 * - WebAudio tick, lazy AudioContext, respects mute pref (crystal_sounds_enabled, default off)
 * - Volume low 0.12
 * - Haptic via vibrationActuator 20ms dual-rumble
 */

let ctx: AudioContext | null = null

function isSoundsEnabledInternal(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const v = window.localStorage.getItem('crystal_sounds_enabled')
    if (v === '1' || v === 'true') return true
    return false // default off
  } catch {
    return false
  }
}

export function isSoundsEnabled(): boolean {
  return isSoundsEnabledInternal()
}

export function setSoundsEnabled(enabled: boolean) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem('crystal_sounds_enabled', enabled ? '1' : '0')
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('crystal:sounds-changed', { detail: { enabled } } as any))
  } catch {}
}

function getAudioContextLazy(): AudioContext | null {
  if (!isSoundsEnabledInternal()) return null
  if (ctx) return ctx
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx() as AudioContext
    return ctx
  } catch {
    return null
  }
}

export function playTick(freq = 880, durMs = 60, volume = 0.12) {
  if (!isSoundsEnabledInternal()) return
  try {
    const ac = getAudioContextLazy()
    if (!ac) return
    // resume if suspended (autoplay policy)
    if (ac.state === 'suspended') {
      ac.resume().catch(() => {})
    }
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durMs / 1000)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(ac.currentTime)
    osc.stop(ac.currentTime + durMs / 1000 + 0.02)
    osc.onended = () => {
      try { osc.disconnect() } catch {}
      try { gain.disconnect() } catch {}
    }
  } catch {}
}

export function playConfirm() {
  playTick(880, 60, 0.12)
}

export function playBack() {
  playTick(440, 80, 0.11)
}

export function triggerHaptic() {
  try {
    if (typeof navigator === 'undefined' || typeof (navigator as any).getGamepads !== 'function') return
    const gps = (navigator as any).getGamepads() as (Gamepad & { vibrationActuator?: any })[] | null
    if (!gps) return
    for (const gp of gps) {
      if (!gp) continue
      const actuator = (gp as any).vibrationActuator
      if (actuator?.playEffect) {
        try {
          actuator.playEffect('dual-rumble', {
            duration: 20,
            strongMagnitude: 0.3,
            weakMagnitude: 0.2,
            startDelay: 0,
          })
        } catch {
          // some browsers require object with duration only, or older pulse alternative
          try { (gp as any).vibrationActuator?.pulse?.(0.3, 20) } catch {}
        }
      } else if ((navigator as any).vibrate) {
        // fallback for mobile-style vibration API
        try { (navigator as any).vibrate(20) } catch {}
      }
    }
  } catch {}
}

// Close context on pre-exit to free resources
if (typeof window !== 'undefined') {
  window.addEventListener('crystal:pre-exit-cleanup' as any, () => {
    try {
      ctx?.close().catch(() => {})
    } catch {}
    ctx = null
  })
}
