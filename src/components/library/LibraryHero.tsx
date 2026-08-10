import React from 'react'

export type LibraryHeroProps = {
  theme: 'light' | 'dark'
  children?: React.ReactNode // selected game context overlay
}

export function LibraryHero({ theme, children }: LibraryHeroProps) {
  const isDark = theme === 'dark'
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
        // push hero slightly right via internal padding to give breathing room once carousel removed
        paddingLeft: 18,
        boxSizing: 'border-box',
      }}
    >
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
