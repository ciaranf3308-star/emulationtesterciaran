import { useMemo, useEffect, useRef } from 'react'
import type { SystemStageProps, GameplaySource, PhysicalMediaTransform } from './types'

/**
 * SystemStage — V7 upgraded 5 independent layers:
 * 1. environment/background
 * 2. gameplay video/screenshot – per-region calibrated fitting, corner radius, mask, z-index, fit mode
 * 3. physical media – calibrated static placement (insertion animation ready)
 * 4. hardware foreground – transparent PNG with per-system alternate support, graceful missing fallback
 * 5. UI chrome (children)
 *
 * Premium fullscreen cinematic, controller-first, art-led, glass/acrylic translucent tech, cool-toned.
 * Performance: memoization, GPU-friendly translateZ(0), video preload cautious, no unnecessary remounts.
 */

function normalizeMediaSources(
  gameplaySources: GameplaySource[] | undefined,
  regions: { id: string }[],
  legacyMedia?: SystemStageProps['media']
): Map<string, GameplaySource | undefined> {
  const map = new Map<string, GameplaySource | undefined>()
  if (gameplaySources && gameplaySources.length > 0) {
    for (const r of regions) {
      const found = gameplaySources.find(s => s.regionId === r.id)
      map.set(r.id, found)
    }
    return map
  }

  if (legacyMedia) {
    const raw: any = legacyMedia as any
    const video = raw.videoUrl || raw.video || undefined
    const screenshot = raw.screenshotUrl || raw.screenshot || raw.cover || raw.coverUrl || raw.posterUrl || undefined
    const poster = raw.posterUrl || raw.cover || undefined
    const primary = regions[0]
    if (primary) {
      if (video) {
        map.set(primary.id, { regionId: primary.id, url: video, posterUrl: poster, mediaType: 'video' })
      } else if (screenshot) {
        map.set(primary.id, { regionId: primary.id, url: screenshot, posterUrl: poster, mediaType: 'screenshot' })
      }
      for (let i = 1; i < regions.length; i++) {
        if (!map.has(regions[i].id)) map.set(regions[i].id, undefined)
      }
    }
    return map
  }

  for (const r of regions) map.set(r.id, undefined)
  return map
}

function resolvePhysicalMediaTransform(
  transform: PhysicalMediaTransform | undefined,
  restOverride?: { x?: number; y?: number; scale?: number }
): React.CSSProperties {
  if (!transform) {
    return {
      position: 'absolute',
      left: '50%',
      top: '70%',
      transform: 'translate(-50%,-50%) translateZ(0) scale(0.9)',
      maxWidth: '18%',
      maxHeight: '22%',
    }
  }
  const rest = transform.rest
  const x = restOverride?.x ?? rest.x
  const y = restOverride?.y ?? rest.y
  const scale = restOverride?.scale ?? rest.scale
  const rotation = (rest as any).rotation ?? 0
  return {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%,-50%) translateZ(0) scale(${scale}) rotate(${rotation}deg)`,
    transformOrigin: 'center',
  }
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
}: SystemStageProps) {
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

  const preloaded = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!hwDisplayUrl) return
    if (preloaded.current.has(hwDisplayUrl)) return
    const img = new Image()
    ;(img as any).decoding = 'async'
    img.src = hwDisplayUrl
    preloaded.current.add(hwDisplayUrl)
  }, [hwDisplayUrl])

  return (
    <div
      className={`system-stage ${className || ''}`}
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f', ...style }}
      data-system-id={config.systemId}
      data-presentation-type={(config as any).presentationType || 'tv'}
    >
      {/* 1. environment/background */}
      <div className="layer layer-background" style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden', transform: 'translateZ(0)' }}>
        {bg ? (
          <img
            src={bg}
            alt=""
            className="stage-bg-image"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'translateZ(0)', filter: 'saturate(1.05) brightness(0.92)' }}
            decoding="async"
            loading="eager"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--bg,#121214)' }} />
        )}
        <div className="bg-vignette" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.62) 100%)' }} />
        <div className="bg-cool-wash" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(125,249,255,0.04), transparent 40%, rgba(10,10,15,0.3))', pointerEvents:'none' }} />
      </div>

      {/* 2. gameplay regions */}
      <div className="layer layer-gameplay" style={{ position: 'absolute', inset: 0, zIndex: mediaZ, pointerEvents: 'none' }}>
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
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, fontFamily: 'var(--crystal-mono, monospace)', color: 'rgba(125,249,255,0.7)', letterSpacing:'0.04em' }}>
                  <span>{(region as any).label || region.id} • {fitMode || 'contain'} {region.width.toFixed(1)}%×{region.height.toFixed(1)}%</span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 3. physical media */}
      {physicalUrl && (physicalConfig as any) && (
        <div className="layer layer-physical" style={{ position: 'absolute', inset: 0, zIndex: physicalZ, pointerEvents: 'none' }}>
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

      {/* 4. hardware foreground */}
      {hwDisplayUrl ? (
        <div className="layer layer-hardware" style={{ position: 'absolute', inset: 0, zIndex: foregroundZ, pointerEvents: 'none' }}>
          <img
            src={hwDisplayUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: 'translateZ(0)',
              filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.65)) drop-shadow(0 0 0.5px rgba(255,255,255,0.15))',
            }}
            decoding="async"
            loading="eager"
          />
          {showGuides && hwAlt && (
            <div style={{ position:'absolute', left:12, top:12, fontSize:10, color:'rgba(255,255,255,0.6)', background:'rgba(0,0,0,0.5)', padding:'4px 8px', borderRadius:6 }}>{'alt: '+(hwAlt.split('/').pop())}</div>
          )}
        </div>
      ) : (
        showGuides ? (
          <div className="layer layer-hardware-empty" style={{ position:'absolute', inset:0, zIndex:foregroundZ, pointerEvents:'none', display:'grid', placeItems:'center' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', fontFamily:'var(--crystal-mono, monospace)', border:'1px dashed rgba(255,255,255,0.18)', padding:'10px 16px', borderRadius:8, background:'rgba(0,0,0,0.28)' }}>
              background-only • no hardware foreground calibrated for {(config as any).systemId}
            </div>
          </div>
        ) : null
      )}

      {/* 5. UI chrome */}
      <div
        className="layer layer-chrome"
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          height: '100%',
          paddingTop: uiSafe?.top ? `${uiSafe.top}%` : undefined,
          paddingBottom: uiSafe?.bottom ? `${uiSafe.bottom}%` : undefined,
          paddingLeft: uiSafe?.left ? `${uiSafe.left}%` : undefined,
          paddingRight: uiSafe?.right ? `${uiSafe.right}%` : undefined,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default SystemStage
