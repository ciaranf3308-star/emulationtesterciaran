import { useMemo } from 'react'
import type { SystemStageProps, GameplaySource, PhysicalMediaTransform } from './types'

/**
 * SystemStage — 5 independent layers:
 * 1. environment/background
 * 2. gameplay video/screenshot
 * 3. physical media
 * 4. hardware foreground
 * 5. UI chrome (children)
 *
 * Premium fullscreen cinematic, no ugly fake console if hardwareForeground missing.
 * Supports multiple gameplayRegions for DS/3DS dual-screen via gameplaySources.
 * GPU-friendly transforms (translateZ(0)), memoization, video lifecycle cautious.
 * Masks now participate (screenMask / slotMask) via CSS mask-image.
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
    // truthful single-source: if only one source exists for dual-screen,
    // render in primary and leave second empty – do NOT duplicate
    // (no extra logic needed, map already does that)
    return map
  }

  // Legacy fallback: single media object
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
      // second region intentionally empty if only single source
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
    // sensible default – centered lower
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

  const physicalConfig = config.physicalMediaConfig || (config.physicalMedia ? { type: config.physicalMedia.type, transform: config.physicalMedia.transform } as any : undefined)

  const screenMaskForRegion = (regionId: string): string | undefined => {
    if (config.screenMasks && config.screenMasks[regionId]) return config.screenMasks[regionId]
    return config.screenMask
  }

  const slotMask = config.slotMasks ? Object.values(config.slotMasks)[0] : config.slotMask

  return (
    <div
      className={`system-stage ${className || ''}`}
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f', ...style }}
    >
      {/* 1. environment/background */}
      <div className="layer layer-background" style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}>
        {bg ? (
          <img
            src={bg}
            alt=""
            className="stage-bg-image"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'translateZ(0)' }}
            decoding="async"
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--bg,#121214)' }} />
        )}
        <div
          className="bg-vignette"
          style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)' }}
        />
      </div>

      {/* 2. gameplay video/screenshot regions */}
      <div className="layer layer-gameplay" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        {config.gameplayRegions.map(region => {
          const src = sourceMap.get(region.id)
          const maskUrl = screenMaskForRegion(region.id)
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

          return (
            <div
              key={region.id}
              className="gameplay-region"
              style={{
                position: 'absolute',
                left: `${region.x}%`,
                top: `${region.y}%`,
                width: `${region.width}%`,
                height: `${region.height}%`,
                aspectRatio: region.aspectRatio ? `${region.aspectRatio}` : undefined,
                overflow: 'hidden',
                borderRadius: 8,
                transform: 'translateZ(0)',
                border: showGuides ? '1px dashed rgba(255,255,255,0.3)' : undefined,
                background: showGuides ? 'rgba(255,255,255,0.04)' : 'transparent',
                ...maskStyle,
              }}
            >
              {src?.url ? (
                src.mediaType === 'video' ? (
                  <video
                    src={src.url}
                    poster={src.posterUrl}
                    muted
                    loop
                    playsInline
                    autoPlay
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <img src={src.url} alt={src.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )
              ) : showGuides ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {region.label || region.id}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 3. physical media – runtime URL separated from geometry */}
      {physicalUrl && (
        <div className="layer layer-physical" style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
          <img
            src={physicalUrl}
            alt=""
            style={{
              ...resolvePhysicalMediaTransform(physicalConfig?.transform as any),
              // optional slotMask occlusion
              ...(slotMask
                ? ({
                    WebkitMaskImage: `url(${slotMask})`,
                    maskImage: `url(${slotMask})`,
                    WebkitMaskSize: 'cover',
                    maskSize: 'cover',
                  } as any)
                : {}),
            }}
          />
        </div>
      )}

      {/* 4. hardware foreground */}
      {config.hardwareForeground && (
        <div className="layer layer-hardware" style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
          <img
            src={config.hardwareForeground}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'translateZ(0)' }}
          />
        </div>
      )}

      {/* 5. UI chrome - actual React children */}
      <div className="layer layer-chrome" style={{ position: 'relative', zIndex: 5, width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  )
}

export default SystemStage
