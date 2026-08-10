import { useEffect, useState, useMemo } from 'react'
import SystemLogo from './SystemLogo'
import { getSystemMeta } from '../presentation/systemMeta'
import { SystemSummary } from './landing/SystemSummary'

/**
 * Golden Screen A — SYSTEM LANDING / CONSOLE SHOWROOM
 * V8.5 SIMPLIFIED – less card/dashboard, more cinematic hierarchy
 *
 * LEFT 28-32% curated, feathered, no giant rectangles
 * RIGHT 68-72% hero negative space + subtle wash
 *
 * Crystal rules V8.5:
 * - Original system artwork remains hero – no transparent hardware PNG
 * - No hard vertical wall – feathered gradient, no full-height card
 * - Typography readable, primary comfortable, mono only for small meta
 * - Light mode: clear product photography, improved contrast, no grey fog
 * - Dark mode: dramatic, no pure-black crush, UI + artwork one composition
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
  backgroundUrl?: string | null
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
  onDiscover?: () => void
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
    urls.forEach((u) => {
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

  const recentIsFixture = Boolean(
    recentGame?.id?.startsWith('_') || recentGame?.coverUrl?.toString?.().toLowerCase?.().includes('fixture')
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
      {/* LEFT 28-32% curated – feathered, no hard wall */}
      <div
        className="landing-left"
        style={{
          width: '30%',
          minWidth: 360,
          maxWidth: 440,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '18px 20px 16px 24px',
          boxSizing: 'border-box',
          background: isDark
            ? 'linear-gradient(90deg, rgba(6,9,14,0.76) 0%, rgba(8,11,20,0.50) 54%, rgba(10,12,18,0.14) 86%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(251,253,255,0.94) 0%, rgba(244,247,255,0.70) 52%, rgba(238,242,255,0.20) 84%, transparent 100%)',
          backdropFilter: 'blur(18px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.05)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {/* TOP index / identity */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isDark ? 'rgba(230,244,255,0.66)' : 'rgba(18,26,44,0.60)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: 12.5,
              fontVariantNumeric: 'tabular-nums',
              color: isDark ? 'rgba(238,247,255,0.92)' : 'rgba(18,26,44,0.88)',
              letterSpacing: '0.03em',
            }}
          >
            {formatIndex(systemIndex, totalSystems)}
          </span>
          <span
            aria-hidden
            style={{
              width: 32,
              height: 1,
              background: `linear-gradient(90deg, ${isDark ? 'rgba(125,249,255,0.48)' : 'rgba(70,130,255,0.46)'}, transparent)`,
              borderRadius: 999,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: '0.10em', color: isDark ? 'rgba(125,249,255,0.88)' : 'rgba(60,110,255,0.90)' }}>
            CONSOLE
          </span>
        </div>

        {/* PLATFORM LOGO – 200-320 effective, drop-shadow depth */}
        <div
          style={{
            width: '100%',
            maxWidth: 300,
            minHeight: 56,
            filter: isDark
              ? 'drop-shadow(0 8px 20px rgba(0,0,0,0.38)) drop-shadow(0 0 18px rgba(125,249,255,0.12))'
              : 'drop-shadow(0 6px 16px rgba(18,26,44,0.12)) drop-shadow(0 0 12px rgba(90,160,255,0.08))',
            flexShrink: 0,
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
              minWidth: 180,
              maxWidth: 300,
              minHeight: 56,
            }}
          />
        </div>

        {/* Manufacturer · Year · Media */}
        <div
          style={{
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10.5,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.58)',
            fontWeight: 600,
            lineHeight: 1.25,
            flexShrink: 0,
          }}
        >
          {makerLine}
        </div>

        {/* Editorial descriptor – concise, readable */}
        {resolvedMeta.tagline && (
          <div
            style={{
              fontFamily: 'var(--crystal-display)',
              fontSize: 13.2,
              fontWeight: 440,
              color: isDark ? 'rgba(232,245,255,0.86)' : 'rgba(18,26,44,0.84)',
              lineHeight: 1.45,
              maxWidth: '30ch',
              letterSpacing: '-0.01em',
              flexShrink: 0,
            }}
          >
            {resolvedMeta.tagline}
          </div>
        )}

        {/* Facts – crisp pills, max 3, subtle */}
        {resolvedMeta.facts && resolvedMeta.facts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {resolvedMeta.facts.slice(0, 3).map((f, i) => (
              <span
                key={i}
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(60,120,255,0.08)',
                  border: `1px solid ${isDark ? 'rgba(125,249,255,0.13)' : 'rgba(60,120,255,0.14)'}`,
                  color: isDark ? 'rgba(230,244,255,0.70)' : 'rgba(18,26,44,0.64)',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Divider – hairline, not a card */}
        <div aria-hidden style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)', margin: '2px 0', flexShrink: 0 }} />

        {/* SYSTEM SUMMARY – library inline, continue, rotation compressed */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SystemSummary
            theme={theme}
            gameCount={gameCount}
            favoriteCount={favoriteCount}
            continueGame={continueGame}
            recentGame={recentGame}
            mostPlayedGame={mostPlayedGame}
            surpriseGame={surpriseGame}
          />
        </div>

        {/* CTA – primary */}
        <div style={{ marginTop: 'auto', paddingTop: 10, flexShrink: 0 }}>
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
                ? 'linear-gradient(100deg, rgba(125,249,255,0.14), rgba(125,249,255,0.05) 62%, rgba(255,255,255,0.04))'
                : 'linear-gradient(100deg, rgba(60,120,255,0.14), rgba(60,120,255,0.05) 62%, rgba(255,255,255,0.84))',
              border: `1px solid ${isDark ? (ctaHover ? 'rgba(125,249,255,0.28)' : 'rgba(125,249,255,0.16)') : ctaHover ? 'rgba(60,120,255,0.28)' : 'rgba(60,120,255,0.18)'}`,
              borderRadius: 999,
              padding: '11px 14px',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: isDark ? '#e6f7ff' : '#1a2a55',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              width: '100%',
              boxShadow: ctaHover
                ? isDark
                  ? '0 8px 20px rgba(0,0,0,0.32), 0 0 0 1px rgba(125,249,255,0.08) inset'
                  : '0 8px 18px rgba(18,26,44,0.10), inset 0 1px 0 rgba(255,255,255,0.90)'
                : isDark
                  ? '0 5px 16px rgba(0,0,0,0.26)'
                  : '0 5px 14px rgba(18,26,44,0.06)',
              transform: ctaHover ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 220ms cubic-bezier(0.16,1,0.3,1)',
              outline: ctaFocus ? `2px solid ${isDark ? 'rgba(125,249,255,0.50)' : 'rgba(60,120,255,0.48)'}` : 'none',
              outlineOffset: 2,
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: isDark ? '#7df9ff' : '#3e7bff',
                color: isDark ? '#061016' : '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 11.5,
                flexShrink: 0,
                fontFamily: 'var(--crystal-mono)',
              }}
            >
              A
            </span>
            <span style={{ fontWeight: 700, lineHeight: 1 }}>ENTER YOUR {fullName.toUpperCase()} LIBRARY</span>
          </button>

          {onDiscover && (
            <button
              onClick={onDiscover}
              data-action="open-discover"
              onMouseEnter={() => setDiscoverHover(true)}
              onMouseLeave={() => setDiscoverHover(false)}
              style={{
                appearance: 'none',
                marginTop: 8,
                background: isDark
                  ? discoverHover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'
                  : discoverHover ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.58)',
                border: `1px solid ${discoverHover ? (isDark ? 'rgba(125,249,255,0.18)' : 'rgba(60,120,255,0.18)') : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.07)'}`,
                borderRadius: 999,
                padding: '7px 11px',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isDark ? 'rgba(230,244,255,0.80)' : 'rgba(18,26,44,0.68)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                transition: 'all 180ms ease',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: isDark ? 'rgba(125,249,255,0.14)' : 'rgba(60,120,255,0.12)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 9,
                  color: isDark ? '#7df9ff' : '#3e7bff',
                }}
              >
                Y
              </span>
              <span style={{ fontWeight: 600 }}>DISCOVER</span>
              <span aria-hidden style={{ width: 1, height: 9, background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.10)' }} />
              <span style={{ opacity: 0.62, fontWeight: 500 }}>ROMSFUN CATALOG</span>
            </button>
          )}

          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 9.5,
              opacity: 0.48,
              marginTop: 7,
              color: isDark ? 'rgba(230,244,255,0.50)' : 'rgba(18,26,44,0.48)',
              letterSpacing: '0.02em',
            }}
          >
            LEFT / RIGHT platform • A enters • Y discover
          </div>
        </div>
      </div>

      {/* RIGHT – hero negative space + subtle wash */}
      <div style={{ flex: 1, position: 'relative', pointerEvents: 'none', overflow: 'hidden' }}>
        {recentGame?.coverUrl ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-8%',
              overflow: 'hidden',
              opacity: recentIsFixture ? (isDark ? 0.18 : 0.12) : isDark ? 0.34 : 0.20,
            }}
          >
            <img
              src={recentGame.coverUrl}
              alt=""
              loading="eager"
              decoding="async"
              style={{
                width: '116%',
                height: '116%',
                objectFit: 'cover',
                objectPosition: 'center 36%',
                filter: 'blur(28px) saturate(1.10) brightness(1.02)',
                transform: 'scale(1.06)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: isDark
                  ? 'radial-gradient(78% 64% at 52% 40%, transparent 14%, rgba(6,9,14,0.20) 56%, rgba(6,9,14,0.58) 92%), linear-gradient(90deg, rgba(6,9,14,0.66) 0%, rgba(6,9,14,0.16) 34%, transparent 76%)'
                  : 'radial-gradient(82% 68% at 54% 42%, transparent 12%, rgba(250,252,255,0.20) 52%, rgba(244,247,255,0.52) 88%), linear-gradient(90deg, rgba(251,253,255,0.60) 0%, rgba(251,253,255,0.12) 32%, transparent 74%)',
              }}
            />
          </div>
        ) : null}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'linear-gradient(102deg, transparent 0%, rgba(125,249,255,0.03) 22%, transparent 46%)'
              : 'linear-gradient(102deg, transparent 0%, rgba(60,120,255,0.04) 24%, transparent 48%)',
            opacity: 0.5,
          }}
        />
      </div>

      {/* L/R edge arrows */}
      <button
        onClick={onPrev}
        aria-label="Previous system"
        data-nav="prev"
        onMouseEnter={() => setNavHover('prev')}
        onMouseLeave={() => setNavHover(null)}
        style={{
          position: 'absolute',
          left: 'calc(30% - 2px)',
          top: '50%',
          transform: `translateY(-50%) translateX(-50%) ${navHover === 'prev' ? 'scale(1.06)' : 'scale(1)'}`,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: isDark ? 'rgba(8,12,18,0.42)' : 'rgba(251,253,255,0.76)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(18,26,44,0.09)'}`,
          backdropFilter: 'blur(12px) saturate(1.06)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.06)',
          color: isDark ? 'rgba(230,244,255,0.80)' : 'rgba(18,26,44,0.72)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 220ms cubic-bezier(0.16,1,0.3,1)',
          fontSize: 18,
          lineHeight: 1,
          boxShadow: '0 4px 10px rgba(0,0,0,0.10)',
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
          right: 16,
          top: '50%',
          transform: `translateY(-50%) ${navHover === 'next' ? 'scale(1.06)' : 'scale(1)'}`,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: isDark ? 'rgba(8,12,18,0.42)' : 'rgba(251,253,255,0.76)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(18,26,44,0.09)'}`,
          backdropFilter: 'blur(12px) saturate(1.06)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.06)',
          color: isDark ? 'rgba(230,244,255,0.80)' : 'rgba(18,26,44,0.72)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 220ms cubic-bezier(0.16,1,0.3,1)',
          fontSize: 18,
          lineHeight: 1,
          boxShadow: '0 4px 10px rgba(0,0,0,0.10)',
        }}
      >
        ›
      </button>

      <style>{`
        .golden-system-landing button:focus-visible {
          outline: 2px solid ${isDark ? 'rgba(125,249,255,0.58)' : 'rgba(60,120,255,0.56)'};
          outline-offset: 2px;
        }
        .golden-system-landing .system-logo.is-selected img {
          max-width: 300px !important;
          max-height: 108px !important;
          min-width: 180px;
          width: auto !important;
        }
        @media (max-width: 1280px) {
          .golden-system-landing .system-logo.is-selected img { max-width: 240px !important; }
          .golden-system-landing .landing-left { min-width: 320px !important; padding: 14px 16px 12px 18px !important; gap: 10px !important; }
        }
        @media (max-height: 720px) {
          .golden-system-landing .landing-left { gap: 8px !important; padding-top: 12px !important; padding-bottom: 10px !important; }
        }
      `}</style>
    </div>
  )
}

export default SystemLanding
