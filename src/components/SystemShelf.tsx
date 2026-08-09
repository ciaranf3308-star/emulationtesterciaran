import { useMemo } from 'react'
import SystemLogo from './SystemLogo'

/**
 * Crystal System Shelf – V7.3 left-side showroom navigation
 * Approx LEFT 26-31% viewport, vertical futuristic DISPLAY SHELF
 *
 * - Very subtle transparent acrylic/glass rails, not opaque navy rectangle
 * - No large bordered cards, no SaaS tiles, no giant background panel
 * - Shows 5 systems at once (prev prev / prev / SELECTED / next / next next)
 * - Selected near vertical centre, forward, sharp, cool edge light
 * - Neighbours recede: opacity/scale/blur/depth/shift left
 * - Wraps cyclically – controller-first
 * - Logo is primary content via SystemLogo, fallback full name never raw ID
 */

export type ShelfSystem = {
  id: string
  fullName?: string
  logoUrl?: string
  iconUrl?: string
}

export type SystemShelfProps = {
  systems: ShelfSystem[]
  selectedId: string
  onSelect: (id: string) => void
  theme: 'light' | 'dark'
  onOpenLibrary?: () => void
  // utility actions
  onAllGames?: () => void
  onFavorites?: () => void
  onRecent?: () => void
  onSettings?: () => void
  activeUtility?: 'allgames' | 'favorites' | 'recent' | 'settings' | null
}

function wrapIndex(i: number, len: number): number {
  if (len === 0) return 0
  return ((i % len) + len) % len
}

