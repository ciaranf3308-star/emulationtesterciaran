import { useMemo, useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react'
import type { SystemStageProps, GameplaySource } from './types'
import { getSystemAccent } from './accentMap'

/**
 * SystemStage — V7.3 showroom STORE hero
 *
 * - V7.1 shared hardware-frame coordinate system preserved
 * - V7.2 background defocus remains library-only
 * - V7.3 adds outer showroom-wrapper transform so calibrated inner frame NEVER breaks
 * - Storefront hardware visible large right hero (not hidden)
 * - Storefront idle glass treatment when no selected game media
 * - Background remains sharp storefront, blurred/dimmed library
 * - All filters isolated – never blur hardware/gameplay/physical
 */

function normalizeMediaSources(
  gameplaySources: GameplaySource[] | undefined,
  regions: { id: string }[],
  legacyMedia?: SystemStageProps['media']
): Map<string, GameplaySource | undefined> {
  const map = new Map<string, GameplaySource | undefined>()
  if (gameplaySources && gameplaySources.length > 0) {
    for (const src of gameplaySources) {
      if (src?.regionId) map.set(src.regionId, src)
    }
    if (map.size < regions.length && legacyMedia && (legacyMedia as any).url) {
      const fallback = legacyMedia as any as GameplaySource
      for (const r of regions) {
        if (!map.has(r.id)) map.set(r.id, { ...fallback, regionId: r.id } as any)
      }
    }
    return map
  }
  if (legacyMedia) {
    const legacy = Array.isArray(legacyMedia) ? (legacyMedia as any)[0] : legacyMedia
    if (legacy?.url) {
      for (const r of regions) {
        map.set(r.id, { regionId: r.id, url: legacy.url, mediaType: legacy.mediaType || 'image', posterUrl: legacy.posterUrl, alt: legacy.alt } as GameplaySource)
      }
    }
  }
  return map
}

function resolvePhysicalMediaTransform(transform?: any): React.CSSProperties {
  if (!transform) return { position: 'absolute', left: '58%', top: '42%', width: '18%', transform: 'translateZ(0) rotate(-8deg)' }
  const s: React.CSSProperties = {
    position: 'absolute',
    left: transform.x != null ? `${transform.x}%` : transform.left != null ? `${transform.left}%` : '58%',
    top: transform.y != null ? `${transform.y}%` : transform.top != null ? `${transform.top}%` : '42%',
    width: transform.scale != null ? `${18 * transform.scale}%` : transform.width != null ? `${transform.width}%` : '18%',
    transform: `translateZ(0) ${transform.rotateZ != null ? `rotate(${transform.rotateZ}deg)` : transform.rotation != null ? `rotate(${transform.rotation}deg)` : 'rotate(-8deg)'} ${transform.scale ? '' : ''}`,
  }
  if (transform.rotateZ != null && transform.scale != null) {
    s.transform = `translateZ(0) rotate(${transform.rotateZ}deg) scale(${transform.scale})`
  } else if (transform.rotateZ != null) {
    s.transform = `translateZ(0) rotate(${transform.rotateZ}deg)`
  } else if (transform.scale != null) {
    s.transform = `translateZ(0) rotate(-8deg) scale(${transform.scale})`
  } else if (transform.rotation != null) {
    s.transform = `translateZ(0) rotate(${transform.rotation}deg)`
  }
  return s
}

function fitToObjectFit(fit?: string): 'contain' | 'cover' | 'fill' {
  if (!fit) return 'contain'
  if (fit === 'cover') return 'cover'
  if (fit === 'stretch') return 'fill'
  return 'contain'
}

function cornerRadiusToCss(radius?: number | string): string | undefined {
  if (radius == null) return undefined
  if (typeof radius === 'number') return `${radius}px`
  return radius
}

type FrameBounds = {
  left: number
  top: number
  width: number
  height: number
  ready: boolean
  isFull: boolean
}

export function SystemStage({
  config,
  theme,
  media,
  gameplaySources,
  showGuides,
  backgroundUrl,
  physicalMediaUrl,
  physicalMediaImageUrl,
  children,
  className,
  style,
  isEntered,
  mode,
}: SystemStageProps & { isEntered?: boolean; mode?: 'storefront' | 'library' }) {
  const entered = mode ? mode === 'library' : !!isEntered

  const bg = useMemo(() => {
    const explicit = backgroundUrl
    if (explicit) return explicit
    const b = config.background
    if (!b) return undefined
    if (b.url) return b.url
    return theme === 'light' ? b.light || b.dark : b.dark || b.light
  }, [config.background, backgroundUrl, theme])

  const sourceMap = useMemo(
    () => normalizeMediaSources(gameplaySources, config.gameplayRegions, media),
    [gameplaySources, config.gameplayRegions, media]
  )

  const physicalUrl = physicalMediaUrl || physicalMediaImageUrl || (config.physicalMedia as any)?.url || (media as any)?.physicalMedia || (media as any)?.physicalMediaUrl

  const physicalConfig = useMemo(() => {
    const placement = (config as any).physicalMediaPlacement
    if (placement) return { type: placement.type, transform: placement.transform, zIndex: placement.zIndex, slotMask: placement.slotMask, slotTarget: placement.slotTarget }
    return config.physicalMediaConfig || (config.physicalMedia ? { type: config.physicalMedia.type, transform: config.physicalMedia.transform } as any : undefined)
  }, [config])

  const foregroundZ = (config as any).foregroundZIndex ?? 4
  const mediaZ = (config as any).mediaZIndex ?? 2
  const physicalZ = (physicalConfig as any)?.zIndex ?? 3
  const uiSafe = (config as any).uiSafe as { top?: number; bottom?: number; left?: number; right?: number } | undefined

  const showroomPlacement = (config as any).showroomPlacement as {
    x?: number
    y?: number
    scale?: number
    maxWidth?: string | number
    maxHeight?: string | number
    anchor?: string
    translateY?: number | string
    library?: { x?: number; y?: number; scale?: number }
  } | undefined

  const screenMaskForRegion = (regionId: string): string | undefined => {
    if (config.screenMasks && config.screenMasks[regionId]) return config.screenMasks[regionId]
    const regions = config.gameplayRegions as any[]
    const region = regions.find((r: any) => r.id === regionId)
    if (region?.maskUrl) return region.maskUrl
    if (region?.maskId) return region.maskId
    return (config as any).screenMask
  }

  const slotMask = useMemo(() => {
    if (config.slotMasks) return Object.values(config.slotMasks)[0] as string
    const placementSlotMask = (config as any).physicalMediaPlacement?.slotMask
    if (placementSlotMask) return placementSlotMask
    return (config as any).slotMask
  }, [config])

  const hwUrl = config.hardwareForeground
  const hwAlt = (config as any).hardwareForegroundAlternate as string | undefined
  const hwDisplayUrl = hwUrl

  const stageRef = useRef<HTMLDivElement>(null)
  const showroomRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  /**
   * Hardware frame invariant:
   * Outer `.hardware-showroom-wrapper` is presentation-only – it is scaled via `transform: scale(...)`
   * for storefront hero offset. CSS transforms DO NOT affect layout box size – ResizeObserver's
   * `contentRect` and `clientWidth/clientHeight` report the untransformed layout dimensions.
   * `getBoundingClientRect()` DOES include transforms (scale causes larger rect) and must NOT be used
   * for computing inner calibrated `frame.width/height`, otherwise we get geometry dependency loop:
   * outer scale changes -> bounding rect changes -> frame resizes -> visual drift.
   *
   * Correct invariant: measure via ResizeObserver entry.contentRect (or contentBoxSize.inlineSize/blockSize)
   * which stays stable across outer scale. Fallback to element.clientWidth/clientHeight – also untransformed.
   *
   * This guarantees frame computation from naturalSize + containerSize is independent of placementScale.
   *
   * Numeric test notes (validate no drift when placementScale varies):
   *  - container 1254×1254 square: aImg = iw/ih drives fw=fh mapping, frame stays 1254×1254 scaled contain
   *  - container 1024×1536 portrait: if iw/ih < cw/ch, fw = ch*aImg, centered horizontally – invariant under outer scale
   *  - container 1536×1024 landscape: if iw/ih > cw/ch, fh = cw/aImg, centered vertically – invariant under outer scale
   * Changing showroomPlacement.scale from 0.8..1.6 must not alter frame.width/height, only wrapper visual scale.
   */
  const measureUntransformed = useCallback((entry?: ResizeObserverEntry) => {
    const el = showroomRef.current || stageRef.current
    if (!el) return
    let w = 0
    let h = 0

    if (entry) {
      const cr = entry.contentRect
      if (cr && cr.width > 0 && cr.height > 0) {
        w = cr.width
        h = cr.height
      }
      // contentBoxSize spec – newer browsers return array [ { inlineSize, blockSize } ]
      if ((!w || !h) && (entry as any).contentBoxSize) {
        const cb = (entry as any).contentBoxSize
        const box = Array.isArray(cb) ? cb[0] : cb
        if (box && box.inlineSize > 0 && box.blockSize > 0) {
          // inlineSize ~ width (horizontal writing mode), blockSize ~ height
          w = box.inlineSize
          h = box.blockSize
        }
      }
    }

    if (!w || !h) {
      // clientWidth/clientHeight are untransformed layout box – NOT affected by CSS transform scale
      // Outer wrapper scaling does not change these values – perfect for inner calibrated frame.
      w = el.clientWidth
      h = el.clientHeight
    }

    if (w > 0 && h > 0) {
      setContainerSize(prev => {
        if (prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5) return prev
        return { w, h }
      })
    }
  }, [])

  const measureFallback = useCallback(() => measureUntransformed(), [measureUntransformed])

  useLayoutEffect(() => {
    if (!showroomRef.current && !stageRef.current) return
    // initial sync measure – uses clientWidth fallback (untransformed)
    measureFallback()
    if (typeof ResizeObserver !== 'undefined') {
      const target = showroomRef.current || stageRef.current!
      const ro = new ResizeObserver((entries) => {
        const e = entries[0]
        measureUntransformed(e)
      })
      ro.observe(target)
      return () => ro.disconnect()
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', measureFallback)
      return () => window.removeEventListener('resize', measureFallback)
    }
  }, [measureUntransformed, measureFallback, entered, showroomPlacement?.scale, showroomPlacement?.maxWidth])

  useEffect(() => {
    if (!hwDisplayUrl) {
      setNaturalSize(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => {
      if (!cancelled) setNaturalSize(null)
    }
    ;(img as any).decoding = 'async'
    img.src = hwDisplayUrl
    return () => {
      cancelled = true
    }
  }, [hwDisplayUrl])

  const frame: FrameBounds = useMemo(() => {
    if (!containerSize) return { left: 0, top: 0, width: 0, height: 0, ready: false, isFull: true }
    const cw = containerSize.w
    const ch = containerSize.h
    if (!naturalSize || !hwDisplayUrl) {
      return { left: 0, top: 0, width: cw, height: ch, ready: true, isFull: true }
    }
    const iw = naturalSize.w
    const ih = naturalSize.h
    if (!iw || !ih) return { left: 0, top: 0, width: cw, height: ch, ready: true, isFull: true }
    const aImg = iw / ih
    const aCont = cw / ch
    let fw: number, fh: number, fl: number, ft: number
    if (aImg > aCont) {
      fw = cw
      fh = cw / aImg
      fl = 0
      ft = (ch - fh) / 2
    } else {
      fh = ch
      fw = ch * aImg
      fl = (cw - fw) / 2
      ft = 0
    }
    return { left: fl, top: ft, width: fw, height: fh, ready: true, isFull: false }
  }, [containerSize, naturalSize, hwDisplayUrl])

  const preloaded = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!hwDisplayUrl) return
    if (preloaded.current.has(hwDisplayUrl)) return
    const img = new Image()
    ;(img as any).decoding = 'async'
    img.src = hwDisplayUrl
    preloaded.current.add(hwDisplayUrl)
  }, [hwDisplayUrl])

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  // V3 unified choreography – single ease, three phase durations (CSS vars in index.css are source of truth)
  const durFilter = prefersReducedMotion ? '120ms' : '420ms' // --crystal-entrance-filter
  const durTrans = prefersReducedMotion ? '160ms' : '480ms' // --crystal-entrance-transform
  const durHw = prefersReducedMotion ? '140ms' : '480ms' // hardware foreground shares transform timing
  const durFade = prefersReducedMotion ? '120ms' : '380ms' // --crystal-entrance-opacity

  const placementX = showroomPlacement?.x ?? 66
  const placementY = showroomPlacement?.y ?? 52
  const placementScale = showroomPlacement?.scale ?? 1.16
  const placementMaxW = showroomPlacement?.maxWidth ?? '72vw'
  const placementMaxH = showroomPlacement?.maxHeight ?? '74vh'
  const placementTY = showroomPlacement?.translateY ?? 0
  const libX = showroomPlacement?.library?.x ?? 50
  const libY = showroomPlacement?.library?.y ?? 50
  const libScale = showroomPlacement?.library?.scale ?? 1

  const wrapperLeft = entered ? `${libX}%` : `${placementX}%`
  const wrapperTop = entered ? `${libY}%` : `${placementY}%`
  const wrapperTransform = entered
    ? `translate(-50%, -50%) scale(${libScale})`
    : `translate(-50%, -50%) ${typeof placementTY === 'number' ? `translateY(${placementTY}px)` : placementTY ? `translateY(${placementTY})` : ''} scale(${placementScale})`

  const wrapperMaxW = typeof placementMaxW === 'number' ? `${placementMaxW}px` : placementMaxW
  const wrapperMaxH = typeof placementMaxH === 'number' ? `${placementMaxH}px` : placementMaxH

  // ── V3.1 Premium Motion: Parallax + Aura + Light ──
  const parallaxRafRef = useRef<number | null>(null)
  const lastParallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastInputRef = useRef<number>(Date.now())
  const [auraActive, setAuraActive] = useState(false)
  const accent = useMemo(() => getSystemAccent((config as any).systemId || config.systemId), [config])

  // Aura idle – reset on any semantic input (NavigationAction) via global listeners + polling
  useEffect(() => {
    const resetIdle = () => {
      lastInputRef.current = Date.now()
      setAuraActive(false)
    }

    const onKey = () => resetIdle()
    const onPointer = () => resetIdle()
    const onNav = () => resetIdle()
    const onCustomNav = (e: any) => {
      // navigation action from App.tsx via CustomEvent
      if (e?.detail) resetIdle()
    }
    const onCrystalNav = () => resetIdle()

    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('pointerdown', onPointer as any)
    window.addEventListener('mousemove', onPointer)
    window.addEventListener('crystal:nav-action' as any, onNav as any)
    window.addEventListener('crystal-discover-nav' as any, onNav as any)
    window.addEventListener('crystal-settings-nav' as any, onNav as any)
    window.addEventListener('crystal-library-quick-filter' as any, onCustomNav as any)
    window.addEventListener('crystal:restored' as any, onCrystalNav as any)

    // poll gamepad buttons as semantic input
    let polling = true
    let lastBtnPoll = 0
    const pollButtons = () => {
      if (!polling) return
      const now = Date.now()
      if (now - lastBtnPoll > 200) {
        lastBtnPoll = now
        try {
          const pads = (navigator as any).getGamepads?.() || []
          for (const pad of pads) {
            if (!pad) continue
            const pressed = pad.buttons?.some((b: any) => b.pressed || b.value > 0.5)
            const axisMove = pad.axes?.some((a: number) => Math.abs(a) > 0.45)
            if (pressed || axisMove) {
              resetIdle()
              break
            }
          }
        } catch {}
      }
      if (polling) window.setTimeout(pollButtons, 220)
    }
    pollButtons()

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastInputRef.current
      if (elapsed > 5000) {
        setAuraActive(prev => {
          if (prev) return prev
          return true
        })
      } else {
        setAuraActive(false)
      }
    }, 500)

    return () => {
      polling = false
      window.clearInterval(interval)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('pointerdown', onPointer as any)
      window.removeEventListener('mousemove', onPointer)
      window.removeEventListener('crystal:nav-action' as any, onNav as any)
      window.removeEventListener('crystal-discover-nav' as any, onNav as any)
      window.removeEventListener('crystal-settings-nav' as any, onNav as any)
      window.removeEventListener('crystal-library-quick-filter' as any, onCustomNav as any)
      window.removeEventListener('crystal:restored' as any, onCrystalNav as any)
    }
  }, [])

  // Parallax Stage Depth 4-6px hardware foreground reacts stick idle, background opposite 0.5x transform-only 60fps
  useEffect(() => {
    const isReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isReduced) {
      try {
        const root = document.documentElement
        root.style.setProperty('--crystal-parallax-x', '0px')
        root.style.setProperty('--crystal-parallax-y', '0px')
        root.style.setProperty('--crystal-parallax-bg-x', '0px')
        root.style.setProperty('--crystal-parallax-bg-y', '0px')
        root.style.setProperty('--crystal-light-x', '0px')
        root.style.setProperty('--crystal-light-y', '0px')
      } catch {}
      return
    }

    let raf = 0
    let lastSet = 0
    const deadzone = 0.15

    const apply = (xRatio: number, yRatio: number) => {
      // clamp -1..1
      const x = Math.max(-1, Math.min(1, xRatio))
      const y = Math.max(-1, Math.min(1, yRatio))
      const xFg = x * 6   // -6 to 6 px foreground per spec
      const yFg = y * 6
      const xBg = -x * 3  // opposite 0.5x = -3..3
      const yBg = -y * 3
      const lx = x * 4 + (accent.lightX || 0) * 0.6 // subtle system bias
      const ly = y * 4 + (accent.lightY || 0) * 0.6

      // only write if delta >0.15px to reduce style thrash (GPU)
      const prev = lastParallaxRef.current
      if (Math.abs(prev.x - xFg) < 0.08 && Math.abs(prev.y - yFg) < 0.08) return
      lastParallaxRef.current = { x: xFg, y: yFg }

      try {
        const root = document.documentElement
        const target = stageRef.current || root
        // set on both root and stage for scoping flexibility
        root.style.setProperty('--crystal-parallax-x', `${xFg.toFixed(2)}px`)
        root.style.setProperty('--crystal-parallax-y', `${yFg.toFixed(2)}px`)
        root.style.setProperty('--crystal-parallax-bg-x', `${xBg.toFixed(2)}px`)
        root.style.setProperty('--crystal-parallax-bg-y', `${yBg.toFixed(2)}px`)
        root.style.setProperty('--crystal-light-x', `${lx.toFixed(2)}px`)
        root.style.setProperty('--crystal-light-y', `${ly.toFixed(2)}px`)
        // also stage root custom props for chrome-preserved safety 1152x654 no-clip
        if (target instanceof HTMLElement) {
          target.style.setProperty('--crystal-parallax-x', `${xFg.toFixed(2)}px`)
          target.style.setProperty('--crystal-parallax-y', `${yFg.toFixed(2)}px`)
          target.style.setProperty('--crystal-parallax-bg-x', `${xBg.toFixed(2)}px`)
          target.style.setProperty('--crystal-parallax-bg-y', `${yBg.toFixed(2)}px`)
          target.style.setProperty('--crystal-light-x', `${lx.toFixed(2)}px`)
          target.style.setProperty('--crystal-light-y', `${ly.toFixed(2)}px`)
          target.style.setProperty('--crystal-aura-color', accent.color)
          ;(target.style as any).setProperty('--crystal-aura-glow', accent.glow)
        }
      } catch {}
    }

    const step = (ts: number) => {
      raf = requestAnimationFrame(step)
      if (ts - lastSet < 16) return // throttle to ~60fps max
      lastSet = ts
      try {
        const pads = (navigator as any).getGamepads?.() || []
        let ax = 0, ay = 0, found = false
        for (const pad of pads) {
          if (!pad || !pad.axes || pad.axes.length < 2) continue
          // left stick standard 0,1
          let rawX = pad.axes[0] || 0
          let rawY = pad.axes[1] || 0
          if (Math.abs(rawX) < deadzone && Math.abs(rawY) < deadzone) continue
          // rescale beyond deadzone for smooth response: (v - deadzone*sign)/(1-deadzone)
          const scale = (v: number) => {
            const abs = Math.abs(v)
            if (abs < deadzone) return 0
            const sign = v < 0 ? -1 : 1
            return sign * (abs - deadzone) / (1 - deadzone)
          }
          ax = scale(rawX)
          ay = scale(rawY)
          found = true
          break
        }
        // idle drift subtle if no stick – tiny sine for premium alive feel, but 0 when prefers-reduced-motion
        if (!found) {
          // very subtle breathing idle 0.15px magnitude when not touching stick – keeps GPU alive without layout thrash
          const t = ts * 0.0006
          ax = Math.sin(t) * 0.045
          ay = Math.cos(t * 0.78) * 0.045
        }
        apply(ax, ay)
      } catch {
        // ignore
      }
    }
    raf = requestAnimationFrame(step)
    parallaxRafRef.current = raf as any

    return () => {
      if (raf) cancelAnimationFrame(raf)
      parallaxRafRef.current = null
      try {
        const root = document.documentElement
        root.style.removeProperty('--crystal-parallax-x')
        root.style.removeProperty('--crystal-parallax-y')
        root.style.removeProperty('--crystal-parallax-bg-x')
        root.style.removeProperty('--crystal-parallax-bg-y')
        root.style.removeProperty('--crystal-light-x')
        root.style.removeProperty('--crystal-light-y')
      } catch {}
    }
  }, [accent.color, accent.lightX, accent.lightY])

  // V3.1 CRT mode detection – localStorage crystal_crt_mode boolean persisted, also root class crystal-crt-enabled
  const isCrtEnabled = (() => {
    try {
      if (typeof window !== 'undefined') {
        const v = window.localStorage.getItem('crystal_crt_mode')
        if (v === '1' || v === 'true') return true
        if (typeof document !== 'undefined' && document.documentElement.classList.contains('crystal-crt-enabled')) return true
      }
    } catch {}
    return false
  })()

  return (
    <div
      ref={stageRef}
      className={`system-stage ${className || ''} ${entered ? 'is-entered crystal-library-enter' : 'is-storefront crystal-system-enter'} ${isCrtEnabled && entered ? 'crystal-crt-enabled' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0a0a0f',
        ...( {
          '--crystal-bg-delay': '0ms',
          '--crystal-hw-delay': '80ms',
          '--crystal-game-delay': '160ms',
        } as any),
        ...style,
      }}
      data-system-id={config.systemId}
      data-presentation-type={(config as any).presentationType || 'tv'}
      data-hw-ready={frame.ready ? '1' : '0'}
      data-hw-full={frame.isFull ? '1' : '0'}
      data-visual={entered ? 'library' : 'storefront'}
      data-showroom-x={placementX}
      data-showroom-scale={placementScale}
    >
      {/* 1. environment/background – full viewport – blur ONLY here when entered */}
      <div
        className="layer layer-background crystal-parallax-bg"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          overflow: 'hidden',
          transform: `translateZ(0) ${entered ? (theme === 'dark' ? 'scale(1.08)' : 'scale(1.06)') : 'scale(1)'}`,
          transformOrigin: 'center',
          transition: `transform ${durTrans} cubic-bezier(0.16,1,0.3,1)`,
          transitionDelay: 'var(--crystal-bg-delay, 0ms)',
          willChange: 'transform',
        }}
      >
        <div className="crystal-parallax-bg-inner">
        {bg ? (
          <img
            src={bg}
            alt=""
            className="stage-bg-image"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'translateZ(0)',
              filter: entered
                ? theme === 'dark'
                  ? 'blur(32px) brightness(0.68) saturate(0.82)'
                  : 'blur(26px) brightness(0.84) saturate(0.88)'
                : 'saturate(1.05) brightness(0.92)',
              transition: `filter ${durFilter} cubic-bezier(0.16,1,0.3,1)`,
              willChange: 'filter',
            }}
            decoding="async"
            loading="eager"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--bg,#121214)' }} />
        )}
        {/* V3.1 – Volumetric Light + Liquid Glass graphite/silver/cyan – not orange */}
        <div className="crystal-volumetric-light" aria-hidden style={{ ['--crystal-accent' as any]: accent.color } as any} />
        <div className="crystal-volumetric-light--silver" aria-hidden />
        <div
          className="bg-vignette"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.62) 100%)',
            opacity: entered ? 0.92 : 1,
            transition: `opacity ${durFade} ease`,
          }}
        />
        <div
          className="bg-hw-radial"
          style={{
            position: 'absolute',
            inset: 0,
            background: entered
              ? 'transparent'
              : `radial-gradient(ellipse 42% 54% at ${placementX}% ${placementY}%, ${accent.tintBg || 'rgba(125,249,255,0.08)'} 0%, ${accent.color}14 14%, transparent 62%)`,
            opacity: entered ? 0 : 1,
            transition: `opacity ${durFade} ease`,
            pointerEvents: 'none',
          }}
        />
        <div
          className="bg-cool-wash"
          style={{
            position: 'absolute',
            inset: 0,
            background: entered
              ? theme === 'dark'
                ? 'linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.44) 60%, rgba(0,0,0,0.56))'
                : 'linear-gradient(180deg, rgba(10,12,20,0.18), rgba(10,12,20,0.26) 60%, rgba(10,12,20,0.34))'
              : `linear-gradient(180deg, ${accent.tintBg || 'rgba(125,249,255,0.04)'}, transparent 40%, rgba(10,10,15,0.3))`,
            pointerEvents: 'none',
            transition: `background ${durFilter} ease, opacity ${durFade} ease`,
          }}
        />
        <div
          className="bg-library-dim"
          style={{
            position: 'absolute',
            inset: 0,
            background: theme === 'dark' ? 'rgba(6,8,14,0.24)' : 'rgba(10,12,18,0.14)',
            opacity: entered ? 1 : 0,
            transition: `opacity ${durFilter} cubic-bezier(0.16,1,0.3,1)`,
            pointerEvents: 'none',
          }}
        />
        </div>
      </div>

      {/* SHOWROOM WRAPPER – outer presentation transform preserves inner calibration + V3.1 glass + aura */}
      <div
        ref={showroomRef}
        className={`hardware-showroom-wrapper crystal-hardware-glass crystal-liquid-glass crystal-aura-idle ${auraActive ? 'is-aura-active' : ''}`}
        data-entered={entered ? '1' : '0'}
        data-aura={auraActive ? '1' : '0'}
        data-system-accent={accent.color}
        style={{
          position: 'absolute',
          left: wrapperLeft,
          top: wrapperTop,
          width: entered ? '92vw' : wrapperMaxW,
          height: entered ? '88vh' : wrapperMaxH,
          maxWidth: entered ? '92vw' : wrapperMaxW,
          maxHeight: entered ? '88vh' : wrapperMaxH,
          transform: wrapperTransform,
          transformOrigin: 'center',
          zIndex: 2,
          transition: `left ${durTrans} cubic-bezier(0.16,1,0.3,1), top ${durTrans} cubic-bezier(0.16,1,0.3,1), transform ${durHw} cubic-bezier(0.16,1,0.3,1), width ${durTrans} cubic-bezier(0.16,1,0.3,1), height ${durTrans} cubic-bezier(0.16,1,0.3,1)`,
          transitionDelay: 'var(--crystal-hw-delay, 80ms)',
          willChange: 'transform, left, top',
          overflow: 'visible',
          pointerEvents: 'none',
          ['--crystal-aura-color' as any]: accent.color,
          ['--crystal-aura-glow' as any]: accent.glow,
        } as any}
      >
        {frame.ready && (
          <div
            className="hardware-frame crystal-parallax-fg"
            data-frame="true"
            style={{
              position: 'absolute',
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
              zIndex: 2,
              transform: `translate3d(var(--crystal-parallax-x, 0px), var(--crystal-parallax-y, 0px), 0) scale(1) translateY(0px)`,
              transformOrigin: 'center',
              opacity: 1,
              transition: `opacity ${durFade} cubic-bezier(0.16,1,0.3,1), transform ${durHw} cubic-bezier(0.16,1,0.3,1)`,
              transitionDelay: 'var(--crystal-hw-delay, 80ms)',
              willChange: 'opacity, transform',
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <div
              className="layer layer-gameplay"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: mediaZ,
                pointerEvents: 'none',
                transform: 'translateZ(0)',
                filter: 'none',
                transition: `transform ${durTrans} cubic-bezier(0.16,1,0.3,1), opacity ${durFade} cubic-bezier(0.16,1,0.3,1)`,
                transitionDelay: 'var(--crystal-game-delay, 160ms)',
              }}
            >
              {config.gameplayRegions.map(region => {
                const src = sourceMap.get(region.id)
                const maskUrl = screenMaskForRegion(region.id)
                const fitMode = (region as any).fit as string | undefined
                const objectFit = fitToObjectFit(fitMode)
                const corner = cornerRadiusToCss((region as any).cornerRadius)
                const rz = (region as any).zIndex ?? undefined

                const maskStyle: React.CSSProperties = maskUrl
                  ? ({
                      WebkitMaskImage: `url(${maskUrl})`,
                      maskImage: `url(${maskUrl})`,
                      WebkitMaskSize: 'cover',
                      maskSize: 'cover',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                    } as any)
                  : {}

                const isVideo = src?.mediaType === 'video'
                const hasRealMedia = !!src?.url

                return (
                  <div
                    key={region.id}
                    className={`gameplay-region region-${region.id} ${isCrtEnabled && entered ? 'crystal-crt-mode' : ''}`}
                    style={{
                      position: 'absolute',
                      left: `${region.x}%`,
                      top: `${region.y}%`,
                      width: `${region.width}%`,
                      height: `${region.height}%`,
                      aspectRatio: region.aspectRatio ? `${region.aspectRatio}` : undefined,
                      overflow: 'hidden',
                      borderRadius: corner ?? 8,
                      transform: isCrtEnabled && entered ? 'perspective(800px) scale(1.02) translateZ(0)' : 'translateZ(0)',
                      zIndex: rz,
                      border: showGuides ? '1px dashed rgba(125,249,255,0.45)' : undefined,
                      background: showGuides ? 'rgba(125,249,255,0.06)' : 'transparent',
                      boxShadow: showGuides ? '0 0 0 1px rgba(125,249,255,0.18) inset' : undefined,
                      ...maskStyle,
                    }}
                    data-has-media={hasRealMedia ? '1' : '0'}
                    data-storefront={!entered ? '1' : '0'}
                  >
                    {src?.url ? (
                      isVideo ? (
                        <video
                          src={src.url}
                          poster={src.posterUrl}
                          muted
                          loop
                          playsInline
                          autoPlay
                          preload="metadata"
                          style={{ width: '100%', height: '100%', objectFit, transform: 'translateZ(0)' }}
                        />
                      ) : (
                        <img src={src.url} alt={src.alt || ''} style={{ width: '100%', height: '100%', objectFit, transform: 'translateZ(0)' }} decoding="async" loading="lazy" />
                      )
                    ) : showGuides ? (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, fontFamily: 'var(--crystal-mono, monospace)', color: 'rgba(125,249,255,0.7)', letterSpacing: '0.04em' }}>
                        <span>{(region as any).label || region.id} • {fitMode || 'contain'} {region.width.toFixed(1)}%×{region.height.toFixed(1)}%</span>
                      </div>
                    ) : !entered ? (
                      <div
                        className="storefront-idle-glass"
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: corner ?? 8,
                          background: theme === 'dark'
                            ? 'linear-gradient(180deg, rgba(14,22,28,0.64) 0%, rgba(10,16,22,0.72) 52%, rgba(8,12,18,0.78) 100%)'
                            : 'linear-gradient(180deg, rgba(242,248,255,0.72) 0%, rgba(228,236,250,0.78) 54%, rgba(216,228,244,0.82) 100%)',
                          backdropFilter: 'blur(18px) brightness(0.92) saturate(1.06)',
                          WebkitBackdropFilter: 'blur(18px) brightness(0.92) saturate(1.06)',
                          border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.10)' : 'rgba(90,170,255,0.12)'}`,
                          boxShadow: theme === 'dark'
                            ? 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 40px rgba(125,249,255,0.06), 0 2px 16px rgba(0,0,0,0.28)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 32px rgba(90,170,255,0.06), 0 2px 12px rgba(18,26,44,0.08)',
                        }}
                      >
                        <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? 'radial-gradient(ellipse 72% 48% at 32% 18%, rgba(125,249,255,0.14), transparent 62%)' : 'radial-gradient(ellipse 72% 48% at 32% 18%, rgba(90,170,255,0.12), transparent 64%)', opacity: 0.9 }} />
                        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: `linear-gradient(90deg, transparent, ${theme === 'dark' ? 'rgba(125,249,255,0.22)' : 'rgba(90,170,255,0.22)'}, transparent)`, opacity: 0.8 }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 0.42 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.22)' : 'rgba(90,170,255,0.22)'}`, boxShadow: theme === 'dark' ? '0 0 18px rgba(125,249,255,0.18)' : '0 0 12px rgba(90,170,255,0.14)' }} />
                        </div>
                      </div>
                    ) : (
                      /* V8.3: powered-off glass – blurred dark acrylic with subtle dot, no literal text */
                      <div
                        className="library-idle-glass"
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: corner ?? 8,
                          background: theme === 'dark'
                            ? 'linear-gradient(180deg, rgba(10,14,20,0.48) 0%, rgba(8,12,18,0.62) 56%, rgba(6,10,16,0.70) 100%)'
                            : 'linear-gradient(180deg, rgba(230,238,250,0.58) 0%, rgba(218,228,244,0.66) 58%, rgba(206,218,236,0.72) 100%)',
                          backdropFilter: 'blur(16px) brightness(0.86) saturate(0.94)',
                          WebkitBackdropFilter: 'blur(16px) brightness(0.86) saturate(0.94)',
                          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                          boxShadow: theme === 'dark'
                            ? 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 24px rgba(0,0,0,0.22), 0 2px 12px rgba(0,0,0,0.18)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.54), inset 0 0 20px rgba(18,26,44,0.04), 0 2px 10px rgba(18,26,44,0.06)',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: theme === 'dark'
                              ? 'radial-gradient(ellipse 68% 44% at 34% 20%, rgba(125,249,255,0.08), transparent 60%)'
                              : 'radial-gradient(ellipse 68% 44% at 34% 20%, rgba(90,170,255,0.07), transparent 62%)',
                            opacity: 0.72,
                          }}
                        />
                        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: `linear-gradient(90deg, transparent, ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.06)'}, transparent)`, opacity: 0.6 }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 0.26 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                              boxShadow: theme === 'dark' ? '0 0 12px rgba(0,0,0,0.24)' : '0 0 8px rgba(18,26,44,0.08)',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {physicalUrl && (physicalConfig as any) && (
              <div className="layer layer-physical" style={{ position: 'absolute', inset: 0, zIndex: physicalZ, pointerEvents: 'none', transform: 'translateZ(0)', filter: 'none' }}>
                <img
                  src={physicalUrl}
                  alt=""
                  style={{
                    ...resolvePhysicalMediaTransform((physicalConfig as any)?.transform),
                    ...(slotMask
                      ? ({
                          WebkitMaskImage: `url(${slotMask})`,
                          maskImage: `url(${slotMask})`,
                          WebkitMaskSize: 'cover',
                          maskSize: 'cover',
                        } as any)
                      : {}),
                    filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.55))',
                  }}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}

            {hwDisplayUrl ? (
              <div className="layer layer-hardware" style={{ position: 'absolute', inset: 0, zIndex: foregroundZ, pointerEvents: 'none', transform: 'translateZ(0)', filter: 'none' }}>
                <img
                  src={hwDisplayUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    transform: 'translateZ(0)',
                    filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.65)) drop-shadow(0 0 0.5px rgba(255,255,255,0.15))',
                  }}
                  decoding="async"
                  loading="eager"
                />
                {showGuides && hwAlt && (
                  <div style={{ position: 'absolute', left: 12, top: 12, fontSize: 10, color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6 }}>{'alt: ' + hwAlt.split('/').pop()}</div>
                )}
              </div>
            ) : showGuides ? (
              <div className="layer layer-hardware-empty" style={{ position: 'absolute', inset: 0, zIndex: foregroundZ, pointerEvents: 'none', display: 'grid', placeItems: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--crystal-mono, monospace)', border: '1px dashed rgba(255,255,255,0.18)', padding: '10px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.28)' }}>
                  background-only • no hardware foreground calibrated for {(config as any).systemId}
                </div>
              </div>
            ) : null}

            {showGuides && (
              <>
                <div
                  className="frame-guide"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: '1px dashed rgba(125,249,255,0.35)',
                    pointerEvents: 'none',
                    borderRadius: 4,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -18,
                    fontSize: 10,
                    fontFamily: 'var(--crystal-mono, monospace)',
                    color: 'rgba(125,249,255,0.7)',
                    background: 'rgba(0,0,0,0.55)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {`frame ${frame.width.toFixed(0)}×${frame.height.toFixed(0)} • ${frame.isFull ? 'full (no hw)' : `${naturalSize ? `${naturalSize.w}×${naturalSize.h} src` : 'contain'}`} • ${config.systemId} • showroom x${placementX}% s${placementScale} → lib • ${entered ? 'library sharp' : 'storefront showroom hero'}`}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="layer layer-chrome"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          width: '100%',
          height: '100%',
          paddingTop: uiSafe?.top ? `${uiSafe.top}%` : undefined,
          paddingBottom: uiSafe?.bottom ? `${uiSafe.bottom}%` : undefined,
          paddingLeft: uiSafe?.left ? `${uiSafe.left}%` : undefined,
          paddingRight: uiSafe?.right ? `${uiSafe.right}%` : undefined,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>{children}</div>
      </div>
    </div>
  )
}

export default SystemStage
