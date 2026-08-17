import React from 'react'
import { getLibraryVisualProfile } from './libraryVisualProfile'
import { ConsoleLibraryAtmosphere } from './ConsoleLibraryAtmosphere'

export type LibraryHeroProps = {
  theme: 'light' | 'dark'
  systemId?: string
  children?: React.ReactNode // selected game context overlay
  selectedCoverUrl?: string | null
  selectedTitle?: string | null
}

export function LibraryHero({ theme, systemId, children, selectedCoverUrl, selectedTitle }: LibraryHeroProps) {
  const isDark = theme === 'dark'
  const visual = getLibraryVisualProfile(systemId || '')
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        // V8.5 per-system tuning preserved from V7.3 showroomPlacement
        // gc purple cube slightly larger after carousel removal, gbc/gba tighter
        paddingLeft: systemId === 'gc' ? 22 : systemId === 'gbc' || systemId === 'gba' ? 14 : 18,
        boxSizing: 'border-box',
      }}
    >
      <ConsoleLibraryAtmosphere systemId={systemId || ''} />
      {/* subtle vignette soft integration - no hard wall */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse 62% 54% at 60% 42%, rgba(125,249,255,0.04), transparent 60%)'
            : 'radial-gradient(ellipse 62% 54% at 60% 42%, rgba(90,170,255,0.05), transparent 60%)',
          pointerEvents: 'none',
          opacity: 0.8,
        }}
      />
      <div aria-hidden className="library-hero-orbit" style={{ position:'absolute', width:'56%', aspectRatio:'1', right:'8%', top:'10%', borderRadius:'50%', border:`1px solid ${visual.accent}33`, boxShadow:`0 0 80px ${visual.accent}22, inset 0 0 80px ${visual.accent2}12`, animation:'hero-breathe 6s ease-in-out infinite', pointerEvents:'none' }} />
      <div aria-hidden style={{ position:'absolute', right:'2.5%', top:'7%', fontFamily:'var(--crystal-mono)', fontSize:9, letterSpacing:'.22em', color:visual.accent, opacity:.72, writingMode:'vertical-rl', textTransform:'uppercase' }}>{visual.label}</div>
      {visual.family === 'dual-screen' && <div aria-hidden style={{ position:'absolute', right:'8%', top:'18%', width:'48%', height:'52%', borderTop:`1px solid ${visual.accent}44`, borderBottom:`1px solid ${visual.accent2}44`, pointerEvents:'none' }} />}
      {systemId === 'nds' && (
        <div className="nds-touchscreen-content" aria-hidden>
          <div className="nds-touchscreen-grid" />
          {selectedCoverUrl ? <img key={selectedCoverUrl} src={selectedCoverUrl} alt="" /> : <div className="nds-touchscreen-fallback">DS</div>}
          <div className="nds-touchscreen-copy">
            <span>TOUCH TO START</span>
            <strong>{selectedTitle || 'SELECT SOFTWARE'}</strong>
          </div>
          <i className="nds-stylus-cursor" />
        </div>
      )}
      {visual.family === 'handheld' && <div aria-hidden style={{ position:'absolute', inset:'8% 5%', opacity:.12, backgroundImage:`linear-gradient(${visual.accent} 1px,transparent 1px),linear-gradient(90deg,${visual.accent} 1px,transparent 1px)`, backgroundSize:'28px 28px', maskImage:'radial-gradient(circle at 65% 45%,black,transparent 68%)', pointerEvents:'none' }} />}
      {visual.family === 'cartridge' && <div aria-hidden style={{ position:'absolute', right:'5%', bottom:'5%', width:'52%', height:3, background:`linear-gradient(90deg,transparent,${visual.accent},${visual.accent2},transparent)`, boxShadow:`0 0 22px ${visual.accent}`, opacity:.65, pointerEvents:'none' }} />}

      {/* SystemStage renders hardware behind this via parent wrapper - we just provide container for overlay */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        {/* bottom-left contextual card */}
        <div
          style={{
            position: 'absolute',
            left: 22,
            bottom: 22,
            right: 22,
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-end',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

export default LibraryHero