export function SystemShelf({ systems, selectedId, onSelect, theme, onOpenLibrary, onAllGames, onFavorites, onRecent, onSettings, activeUtility }: SystemShelfProps) {
  const isDark = theme === 'dark'
  const len = systems.length
  const selectedIdx = useMemo(() => {
    const idx = systems.findIndex(s => s.id === selectedId)
    return idx >= 0 ? idx : 0
  }, [systems, selectedId])

  const visible = useMemo(() => {
    if (len === 0) return []
    // build offsets -2,-1,0,+1,+2 with wrap
    const offsets = [-2, -1, 0, 1, 2]
    return offsets.map(off => {
      const realIdx = wrapIndex(selectedIdx + off, len)
      return { offset: off, system: systems[realIdx], realIdx }
    })
  }, [len, selectedIdx, systems])

  return (
    <div
      className="crystal-system-shelf"
      data-theme={theme}
      data-selected-id={selectedId}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '29%',
        minWidth: '26%',
        maxWidth: '31%',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        pointerEvents: 'auto',
        // subtle local dimming behind shelf – not massively darkening whole storefront
        background: isDark
          ? 'linear-gradient(90deg, rgba(6,9,14,0.32) 0%, rgba(8,11,18,0.16) 52%, transparent 100%)'
          : 'linear-gradient(90deg, rgba(245,248,255,0.42) 0%, rgba(242,246,255,0.18) 48%, transparent 100%)',
        backdropFilter: 'blur(10px) saturate(1.02)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.02)',
      }}
    >
      {/* shelf rails – thin illuminated edges */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '16%',
          top: '10%',
          bottom: '18%',
          width: 1,
          background: isDark
            ? 'linear-gradient(180deg, rgba(125,249,255,0.0) 0%, rgba(125,249,255,0.18) 18%, rgba(180,220,255,0.12) 54%, rgba(125,249,255,0.06) 100%)'
            : 'linear-gradient(180deg, rgba(90,170,255,0.0) 0%, rgba(90,170,255,0.18) 18%, rgba(120,190,255,0.14) 54%, rgba(90,170,255,0.06) 100%)',
          boxShadow: isDark ? '0 0 18px rgba(125,249,255,0.24), 0 0 2px rgba(125,249,255,0.5)' : '0 0 16px rgba(90,170,255,0.18), 0 0 2px rgba(90,170,255,0.3)',
          opacity: 0.9,
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 'calc(16% + 44px)',
          top: '12%',
          bottom: '20%',
          width: 1,
          background: isDark
            ? 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.03) 70%, transparent 100%)'
            : 'linear-gradient(180deg, transparent 0%, rgba(18,24,38,0.06) 30%, rgba(18,24,38,0.03) 70%, transparent 100%)',
          opacity: isDark ? 0.5 : 0.42,
          pointerEvents: 'none',
        }}
      />

      {/* top minimal crystal mark */}
      <div
        style={{
          padding: '22px 18px 0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'var(--crystal-display)',
          fontSize: 13,
          letterSpacing: '-0.02em',
          color: isDark ? 'rgba(230,244,255,0.84)' : 'rgba(18,26,44,0.86)',
          opacity: 0.92,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDark ? '#7df9ff' : '#5aa8ff', boxShadow: isDark ? '0 0 12px rgba(125,249,255,0.6)' : '0 0 10px rgba(90,170,255,0.4)', display: 'inline-block' }} />
        <span style={{ fontWeight: 600 }}>crystal</span>
        <span style={{ fontWeight: 400, opacity: 0.7 }}>frontend</span>
      </div>

      {/* main shelf list – vertically centred */}
      <div
        className="shelf-stack"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '18px 14px 18px 20px',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, transform: 'translateZ(0)' }}>
          {visible.map(({ offset, system }) => {
            const isSel = offset === 0
            const distance = Math.abs(offset)
            // recede rules per spec
            const opacity = isSel ? 1 : distance === 1 ? 0.68 : 0.38
            const scale = isSel ? 1.08 : distance === 1 ? 0.92 : 0.82
            const blur = isSel ? 0 : distance === 1 ? 0.3 : 1.1
            const translateX = isSel ? 0 : distance === 1 ? -8 : -16
            const translateZ = isSel ? 12 : distance === 1 ? 0 : -8

            return (
              <button
                key={`${system.id}-${offset}`}
                onClick={() => {
                  if (isSel) {
                    onOpenLibrary?.()
                  } else {
                    onSelect(system.id)
                  }
                }}
                data-offset={offset}
                data-system-id={system.id}
                data-selected={isSel ? '1' : '0'}
                className={`shelf-item ${isSel ? 'is-selected' : ''}`}
                style={{
                  appearance: 'none',
                  background: isSel
                    ? isDark
                      ? 'linear-gradient(100deg, rgba(125,249,255,0.08), rgba(255,255,255,0.03) 60%, transparent 100%)'
                      : 'linear-gradient(100deg, rgba(90,170,255,0.10), rgba(255,255,255,0.36) 60%, transparent 100%)'
                    : 'transparent',
                  border: isSel
                    ? `1px solid ${isDark ? 'rgba(125,249,255,0.14)' : 'rgba(90,170,255,0.16)'}`
                    : '1px solid transparent',
                  borderRadius: 14,
                  padding: isSel ? '14px 12px 13px' : '10px 12px',
                  marginLeft: 8,
                  marginRight: 12,
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  transform: `translate3d(${translateX}px, 0, ${translateZ}px) scale(${scale})`,
                  transformOrigin: 'left center',
                  opacity,
                  filter: blur > 0 ? `blur(${blur}px)` : 'none',
                  transition:
                    'transform 420ms cubic-bezier(0.16,1,0.3,1), opacity 340ms ease, filter 340ms ease, background 340ms ease, border-color 340ms ease',
                  willChange: 'transform, opacity, filter',
                  boxShadow: isSel
                    ? isDark
                      ? '0 6px 24px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(125,249,255,0.06)'
                      : '0 6px 20px rgba(18,28,48,0.12), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px rgba(90,170,255,0.08)'
                    : 'none',
                  pointerEvents: 'auto',
                }}
                aria-current={isSel ? 'true' : undefined}
                aria-label={system.fullName || system.id}
              >
                <SystemLogo
                  systemId={system.id}
                  logoUrl={system.logoUrl || system.iconUrl}
                  fallbackName={system.fullName}
                  isSelected={isSel}
                  theme={theme}
                />
                {isSel && (
                  <div
                    aria-hidden
                    style={{
                      marginTop: 8,
                      height: 1,
                      width: '68%',
                      background: isDark
                        ? 'linear-gradient(90deg, rgba(125,249,255,0.22), transparent)'
                        : 'linear-gradient(90deg, rgba(90,170,255,0.24), transparent)',
                      opacity: 0.9,
                      filter: 'blur(0.3px)',
                    }}
                  />
                )}
                {/* faint reflection beneath selected – never giant glowing box */}
                {isSel && (
                  <div
                    aria-hidden
                    style={{
                      marginTop: 9,
                      marginLeft: 6,
                      height: 22,
                      width: '76%',
                      background: isDark
                        ? 'linear-gradient(180deg, rgba(125,249,255,0.14), rgba(125,249,255,0.0))'
                        : 'linear-gradient(180deg, rgba(90,170,255,0.10), rgba(90,170,255,0.0))',
                      filter: 'blur(8px)',
                      opacity: isDark ? 0.28 : 0.22,
                      transform: 'scaleY(-1)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* utility rail – small bottom-left beneath shelf */}
      <div
        className="shelf-utility-rail"
        style={{
          padding: '0 18px 22px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            height: 1,
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,24,38,0.08)',
            marginBottom: 10,
            width: '72%',
          }}
        />
        {[
          { id: 'allgames', label: 'All Games', onClick: onAllGames },
          { id: 'favorites', label: 'Favorites', onClick: onFavorites },
          { id: 'recent', label: 'Recent', onClick: onRecent },
          { id: 'settings', label: 'Settings', onClick: onSettings },
        ].map(u => {
          const isActive = activeUtility === (u.id as any)
          return (
            <button
              key={u.id}
              onClick={u.onClick}
              data-utility={u.id}
              data-active={isActive ? '1' : '0'}
              style={{
                appearance: 'none',
                background: isActive
                  ? isDark
                    ? 'rgba(125,249,255,0.10)'
                    : 'rgba(90,170,255,0.12)'
                  : 'transparent',
                border: isActive
                  ? `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(90,170,255,0.18)'}`
                  : '1px solid transparent',
                color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.72)',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10.5,
                letterSpacing: '0.04em',
                padding: '6px 10px',
                borderRadius: 999,
                cursor: 'pointer',
                textAlign: 'left' as const,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: isActive ? 1 : 0.84,
                transition: 'background 260ms ease, border-color 260ms ease, opacity 260ms ease',
                width: 'fit-content',
              }}
            >
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: isActive ? (isDark ? '#7df9ff' : '#4f8eff') : isDark ? 'rgba(230,244,255,0.5)' : 'rgba(18,26,44,0.4)', display: 'inline-block' }} />
              {u.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SystemShelf
