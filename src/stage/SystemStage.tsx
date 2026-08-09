import { useMemo } from 'react'
import type { SystemStageProps } from './types'

/**
 * SystemStage — 5 independent layers:
 * 1. environment/background
 * 2. gameplay video/screenshot
 * 3. physical media
 * 4. hardware foreground
 * 5. UI chrome (children)
 *
 * Premium fullscreen cinematic, no ugly fake console if hardwareForeground missing.
 * Supports multiple gameplayRegions for DS/3DS.
 * GPU-friendly transforms (translateZ(0)), memoization, video lifecycle cautious.
 */

export function SystemStage({ config, theme, media, showGuides, backgroundUrl, children, className, style }: SystemStageProps) {
  const bg = useMemo(() => {
    const explicit = backgroundUrl
    if (explicit) return explicit
    const b = config.background
    if (!b) return undefined
    if (b.url) return b.url
    return theme === 'light' ? (b.light || b.dark) : (b.dark || b.light)
  }, [config.background, backgroundUrl, theme])

  return (
    <div className={`system-stage ${className||''}`} style={{ position:'relative', width:'100vw', height:'100vh', overflow:'hidden', background:'#0a0a0f', ...style }}>
      {/* 1. environment/background */}
      <div className="layer layer-background" style={{ position:'absolute', inset:0, zIndex:1, overflow:'hidden' }}>
        {bg ? <img src={bg} alt="" className="stage-bg-image" style={{ width:'100%', height:'100%', objectFit:'cover', transform:'translateZ(0)' }} decoding="async" /> : <div style={{ width:'100%', height:'100%', background:'var(--bg,#121214)' }} />}
        <div className="bg-vignette" style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)' }} />
      </div>

      {/* 2. gameplay video/screenshot regions */}
      <div className="layer layer-gameplay" style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none' }}>
        {config.gameplayRegions.map(region => (
          <div
            key={region.id}
            className="gameplay-region"
            style={{
              position:'absolute',
              left:`${region.x}%`,
              top:`${region.y}%`,
              width:`${region.width}%`,
              height:`${region.height}%`,
              aspectRatio: region.aspectRatio ? `${region.aspectRatio}` : undefined,
              overflow:'hidden',
              borderRadius:8,
              transform:'translateZ(0)',
              border: showGuides ? '1px dashed rgba(255,255,255,0.3)' : undefined,
              background: showGuides ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}
          >
            {media?.videoUrl ? (
              <video src={media.videoUrl} muted loop playsInline autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            ) : media?.screenshotUrl ? (
              <img src={media.screenshotUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            ) : showGuides ? (
              <div style={{ width:'100%', height:'100%', display:'grid', placeItems:'center', fontSize:10, color:'rgba(255,255,255,0.5)'}}>{region.label || region.id}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* 3. physical media */}
      {config.physicalMedia?.url && (
        <div className="layer layer-physical" style={{ position:'absolute', inset:0, zIndex:3, pointerEvents:'none' }}>
          <img src={config.physicalMedia.url} alt="" style={{ position:'absolute', left:'50%', top:'70%', transform:'translate(-50%,-50%) translateZ(0) scale(0.9)', maxWidth:'18%', maxHeight:'22%' }} />
        </div>
      )}

      {/* 4. hardware foreground */}
      {config.hardwareForeground && (
        <div className="layer layer-hardware" style={{ position:'absolute', inset:0, zIndex:4, pointerEvents:'none' }}>
          <img src={config.hardwareForeground} alt="" style={{ width:'100%', height:'100%', objectFit:'contain', transform:'translateZ(0)' }} />
        </div>
      )}

      {/* 5. UI chrome - actual React children */}
      <div className="layer layer-chrome" style={{ position:'relative', zIndex:5, width:'100%', height:'100%' }}>
        {children}
      </div>

      {config.screenMask && <div style={{ display:'none' }}>{/* mask placeholder for future Canvas use */}</div>}
      {config.slotMask && <div style={{ display:'none' }}>{/* slot mask placeholder */}</div>}
    </div>
  )
}

export default SystemStage
