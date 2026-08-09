import { useEffect } from 'react'
import SystemLogo from './SystemLogo'
import { getSystemMeta } from '../presentation/systemMeta'

/**
 * Golden Screen A — SYSTEM / CONSOLE LANDING
 *
 * LEFT 30-34% info / interaction
 * RIGHT 66-70% existing Crystal artwork remains visually dominant
 *
 * - No transparent hardware foreground PNG in this view
 * - No gameplay / physical / glass
 * - Transparent/clear Crystal UI only where required
 * - Almost no generic launcher chrome
 * - Premium ES-DE Crystal benchmark class
 */

export type LandingGameBrief = {
  id: string
  name: string
  coverUrl?: string | null
  marqueeUrl?: string | null
  logoUrl?: string | null
  lastPlayedLabel?: string
  metricLabel?: string
}

export type SystemLandingProps = {
  systemId: string
  fullName: string
  theme: 'light' | 'dark'
  systemIndex: number // 0-based
  totalSystems: number
  logoUrl?: string | null
  backgroundUrl?: string | null // for preload, not rendered directly – parent handles bg
  nextBackgroundUrl?: string | null
  prevBackgroundUrl?: string | null
  nextLogoUrl?: string | null
  prevLogoUrl?: string | null
  gameCount: number
  favoriteCount: number
  continueGame?: LandingGameBrief | null
  recentGame?: LandingGameBrief | null
  mostPlayedGame?: LandingGameBrief | null
  surpriseGame?: LandingGameBrief | null
  meta?: { maker?: string; year?: string | number; form?: string; tagline?: string; facts?: string[] }
  onEnter: () => void
  onPrev: () => void
  onNext: () => void
  onAllGames?: () => void
  onFavorites?: () => void
  onRecent?: () => void
  onSettings?: () => void
}

