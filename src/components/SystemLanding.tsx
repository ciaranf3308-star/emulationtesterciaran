import { useEffect, useState, useMemo } from 'react'
import SystemLogo from './SystemLogo'
import { getSystemMeta } from '../presentation/systemMeta'

/**
 * Golden Screen A — SYSTEM LANDING / CONSOLE SHOWROOM
 * V8.3 Crystal Frontend – world-class premium, beating ES-DE
 *
 * LEFT 30-34% dense editorial / interaction
 * RIGHT 66-70% hero negative space + subtle recent-game wash
 *
 * Crystal rules:
 * - NOT every text inside rounded rectangles – typography + dividers first
 * - Glass only structurally justified, thin clear acrylic (not SaaS slab)
 * - Mono 10px only where technical, primary readable display elsewhere
 * - Logo 200-320px effective, drop-shadow depth, no scale(1.25) hack
 * - 1920x1080 intentional fill via negative space, not widget stuffing
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
  onDiscover?: () => void // V8.4 DISCOVER secondary
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
  onDiscover,
}: SystemLandingProps) {
  const isDark = theme === 'dark'
  const resolvedMeta = meta || getSystemMeta(systemId)
  const [ctaHover, setCtaHover] = useState(false)
  const [ctaFocus, setCtaFocus] = useState(false)
  const [navHover, setNavHover] = useState<'prev' | 'next' | null>(null)
  const [discoverHover, setDiscoverHover] = useState(false)

  // preload neighbours – smooth 250-400ms crossfade
  useEffect(() => {
    const urls = [nextBackgroundUrl, prevBackgroundUrl, nextLogoUrl, prevLogoUrl].filter(Boolean) as string[]
    urls.forEach(u => {
      const im = new Image()
      im.decoding = 'async'
      im.src = u
    })
  }, [nextBackgroundUrl, prevBackgroundUrl, nextLogoUrl, prevLogoUrl, systemId])

  const makerLine = useMemo(() => {
    const maker = resolvedMeta.maker?.toUpperCase?.() ?? resolvedMeta.maker
    const year = resolvedMeta.year ? String(resolvedMeta.year) : ''
    const form = resolvedMeta.form?.toUpperCase?.() ?? resolvedMeta.form
    const parts: string[] = []
    if (maker) parts.push(maker)
    if (year) parts.push(year)
    if (form) parts.push(form)
    parts.push('CONSOLE')
    return parts.join('  ·  ')
  }, [resolvedMeta])

  // fixture detection – lowers opacity to 18% depth per spec
  const recentIsFixture = Boolean(
    recentGame?.id?.startsWith('_') ||
      recentGame?.coverUrl?.toString?.().toLowerCase?.().includes('fixture')
  )

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
        fontVariantLigatures: 'common-ligatures',
      }}
    >
      {/* LEFT 30-34% editorial */}
      <div
        className="landing-left"
        style={{
          width: '32%',
          minWidth: '30%',
          maxWidth: '34%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 22px 20px 26px',
          boxSizing: 'border-box',
          background: isDark
            ? 'linear-gradient(90deg, rgba(6,9,14,0.62) 0%, rgba(8,11,20,0.42) 48%, rgba(10,12,18,0.16) 86%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(251,253,255,0.88) 0%, rgba(244,247,255,0.62) 48%, rgba(238,242,255,0.24) 84%, transparent 100%)',
          backdropFilter: 'blur(20px) saturate(1.06)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.06)',
          borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)'}`,
        }}
      >
        {/* TOP index / category – strong scale contrast */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11.5,
            letterSpacing: '0.10em',
            textTransform: 'uppercase' as const,
            color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.64)',
            marginBottom: 20,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' as any, color: isDark ? 'rgba(238,247,255,0.96)' : 'rgba(18,26,44,0.92)', letterSpacing: '0.04em' }}>
            {formatIndex(systemIndex, totalSystems)}
          </span>
          <span
            aria-hidden
            style={{
              width: 40,
              height: 1.25,
              background: `linear-gradient(90deg, ${isDark ? 'rgba(125,249,255,0.52)' : 'rgba(70,130,255,0.52)'}, ${isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.14)'} 58%, transparent)`,
              display: 'inline-block',
              opacity: 0.96,
              borderRadius: 999,
            }}
          />
          <span style={{ color: isDark ? 'rgba(125,249,255,0.90)' : 'rgba(70,130,255,0.94)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em' }}>CONSOLE</span>
        </div>

        {/* PLATFORM LOGO – 200-320px effective, drop-shadow depth, no scale hack */}
        <div
          style={{
            marginBottom: 16,
            width: '100%',
            maxWidth: 320,
            minWidth: 200,
            minHeight: 64,
            display: 'block',
            position: 'relative',
            filter: isDark
              ? 'drop-shadow(0 8px 24px rgba(0,0,0,0.42)) drop-shadow(0 0 28px rgba(125,249,255,0.14))'
              : 'drop-shadow(0 8px 20px rgba(18,26,44,0.14)) drop-shadow(0 0 18px rgba(90,160,255,0.10))',
          }}
        >
          <SystemLogo
            systemId={systemId}
            logoUrl={logoUrl || undefined}
            fallbackName={fullName}
            isSelected
            theme={theme}
            style={{
              placeItems: 'start',
              justifyItems: 'start',
              width: 'auto',
              minWidth: 200,
              maxWidth: 320,
              minHeight: 64,
            }}
          />
        </div>

        {/* Manufacturer · Year · Media line – 11px mono uppercase */}
        <div
          style={{
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const,
            color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.62)',
            fontWeight: 600,
            lineHeight: 1.25,
            marginBottom: 10,
            opacity: 0.98,
          }}
        >
          {makerLine}
        </div>

        {/* Premium editorial descriptor – 12-20 words, display type, 32ch */}
        {resolvedMeta.tagline && (
          <div
            style={{
              fontFamily: 'var(--crystal-display)',
              fontSize: 13.8,
              fontWeight: 450,
              color: isDark ? 'rgba(232,245,255,0.90)' : 'rgba(22,32,62,0.88)',
              lineHeight: 1.46,
              maxWidth: '32ch',
              marginBottom: 14,
              letterSpacing: '-0.01em',
              opacity: 0.96,
            }}
          >
            {resolvedMeta.tagline}
          </div>
        )}

        {/* Facts / design tags – crisp pill, 10.5px mono, max 2-3 */}
        {resolvedMeta.facts && resolvedMeta.facts.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 20 }}>
            {resolvedMeta.facts.slice(0, 3).map((f, i) => (
              <span
                key={i}
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 10.5,
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: isDark ? 'rgba(125,249,255,0.10)' : 'rgba(90,160,255,0.10)',
                  border: `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(90,160,255,0.18)'}`,
                  color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.70)',
                  fontWeight: 500,
                  letterSpacing: '0.025em',
                  lineHeight: 1,
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* YOUR LIBRARY – large numbers, thin intentional glass, no giant slab */}
        <div
          style={{
            marginBottom: 18,
            padding: '12px 13px 11px',
            borderRadius: 13,
            background: isDark
              ? 'linear-gradient(100deg, rgba(18,26,44,0.46), rgba(12,18,30,0.24))'
              : 'linear-gradient(100deg, rgba(255,255,255,0.72), rgba(240,244,255,0.48))',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)'}`,
            boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.20)' : '0 6px 16px rgba(18,26,44,0.05)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 0,
          }}
        >
          <div style={{ flexBasis: 'auto' }}>
            <div
              style={{
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10,
                letterSpacing: '0.10em',
                textTransform: 'uppercase' as const,
                opacity: 0.68,
                marginBottom: 8,
                color: isDark ? '#e6f4ff' : '#121a2c',
                fontWeight: 700,
              }}
            >
              YOUR LIBRARY
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 26, fontWeight: 700, color: isDark ? '#eef7ff' : '#18223e', lineHeight: 1, fontVariantNumeric: 'tabular-nums' as any }}>
                  {gameCount}
                </div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.66, textTransform: 'uppercase' as const, marginTop: 4, letterSpacing: '0.05em', fontWeight: 600 }}>
                  GAMES
                </div>
              </div>
              <div style={{ width: 1, height: 32, background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(18,26,44,0.09)', alignSelf: 'center', marginBottom: 4 }} />
              <div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 26, fontWeight: 700, color: isDark ? '#7df9ff' : '#4a86ff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' as any }}>
                  {favoriteCount}
                </div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.66, textTransform: 'uppercase' as const, marginTop: 4, letterSpacing: '0.05em', fontWeight: 600 }}>
                  FAVORITES
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTINUE PLAYING – 64px cover, hierarchy */}
        {continueGame ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase' as const, opacity: 0.70, marginBottom: 9, color: isDark ? '#e6f4ff' : '#121a2c', fontWeight: 700 }}>
              CONTINUE PLAYING
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 11px',
                borderRadius: 12,
                background: isDark
                  ? 'linear-gradient(100deg, rgba(125,249,255,0.11), rgba(125,249,255,0.05) 66%, rgba(255,255,255,0.03))'
                  : 'linear-gradient(100deg, rgba(90,160,255,0.12), rgba(90,160,255,0.05) 64%, rgba(255,255,255,0.72))',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.15)' : 'rgba(90,160,255,0.16)'}`,
                boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.22)' : '0 6px 16px rgba(18,26,44,0.06)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              {continueGame.coverUrl ? (
                <img
                  src={continueGame.coverUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: 'cover',
                    borderRadius: 9,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.09)'}`,
                    boxShadow: '0 5px 14px rgba(0,0,0,0.22)',
                    flexShrink: 0,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.05)',
                  }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 9, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>
                  ▶
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  title={continueGame.name}
                  style={{
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 13.8,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isDark ? '#eef7ff' : '#17213e',
                    lineHeight: 1.22,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {continueGame.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isDark ? '#7df9ff' : '#4a86ff', boxShadow: isDark ? '0 0 6px rgba(125,249,255,0.7)' : '0 0 5px rgba(70,130,255,0.5)', flexShrink: 0 }} />
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.66)', fontWeight: 500 }}>
                    {continueGame.lastPlayedLabel || continueGame.metricLabel || 'recent • resume'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* YOUR ROTATION – curated shelf, 56-64px covers, staggered, not SaaS cards */}
        <div style={{ marginBottom: 18, flex: 1, minHeight: 0 }}>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase' as const, opacity: 0.68, marginBottom: 10, color: isDark ? '#e6f4ff' : '#121a2c', fontWeight: 700 }}>
            YOUR ROTATION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'RECENT', game: recentGame },
              { label: 'MOST PLAYED', game: mostPlayedGame },
              { label: 'SURPRISE', game: surpriseGame },
            ].map((item, idx) => {
              const g = item.game
              if (!g) return null
              const stagger = idx === 1 ? 6 : idx === 2 ? 2 : 0
              return (
                <div
                  key={item.label}
                  className="rotation-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 8px',
                    borderRadius: 10,
                    background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.42)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.035)' : 'rgba(18,26,44,0.045)'}`,
                    transform: `translateX(${stagger}px)`,
                    transition: 'transform 240ms cubic-bezier(0.16,1,0.3,1), background 220ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 9,
                      opacity: 0.56,
                      textTransform: 'uppercase' as const,
                      color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.54)',
                      letterSpacing: '0.06em',
                      lineHeight: 1,
                      fontWeight: 700,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {g.coverUrl ? (
                      <img
                        src={g.coverUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}`,
                          boxShadow: '0 3px 10px rgba(0,0,0,0.16)',
                          flexShrink: 0,
                          background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
                        }}
                      />
                    ) : g.logoUrl || g.marqueeUrl ? (
                      <img
                        src={(g.logoUrl || g.marqueeUrl) as string}
                        alt=""
                        loading="lazy"
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: 'contain',
                          borderRadius: 8,
                          background: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.92)',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}`,
                          padding: 4,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 8,
                          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.05)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          flexShrink: 0,
                          fontFamily: 'var(--crystal-mono)',
                          opacity: 0.62,
                        }}
                      >
                        •
                      </div>
                    )}
                    <span
                      title={g.name}
                      style={{
                        fontFamily: 'var(--crystal-display)',
                        fontSize: 12.8,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isDark ? 'rgba(232,245,255,0.90)' : 'rgba(18,26,44,0.86)',
                        lineHeight: 1.24,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {g.name}
                    </span>
                  </div>
                </div>
              )
            })}
            {!recentGame && !mostPlayedGame && !surpriseGame && (
              <div
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 11,
                  opacity: 0.42,
                  padding: '11px 12px',
                  borderRadius: 10,
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(18,26,44,0.03)',
                  border: `1px dashed ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                  lineHeight: 1.4,
                }}
              >
                Populating — ROM scan will fill your rotation with recent and serendipity picks.
              </div>
            )}
          </div>
        </div>

        {/* PRIMARY CTA – lower-left premium thin clear-glass, restrained cool glow */}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button
            onClick={onEnter}
            data-action="enter-library"
            onMouseEnter={() => setCtaHover(true)}
            onMouseLeave={() => setCtaHover(false)}
            onFocus={() => setCtaFocus(true)}
            onBlur={() => setCtaFocus(false)}
            style={{
              appearance: 'none',
              background: isDark
                ? `linear-gradient(100deg, rgba(125,249,255,0.15), rgba(125,249,255,0.06) 58%, rgba(255,255,255,0.04))`
                : `linear-gradient(100deg, rgba(70,130,255,0.16), rgba(90,160,255,0.06) 58%, rgba(255,255,255,0.72))`,
              border: `1px solid ${isDark ? (ctaHover ? 'rgba(125,249,255,0.28)' : 'rgba(125,249,255,0.18)') : ctaHover ? 'rgba(70,130,255,0.26)' : 'rgba(70,130,255,0.18)'}`,
              borderRadius: 999,
              padding: '12px 16px',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: isDark ? '#e6f7ff' : '#1e2f62',
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              cursor: 'pointer',
              width: '100%',
              boxShadow: ctaHover
                ? isDark
                  ? '0 10px 28px rgba(0,0,0,0.38), 0 0 0 1px rgba(125,249,255,0.10) inset, 0 0 22px rgba(125,249,255,0.18)'
                  : '0 10px 24px rgba(18,26,44,0.12), inset 0 1px 0 rgba(255,255,255,0.92), 0 0 16px rgba(90,160,255,0.18)'
                : isDark
                  ? '0 7px 22px rgba(0,0,0,0.32), 0 0 0 1px rgba(125,249,255,0.06) inset'
                  : '0 7px 18px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.88)',
              transform: ctaHover ? 'translateY(-1px)' : 'translateY(0)',
              transition:
                'transform 260ms cubic-bezier(0.16,1,0.3,1), background 260ms ease, border-color 260ms ease, box-shadow 260ms ease',
              outline: ctaFocus ? `2px solid ${isDark ? 'rgba(125,249,255,0.54)' : 'rgba(70,130,255,0.52)'}` : 'none',
              outlineOffset: 2,
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
                fontWeight: 800,
                fontSize: 12,
                boxShadow: isDark ? '0 0 14px rgba(125,249,255,0.52)' : '0 0 12px rgba(70,130,255,0.32)',
                flexShrink: 0,
                fontFamily: 'var(--crystal-mono)',
              }}
            >
              A
            </span>
            <span style={{ fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1 }}>ENTER YOUR {fullName.toUpperCase()} LIBRARY</span>
          </button>
          {/* V8.4 DISCOVER secondary — elegant pill, boutique styling, Y allocated */}
          {onDiscover && (
            <button
              onClick={onDiscover}
              data-action="open-discover"
              onMouseEnter={() => setDiscoverHover(true)}
              onMouseLeave={() => setDiscoverHover(false)}
              style={{
                appearance: 'none',
                marginTop: 9,
                background: isDark
                  ? discoverHover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.032)'
                  : discoverHover ? 'rgba(255,255,255,0.84)' : 'rgba(255,255,255,0.56)',
                border: `1px solid ${discoverHover ? (isDark ? 'rgba(125,249,255,0.22)' : 'rgba(70,130,255,0.20)') : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
                borderRadius: 999,
                padding: '8px 13px',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10.2,
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: isDark ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.72)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: discoverHover ? (isDark ? '0 4px 12px rgba(0,0,0,0.22), 0 0 0 1px rgba(125,249,255,0.06) inset' : '0 4px 12px rgba(18,26,44,0.08)') : 'none',
                transition: 'all 200ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.14)',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.22)'}`,
                display: 'grid', placeItems: 'center',
                fontWeight: 800, fontSize: 9.5, color: isDark ? '#7df9ff' : '#4a86ff',
              }}>Y</span>
              <span style={{ fontWeight: 600 }}>DISCOVER</span>
              <span aria-hidden style={{ width: 1, height: 10, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.10)', display: 'inline-block' }} />
              <span style={{ opacity: 0.62, fontWeight: 500, letterSpacing: '0.04em' }}>VIMM'S LAIR • CATALOG</span>
            </button>
          )}
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10,
              opacity: 0.50,
              marginTop: 9,
              color: isDark ? 'rgba(230,244,255,0.52)' : 'rgba(18,26,44,0.50)',
              letterSpacing: '0.02em',
              lineHeight: 1.3,
            }}
          >
            LEFT / RIGHT switches platform • A enters • Y discover • MENU settings
          </div>
        </div>
      </div>

      {/* RIGHT 66-70% – hero negative space + subtle recent-game blurred wash */}
      <div style={{ flex: 1, position: 'relative', pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Subtle most-recent game art behind – 44% real, 18% fixture depth, blur 32px scale 1.08 */}
        {recentGame?.coverUrl ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-10%',
              overflow: 'hidden',
              pointerEvents: 'none',
              opacity: recentIsFixture ? (isDark ? 0.20 : 0.14) : isDark ? 0.38 : 0.24,
              transition: 'opacity 360ms cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <img
              src={recentGame.coverUrl}
              alt=""
              loading="eager"
              decoding="async"
              style={{
                width: '118%',
                height: '118%',
                objectFit: 'cover',
                objectPosition: 'center 38%',
                filter: 'blur(32px) saturate(1.12) brightness(1.02)',
                transform: 'scale(1.08)',
                transformOrigin: 'center center',
              }}
            />
            {/* cool vignette / wash to keep console identity first */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: isDark
                  ? 'radial-gradient(82% 68% at 52% 40%, transparent 12%, rgba(6,9,14,0.18) 56%, rgba(6,9,14,0.62) 92%), linear-gradient(90deg, rgba(6,9,14,0.72) 0%, rgba(6,9,14,0.18) 36%, transparent 78%)'
                  : 'radial-gradient(84% 70% at 54% 42%, transparent 10%, rgba(250,252,255,0.18) 54%, rgba(244,247,255,0.58) 90%), linear-gradient(90deg, rgba(251,253,255,0.66) 0%, rgba(251,253,255,0.14) 34%, transparent 76%)',
                mixBlendMode: 'normal' as any,
              }}
            />
          </div>
        ) : null}
        {/* subtle hardware sheen – not opaque */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'linear-gradient(102deg, transparent 0%, rgba(125,249,255,0.03) 22%, transparent 46%)'
              : 'linear-gradient(102deg, transparent 0%, rgba(90,160,255,0.05) 24%, transparent 48%)',
            opacity: 0.6,
          }}
        />
      </div>

      {/* Restrained L/R edge arrows – 38px circles, 250-400ms */}
      <button
        onClick={onPrev}
        aria-label="Previous system"
        data-nav="prev"
        onMouseEnter={() => setNavHover('prev')}
        onMouseLeave={() => setNavHover(null)}
        style={{
          position: 'absolute',
          left: 'calc(32% - 1px)',
          top: '50%',
          transform: `translateY(-50%) translateX(-50%) ${navHover === 'prev' ? 'scale(1.06)' : 'scale(1)'}`,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isDark ? 'rgba(8,12,18,0.46)' : 'rgba(251,253,255,0.78)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
          backdropFilter: 'blur(14px) saturate(1.08)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
          color: isDark ? 'rgba(230,244,255,0.84)' : 'rgba(18,26,44,0.76)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 250ms cubic-bezier(0.16,1,0.3,1)',
          fontSize: 18,
          lineHeight: 1,
          boxShadow: navHover === 'prev' ? (isDark ? '0 6px 18px rgba(0,0,0,0.32)' : '0 6px 16px rgba(18,26,44,0.12)') : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        ‹
      </button>
      <button
        onClick={onNext}
        aria-label="Next system"
        data-nav="next"
        onMouseEnter={() => setNavHover('next')}
        onMouseLeave={() => setNavHover(null)}
        style={{
          position: 'absolute',
          right: 18,
          top: '50%',
          transform: `translateY(-50%) ${navHover === 'next' ? 'scale(1.06)' : 'scale(1)'}`,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isDark ? 'rgba(8,12,18,0.46)' : 'rgba(251,253,255,0.78)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
          backdropFilter: 'blur(14px) saturate(1.08)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
          color: isDark ? 'rgba(230,244,255,0.84)' : 'rgba(18,26,44,0.76)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 260ms cubic-bezier(0.16,1,0.3,1)',
          fontSize: 18,
          lineHeight: 1,
          boxShadow: navHover === 'next' ? (isDark ? '0 6px 18px rgba(0,0,0,0.32)' : '0 6px 16px rgba(18,26,44,0.12)') : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        ›
      </button>

      {/* Focus + upscale override – beats 168px cap to 320px showroom presence */}
      <style>{`
        .golden-system-landing button:focus-visible {
          outline: 2px solid ${isDark ? 'rgba(125,249,255,0.62)' : 'rgba(70,130,255,0.62)'};
          outline-offset: 2px;
        }
        .golden-system-landing .system-logo.is-selected img {
          max-width: 320px !important;
          max-height: 112px !important;
          min-width: 200px;
          width: auto !important;
        }
        .golden-system-landing .system-logo.is-selected {
          filter: drop-shadow(0 0 0 transparent);
        }
        @media (max-width: 1280px) {
          .golden-system-landing .system-logo.is-selected img {
            max-width: 260px !important;
          }
        }
        .rotation-row:hover {
          background: ${isDark ? 'rgba(255,255,255,0.045) !important' : 'rgba(255,255,255,0.62) !important'};
        }
      `}</style>
    </div>
  )
}

export default SystemLanding
