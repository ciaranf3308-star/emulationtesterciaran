type LandingGameBrief = {
  id: string
  name: string
  coverUrl?: string | null
  marqueeUrl?: string | null
  logoUrl?: string | null
  lastPlayedLabel?: string
  metricLabel?: string
}

type Props = {
  theme: 'light' | 'dark'
  gameCount: number
  favoriteCount: number
  continueGame?: LandingGameBrief | null
  recentGame?: LandingGameBrief | null
  mostPlayedGame?: LandingGameBrief | null
  surpriseGame?: LandingGameBrief | null
}

export function SystemSummary({
  theme,
  gameCount,
  favoriteCount,
  continueGame,
  recentGame,
  mostPlayedGame,
  surpriseGame,
}: Props) {
  const isDark = theme === 'dark'

  const labelColor = isDark ? 'rgba(230,244,255,0.55)' : 'rgba(18,26,44,0.52)'
  const primaryColor = isDark ? '#eef7ff' : '#131b31'
  const secondaryColor = isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.66)'
  const accentCyan = isDark ? '#7df9ff' : '#3e7bff'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* YOUR LIBRARY – inline, not a card */}
      <div>
        <div
          style={{
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: labelColor,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          YOUR LIBRARY
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--crystal-display)',
                fontSize: 24,
                fontWeight: 700,
                color: primaryColor,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {gameCount}
            </span>
            <span
              style={{
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10.5,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: secondaryColor,
                fontWeight: 600,
              }}
            >
              GAMES
            </span>
          </div>
          <span aria-hidden style={{ width: 1, height: 14, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)', display: 'inline-block', transform: 'translateY(2px)' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--crystal-display)',
                fontSize: 24,
                fontWeight: 700,
                color: accentCyan,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {favoriteCount}
            </span>
            <span
              style={{
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10.5,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: secondaryColor,
                fontWeight: 600,
              }}
            >
              FAVORITES
            </span>
          </div>
        </div>
      </div>

      {/* CONTINUE – compact row, no giant slab */}
      {continueGame && (
        <div>
          <div
            style={{
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10,
              letterSpacing: '0.11em',
              textTransform: 'uppercase',
              color: labelColor,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            CONTINUE
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
            }}
          >
            {continueGame.coverUrl ? (
              <img
                src={continueGame.coverUrl}
                alt=""
                loading="eager"
                decoding="async"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 7,
                  objectFit: 'cover',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.08)'}`,
                  boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
                  flexShrink: 0,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                }}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 7,
                  display: 'grid',
                  placeItems: 'center',
                  background: isDark ? 'rgba(125,249,255,0.10)' : 'rgba(60,120,255,0.10)',
                  color: isDark ? '#7df9ff' : '#3e7bff',
                  flexShrink: 0,
                }}
              >
                ▶
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                title={continueGame.name}
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: primaryColor,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                }}
              >
                {continueGame.name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 10.5,
                  color: secondaryColor,
                  fontWeight: 500,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {continueGame.lastPlayedLabel || continueGame.metricLabel || 'resume'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROTATION – compressed, 3 compact rows */}
      <div>
        <div
          style={{
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: labelColor,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          ROTATION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            { label: 'RECENT', game: recentGame },
            { label: 'MOST', game: mostPlayedGame },
            { label: 'SERP', game: surpriseGame },
          ].map((item) => {
            const g = item.game
            if (!g) return null
            return (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 34,
                    flexShrink: 0,
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 8.8,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: isDark ? 'rgba(230,244,255,0.42)' : 'rgba(18,26,44,0.44)',
                    fontWeight: 700,
                  }}
                >
                  {item.label}
                </span>
                {g.coverUrl ? (
                  <img
                    src={g.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      objectFit: 'cover',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}`,
                      flexShrink: 0,
                      background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.05)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      fontSize: 10,
                      color: secondaryColor,
                    }}
                  >
                    •
                  </div>
                )}
                <span
                  title={g.name}
                  style={{
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 11.8,
                    fontWeight: 500,
                    color: isDark ? 'rgba(232,245,255,0.84)' : 'rgba(18,26,44,0.80)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {g.name}
                </span>
              </div>
            )
          })}
          {!recentGame && !mostPlayedGame && !surpriseGame && (
            <div
              style={{
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                color: secondaryColor,
                opacity: 0.7,
                lineHeight: 1.4,
              }}
            >
              Populating — ROM scan fills rotation.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