function formatIndex(idx: number, total: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(idx + 1)} / ${pad(total)}`
}

export function SystemLanding({
  systemId,
  fullName,
  theme,
  systemIndex,
  totalSystems,
  logoUrl,
  nextBackgroundUrl,
  prevBackgroundUrl,
  nextLogoUrl,
  prevLogoUrl,
  gameCount,
  favoriteCount,
  continueGame,
  recentGame,
  mostPlayedGame,
  surpriseGame,
  meta,
  onEnter,
  onPrev,
  onNext,
}: SystemLandingProps) {
  const isDark = theme === 'dark'
  const resolvedMeta = meta || getSystemMeta(systemId)

  // preload neighbours
  useEffect(() => {
    const urls = [nextBackgroundUrl, prevBackgroundUrl, nextLogoUrl, prevLogoUrl].filter(Boolean) as string[]
    urls.forEach(u => {
      const im = new Image()
      im.decoding = 'async'
      im.src = u
    })
  }, [nextBackgroundUrl, prevBackgroundUrl, nextLogoUrl, prevLogoUrl, systemId])

  return (
    <div
      className="golden-system-landing"
      data-system-id={systemId}
      data-theme={theme}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        zIndex: 6,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {/* LEFT 30-34% info */}
      <div
        className="landing-left"
        style={{
          width: '32%',
          minWidth: '30%',
          maxWidth: '34%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 22px 22px 26px',
          boxSizing: 'border-box',
          background: isDark
            ? 'linear-gradient(90deg, rgba(6,9,14,0.56) 0%, rgba(8,11,20,0.38) 48%, rgba(10,12,18,0.14) 88%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(250,252,255,0.82) 0%, rgba(244,247,255,0.58) 46%, rgba(240,244,255,0.22) 84%, transparent 100%)',
          backdropFilter: 'blur(18px) saturate(1.04)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.04)',
          borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)'}`,
        }}
      >
        {/* TOP index / category */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color: isDark ? 'rgba(230,244,255,0.68)' : 'rgba(18,26,44,0.62)',
            marginBottom: 20,
          }}
        >
          <span style={{ fontWeight: 600 }}>{formatIndex(systemIndex, totalSystems)}</span>
          <span style={{ width: 28, height: 1, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)', display: 'inline-block' }} />
          <span style={{ color: isDark ? 'rgba(125,249,255,0.78)' : 'rgba(70,130,255,0.86)' }}>CONSOLE</span>
        </div>

        {/* Logo */}
        <div style={{ marginBottom: 18 }}>
          <SystemLogo systemId={systemId} logoUrl={logoUrl || undefined} fallbackName={fullName} isSelected theme={theme} />
        </div>

        {/* System facts */}
        <div style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, letterSpacing: '0.06em', color: isDark ? 'rgba(230,244,255,0.56)' : 'rgba(18,26,44,0.56)', textTransform: 'uppercase' }}>
            {(resolvedMeta.maker || 'Maker')} {resolvedMeta.year ? `• ${resolvedMeta.year}` : ''} {resolvedMeta.form ? `• ${resolvedMeta.form}` : ''}
          </div>
          {resolvedMeta.tagline && (
            <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 13, color: isDark ? 'rgba(230,244,255,0.82)' : 'rgba(18,26,44,0.82)', marginTop: 4, opacity: 0.9 }}>
              {resolvedMeta.tagline}
            </div>
          )}
          {resolvedMeta.facts && resolvedMeta.facts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {resolvedMeta.facts.slice(0, 3).map((f, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(90,160,255,0.10)',
                    border: `1px solid ${isDark ? 'rgba(125,249,255,0.12)' : 'rgba(90,160,255,0.14)'}`,
                    color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.68)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Real library summary */}
        <div
          style={{
            marginBottom: 18,
            padding: '12px 12px 12px',
            borderRadius: 12,
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.54)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)'}`,
          }}
        >
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.68, marginBottom: 8, color: isDark ? '#e6f4ff' : '#121a2c' }}>
            YOUR LIBRARY
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <div>
              <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 20, fontWeight: 600, color: isDark ? '#eef7ff' : '#18223e' }}>{gameCount}</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.64, textTransform: 'uppercase' }}>GAMES</div>
            </div>
            <div style={{ width: 1, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)' }} />
            <div>
              <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 20, fontWeight: 600, color: isDark ? '#7df9ff' : '#4a86ff' }}>{favoriteCount}</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.64, textTransform: 'uppercase' }}>FAVORITES</div>
            </div>
          </div>
        </div>

        {/* Continue playing – collapse if none */}
        {continueGame && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.64, marginBottom: 8, color: isDark ? '#e6f4ff' : '#121a2c' }}>
              CONTINUE PLAYING
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: isDark ? 'rgba(125,249,255,0.06)' : 'rgba(90,160,255,0.08)',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.10)' : 'rgba(90,160,255,0.12)'}`,
              }}
            >
              {continueGame.coverUrl ? (
                <img src={continueGame.coverUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 6 }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: 6, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)', display: 'grid', placeItems: 'center', fontSize: 10 }}>▶</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isDark ? '#eef7ff' : '#16213e' }}>{continueGame.name}</div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.64 }}>{continueGame.lastPlayedLabel || continueGame.metricLabel || 'recent'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Your rotation */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.64, marginBottom: 10, color: isDark ? '#e6f4ff' : '#121a2c' }}>
            YOUR ROTATION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'RECENT', game: recentGame },
              { label: 'MOST PLAYED', game: mostPlayedGame },
              { label: 'SURPRISE', game: surpriseGame },
            ].map(item => {
              const g = item.game
              if (!g) return null // collapse if no data – no empty decorative UI per spec
              return (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.92 }}>
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, width: 72, opacity: 0.6, textTransform: 'uppercase', color: isDark ? 'rgba(230,244,255,0.6)' : 'rgba(18,26,44,0.58)' }}>{item.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {g.coverUrl ? (
                      <img src={g.coverUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4, border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}` }} />
                    ) : null}
                    <span style={{ fontFamily: 'var(--crystal-display)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isDark ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.84)' }}>{g.name}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Primary CTA */}
        <div style={{ marginTop: 'auto' }}>
          <button
            onClick={onEnter}
            data-action="enter-library"
            style={{
              appearance: 'none',
              background: isDark
                ? 'linear-gradient(100deg, rgba(125,249,255,0.14), rgba(125,249,255,0.06) 60%, rgba(255,255,255,0.04))'
                : 'linear-gradient(100deg, rgba(70,130,255,0.16), rgba(90,160,255,0.06) 60%, rgba(255,255,255,0.6))',
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.20)' : 'rgba(70,130,255,0.20)'}`,
              borderRadius: 999,
              padding: '12px 16px',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isDark ? '#e6f7ff' : '#1e2f62',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              width: '100%',
              boxShadow: isDark ? '0 6px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(125,249,255,0.06) inset' : '0 6px 18px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
              transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1), background 250ms ease, border-color 250ms ease',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isDark ? '#7df9ff' : '#4a86ff',
                color: isDark ? '#041018' : '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 12,
                boxShadow: isDark ? '0 0 14px rgba(125,249,255,0.5)' : '0 0 12px rgba(70,130,255,0.32)',
                flexShrink: 0,
              }}
            >
              A
            </span>
            <span style={{ fontWeight: 600 }}>ENTER YOUR {fullName.toUpperCase()} LIBRARY</span>
          </button>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.52, marginTop: 10, color: isDark ? 'rgba(230,244,255,0.54)' : 'rgba(18,26,44,0.52)' }}>
            LEFT / RIGHT switches platform • A enters • MENU settings
          </div>
        </div>
      </div>

      {/* RIGHT 66-70% – artwork hero – intentionally empty to keep existing Crystal artwork dominant */}
      <div style={{ flex: 1, position: 'relative', pointerEvents: 'none' }} />

      {/* Restrained L/R edge arrows */}
      <button
        onClick={onPrev}
        aria-label="Previous system"
        data-nav="prev"
        style={{
          position: 'absolute',
          left: '32%',
          top: '50%',
          transform: 'translateY(-50%) translateX(-50%)',
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isDark ? 'rgba(6,10,16,0.42)' : 'rgba(250,252,255,0.74)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          color: isDark ? 'rgba(230,244,255,0.82)' : 'rgba(18,26,44,0.76)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 250ms ease',
        }}
      >
        ‹
      </button>
      <button
        onClick={onNext}
        aria-label="Next system"
        data-nav="next"
        style={{
          position: 'absolute',
          right: 18,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isDark ? 'rgba(6,10,16,0.42)' : 'rgba(250,252,255,0.74)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          color: isDark ? 'rgba(230,244,255,0.82)' : 'rgba(18,26,44,0.76)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 250ms ease',
        }}
      >
        ›
      </button>
    </div>
  )
}

export default SystemLanding
