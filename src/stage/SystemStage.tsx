import { useMemo, useEffect, useRef, useState, useLayoutEffect } from 'react'
import type { SystemStageProps, GameplaySource } from './types'

/**
 * SystemStage — V7.2 visual-hierarchy hardened
 * Two distinct visual states share the same Crystal artwork:
 * - STOREFRONT (systems): background sharp, logo/system hero, hardware hidden / subtle
 * - LIBRARY (entered console): background cinematic defocus (blur+dim+desat+scale),
 *   hardware razor sharp hero, gameplay + physical media sharp inside hardware
 *
 * Shared hardware-frame coordinate system remains from V7.1:
 * hardware PNG rendered with object-fit:contain → compute exact frame bounds,
 * then render gameplay regions / physical / hardware inside same frame.
 * No drift at different resolutions.
 *
 * Blur only background layer – never entire SystemStage.
 * Transition: sharp → defocus 300-500ms when confirming system, reverse cleanly.
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
    // fill missing regions with first legacy if needed
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
      // assign same url to all regions
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
  // --- visual hierarchy ---
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
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  // track stage size
  useLayoutEffect(() => {
    if (!stageRef.current) return
    const el = stageRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setContainerSize({ w: r.width, h: r.height })
    }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update())
      ro.observe(el)
      return () => ro.disconnect()
    } else {
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
      }
    }
  }, [])

  // load natural size of hardware PNG
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

  // reduced-motion
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  const durFilter = prefersReducedMotion ? '120ms' : '420ms'
  const durTrans = prefersReducedMotion ? '160ms' : '560ms'
  const durHw = prefersReducedMotion ? '140ms' : '480ms'
  const durFade = prefersReducedMotion ? '120ms' : '380ms'

  return (
    <div
      ref={stageRef}
      className={`system-stage ${className || ''} ${entered ? 'is-entered' : 'is-storefront'}`}
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f', ...style }}
      data-system-id={config.systemId}
      data-presentation-type={(config as any).presentationType || 'tv'}
      data-hw-ready={frame.ready ? '1' : '0'}
      data-hw-full={frame.isFull ? '1' : '0'}
      data-visual={entered ? 'library' : 'storefront'}
    >
      {/* 1. environment/background – full viewport – blur ONLY here when entered */}
      <div
        className="layer layer-background"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          overflow: 'hidden',
          transform: `translateZ(0) ${entered ? (theme === 'dark' ? 'scale(1.08)' : 'scale(1.06)') : 'scale(1)'}`,
          transformOrigin: 'center',
          transition: `transform ${durTrans} cubic-bezier(0.16,1,0.3,1)`,
          willChange: 'transform',
        }}
      >
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
              // cinematic defocus – blur only background, keep razor sharp elsewhere
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
          className="bg-cool-wash"
          style={{
            position: 'absolute',
            inset: 0,
            background: entered
              ? theme === 'dark'
                ? 'linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.44) 60%, rgba(0,0,0,0.56))'
                : 'linear-gradient(180deg, rgba(10,12,20,0.18), rgba(10,12,20,0.26) 60%, rgba(10,12,20,0.34))'
              : 'linear-gradient(180deg, rgba(125,249,255,0.04), transparent 40%, rgba(10,10,15,0.3))',
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

      {/* HARDWARE FRAME – shared coordinate system exactly matching contain hardware image */}
      {frame.ready && (
        <div
          className="hardware-frame"
          data-frame="true"
          style={{
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
            zIndex: 2,
            transform: `translateZ(0) ${entered ? 'scale(1) translateY(0px)' : showGuides ? 'scale(0.94) translateY(6px)' : 'scale(0.92) translateY(14px)'}`,
            transformOrigin: 'center',
            opacity: entered ? 1 : showGuides ? 0.22 : 0,
            transition: `opacity ${durFade} cubic-bezier(0.16,1,0.3,1), transform ${durHw} cubic-bezier(0.16,1,0.3,1)`,
            willChange: 'opacity, transform',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {/* 2. gameplay regions – inside frame – razor sharp when entered */}
          <div
            className="layer layer-gameplay"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: mediaZ,
              pointerEvents: 'none',
              transform: 'translateZ(0)',
              // stays sharp – no blur
              filter: 'none',
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

              return (
                <div
                  key={region.id}
                  className={`gameplay-region region-${region.id}`}
                  style={{
                    position: 'absolute',
                    left: `${region.x}%`,
                    top: `${region.y}%`,
                    width: `${region.width}%`,
                    height: `${region.height}%`,
                    aspectRatio: region.aspectRatio ? `${region.aspectRatio}` : undefined,
                    overflow: 'hidden',
                    borderRadius: corner ?? 8,
                    transform: 'translateZ(0)',
                    zIndex: rz,
                    border: showGuides ? '1px dashed rgba(125,249,255,0.45)' : undefined,
                    background: showGuides ? 'rgba(125,249,255,0.06)' : 'transparent',
                    boxShadow: showGuides ? '0 0 0 1px rgba(125,249,255,0.18) inset' : undefined,
                    ...maskStyle,
                  }}
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
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* 3. physical media – inside frame – sharp */}
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

          {/* 4. hardware foreground – inside frame, exactly fills frame – razor sharp */}
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

          {/* frame guide for QA */}
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
                {`frame ${frame.width.toFixed(0)}×${frame.height.toFixed(0)} • ${frame.isFull ? 'full (no hw)' : `${naturalSize ? `${naturalSize.w}×${naturalSize.h} src` : 'contain'}`} • ${config.systemId} • ${entered ? 'library sharp' : 'storefront hidden'}`}
              </div>
            </>
          )}
        </div>
      )}

      {/* 5. UI chrome – full viewport floating */}
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
