import { useEffect, useState } from 'react'
import SystemLogo from './SystemLogo'
import { getSystemMeta } from '../presentation/systemMeta'

/**
 * Golden Screen A — SYSTEM / CONSOLE LANDING
 * V8.2 visual hierarchy upgrade – ES-DE benchmark
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
  const [ctaHover, setCtaHover] = useState(false)
  const [ctaFocus, setCtaFocus] = useState(false)

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
            gap: 14,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11.5,
            letterSpacing: '0.10em',
            textTransform: 'uppercase' as const,
            color: isDark ? 'rgba(230,244,255,0.74)' : 'rgba(18,26,44,0.68)',
            marginBottom: 24,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' as any }}>
            {formatIndex(systemIndex, totalSystems)}
          </span>
          <span
            aria-hidden
            style={{
              width: 36,
              height: 1,
              background: `linear-gradient(90deg, ${isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.42)'}, transparent)`,
              display: 'inline-block',
              opacity: 0.92,
            }}
          />
          <span style={{ color: isDark ? 'rgba(125,249,255,0.88)' : 'rgba(70,130,255,0.92)', fontWeight: 600 }}>CONSOLE</span>
        </div>

        {/* PLATFORM LOGO – must matter visually 160-260px */}
        <div
          style={{
            marginBottom: 22,
            width: '100%',
            maxWidth: 260,
            minWidth: 160,
            display: 'block',
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: 'scale(1.25)',
              transformOrigin: 'left center',
              width: 'fit-content',
              maxWidth: '100%',
              display: 'flex',
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
                minWidth: 160,
                maxWidth: 260,
                minHeight: 52,
              }}
            />
          </div>
        </div>

        {/* SYSTEM METADATA – maker · year · form + tagline + chip facts */}
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11,
              letterSpacing: '0.07em',
              color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.62)',
              textTransform: 'uppercase' as const,
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {(resolvedMeta.maker || 'Maker')} {resolvedMeta.year ? `• ${resolvedMeta.year}` : ''}{' '}
            {resolvedMeta.form ? `• ${resolvedMeta.form}` : ''}
          </div>
          {resolvedMeta.tagline && (
            <div
              style={{
                fontFamily: 'var(--crystal-display)',
                fontSize: 13.5,
                color: isDark ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.86)',
                marginTop: 4,
                opacity: 0.94,
                lineHeight: 1.35,
                maxWidth: '22ch',
              }}
            >
              {resolvedMeta.tagline}
            </div>
          )}
          {resolvedMeta.facts && resolvedMeta.facts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {resolvedMeta.facts.slice(0, 3).map((f, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10.5,
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: isDark ? 'rgba(125,249,255,0.10)' : 'rgba(90,160,255,0.12)',
                    border: `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(90,160,255,0.18)'}`,
                    color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.74)',
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                    lineHeight: 1,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* YOUR LIBRARY – typography does work, no giant SaaS card */}
        <div
          style={{
            marginBottom: 20,
            padding: '14px 14px 13px',
            borderRadius: 14,
            background: isDark
              ? 'linear-gradient(100deg, rgba(18,26,44,0.54), rgba(12,18,30,0.32))'
              : 'linear-gradient(100deg, rgba(255,255,255,0.78), rgba(240,244,255,0.56))',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.08)'}`,
            boxShadow: isDark ? '0 8px 22px rgba(0,0,0,0.22)' : '0 8px 20px rgba(18,26,44,0.06)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10,
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
              opacity: 0.72,
              marginBottom: 10,
              color: isDark ? '#e6f4ff' : '#121a2c',
              fontWeight: 600,
            }}
          >
            YOUR LIBRARY
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 26,
                  fontWeight: 700,
                  color: isDark ? '#eef7ff' : '#18223e',
                  lineHeight: 1,
                }}
              >
                {gameCount}
              </div>
              <div
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 10.5,
                  opacity: 0.7,
                  textTransform: 'uppercase' as const,
                  marginTop: 4,
                  letterSpacing: '0.04em',
                }}
              >
                GAMES
              </div>
            </div>
            <div
              style={{
                width: 1,
                height: 34,
                background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)',
                alignSelf: 'center',
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 26,
                  fontWeight: 700,
                  color: isDark ? '#7df9ff' : '#4a86ff',
                  lineHeight: 1,
                }}
              >
                {favoriteCount}
              </div>
              <div
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 10.5,
                  opacity: 0.7,
                  textTransform: 'uppercase' as const,
                  marginTop: 4,
                  letterSpacing: '0.04em',
                }}
              >
                FAVORITES
              </div>
            </div>
          </div>
        </div>

        {/* CONTINUE PLAYING – hierarchy + 48px thumb */}
        {continueGame ? (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10,
                letterSpacing: '0.10em',
                textTransform: 'uppercase' as const,
                opacity: 0.72,
                marginBottom: 10,
                color: isDark ? '#e6f4ff' : '#121a2c',
                fontWeight: 600,
              }}
            >
              CONTINUE PLAYING
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 12,
                background: isDark
                  ? 'linear-gradient(100deg, rgba(125,249,255,0.10), rgba(125,249,255,0.04))'
                  : 'linear-gradient(100deg, rgba(90,160,255,0.12), rgba(90,160,255,0.06))',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.14)' : 'rgba(90,160,255,0.16)'}`,
                boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.22)' : '0 6px 16px rgba(18,26,44,0.06)',
              }}
            >
              {continueGame.coverUrl ? (
                <img
                  src={continueGame.coverUrl}
                  alt=""
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.08)'}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ▶
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 13.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isDark ? '#eef7ff' : '#16213e',
                    lineHeight: 1.2,
                  }}
                >
                  {continueGame.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10.5,
                    opacity: 0.72,
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {continueGame.lastPlayedLabel || continueGame.metricLabel || 'recent • resume'}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* YOUR ROTATION – curated visual, not SaaS cards */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10,
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
              opacity: 0.72,
              marginBottom: 12,
              color: isDark ? '#e6f4ff' : '#121a2c',
              fontWeight: 600,
            }}
          >
            YOUR ROTATION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'RECENT', game: recentGame },
              { label: 'MOST PLAYED', game: mostPlayedGame },
              { label: 'SURPRISE', game: surpriseGame },
            ].map(item => {
              const g = item.game
              if (!g) return null
              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 8,
                    borderRadius: 10,
                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.46)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.05)'}`,
                    transition: 'all 200ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      flexShrink: 0,
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 9,
                      opacity: 0.58,
                      textTransform: 'uppercase' as const,
                      color: isDark ? 'rgba(230,244,255,0.6)' : 'rgba(18,26,44,0.58)',
                      letterSpacing: '0.05em',
                      lineHeight: 1,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {g.coverUrl ? (
                      <img
                        src={g.coverUrl}
                        alt=""
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
                          boxShadow: '0 3px 10px rgba(0,0,0,0.16)',
                          flexShrink: 0,
                        }}
                      />
                    ) : g.logoUrl || g.marqueeUrl ? (
                      <img
                        src={(g.logoUrl || g.marqueeUrl) as string}
                        alt=""
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: 'contain',
                          borderRadius: 8,
                          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
                          padding: 3,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 10,
                          flexShrink: 0,
                          fontFamily: 'var(--crystal-mono)',
                          opacity: 0.7,
                        }}
                      >
                        •
                      </div>
                    )}
                    <span
                      title={g.name}
                      style={{
                        fontFamily: 'var(--crystal-display)',
                        fontSize: 12.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isDark ? 'rgba(230,244,255,0.90)' : 'rgba(18,26,44,0.88)',
                        lineHeight: 1.2,
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
                  opacity: 0.44,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(18,26,44,0.03)',
                  border: `1px dashed ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                }}
              >
                Populating — ROM scan will fill your rotation.
              </div>
            )}
          </div>
        </div>

        {/* PRIMARY CTA – lower-left */}
        <div style={{ marginTop: 'auto' }}>
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
                ? 'linear-gradient(100deg, rgba(125,249,255,0.14), rgba(125,249,255,0.06) 60%, rgba(255,255,255,0.04))'
                : 'linear-gradient(100deg, rgba(70,130,255,0.16), rgba(90,160,255,0.06) 60%, rgba(255,255,255,0.6))',
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.20)' : 'rgba(70,130,255,0.20)'}`,
              borderRadius: 999,
              padding: '12px 16px',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: isDark ? '#e6f7ff' : '#1e2f62',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              width: '100%',
              boxShadow: ctaHover
                ? isDark
                  ? '0 8px 26px rgba(0,0,0,0.34), 0 0 0 1px rgba(125,249,255,0.10) inset, 0 0 18px rgba(125,249,255,0.16)'
                  : '0 8px 22px rgba(18,26,44,0.12), inset 0 1px 0 rgba(255,255,255,0.9)'
                : isDark
                  ? '0 6px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(125,249,255,0.06) inset'
                  : '0 6px 18px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
              transform: ctaHover ? 'translateY(-1px)' : 'translateY(0)',
              transition:
                'transform 250ms cubic-bezier(0.16,1,0.3,1), background 250ms ease, border-color 250ms ease, box-shadow 250ms ease',
              outline: ctaFocus
                ? `2px solid ${isDark ? 'rgba(125,249,255,0.56)' : 'rgba(70,130,255,0.56)'}`
                : 'none',
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
                fontWeight: 700,
                fontSize: 12,
                boxShadow: isDark ? '0 0 14px rgba(125,249,255,0.5)' : '0 0 12px rgba(70,130,255,0.32)',
                flexShrink: 0,
              }}
            >
              A
            </span>
            <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>ENTER YOUR {fullName.toUpperCase()} LIBRARY</span>
          </button>
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10,
              opacity: 0.52,
              marginTop: 10,
              color: isDark ? 'rgba(230,244,255,0.54)' : 'rgba(18,26,44,0.52)',
            }}
          >
            LEFT / RIGHT switches platform • A enters • MENU settings
          </div>
        </div>
      </div>

      {/* RIGHT 66-70% – artwork hero – intentionally empty, parent handles BG */}
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
          fontSize: 18,
          lineHeight: 1,
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
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ›
      </button>

      {/* Focus-visible enhancement for keyboard users */}
      <style>{`
        .golden-system-landing button:focus-visible {
          outline: 2px solid ${isDark ? 'rgba(125,249,255,0.62)' : 'rgba(70,130,255,0.62)'};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  )
}

export default SystemLanding
