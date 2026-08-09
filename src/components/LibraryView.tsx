import GameBoxCarousel, { type CarouselGame } from './GameBoxCarousel'

/**
 * Golden Screen B — GAME LIBRARY — V8.2 Editorial Three-Zone
 *
 * Layout per master spec §6:
 * TOP    48px  ~5-6% minimal header
 * MAIN   flex1  LEFT 37% info  RIGHT 60-66% hardware stage
 * BOTTOM 22%   22-27% box-art rail overlapping slightly
 *
 * Media debounce preserved via App (does not re-resolve on selection change)
 */

export type LibraryGameDetail = {
  id: string
  name: string
  logoUrl?: string | null
  marqueeUrl?: string | null
  coverUrl?: string | null
  desc?: string | null
  description?: string | null
  developer?: string | null
  publisher?: string | null
  genre?: string | null
  players?: string | number | null
  rating?: number | string | null // 0-5 or 0-10 or 0-1
  releasedate?: string | null
  year?: string | number | null
  favorite?: boolean
  playcount?: number | string | null
  play_count?: number | string | null
  lastplayed?: string | null
  last_played?: string | null
  lastPlayedLabel?: string | null
  playTimeLabel?: string | null
}

export type LibraryViewProps = {
  systemId: string
  fullName: string
  theme: 'light' | 'dark'
  games: CarouselGame[]
  selectedId: string
  selectedGame?: LibraryGameDetail | null
  onSelect: (id: string) => void
  onLaunch: (game: LibraryGameDetail) => void
  onBack: () => void
  onToggleFavorite?: (id: string) => void
  onMedia?: (id: string) => void
  mediaResolving?: boolean
  logoUrl?: string | null
  stageNode?: React.ReactNode // RIGHT 60-66% hardware stage from SystemStage
  safeMode?: boolean
  onSafeModeBlocked?: () => void
}

function pickYear(g?: LibraryGameDetail | null): string | null {
  if (!g) return null
  if (g.year) return String(g.year)
  if (g.releasedate) {
    const d = String(g.releasedate)
    const m = d.match(/(\d{4})/)
    return m ? m[1] : null
  }
  return null
}

function ratingVisual(r?: number | string | null): { stars: number; label: string } | null {
  if (r == null) return null
  let n = typeof r === 'string' ? Number(r) : (r as number)
  if (isNaN(n)) return null
  // normalise: if 0-10 -> /2 to 5, if 0-1 -> *5
  if (n > 5 && n <= 10) n = n / 2
  else if (n <= 1 && n > 0) n = n * 5
  n = Math.max(0, Math.min(5, n))
  if (n <= 0) return null
  return { stars: n, label: `${n.toFixed(1)}/5` }
}

export function LibraryView({
  systemId,
  fullName,
  theme,
  games,
  selectedId,
  selectedGame,
  onSelect,
  onLaunch,
  onBack,
  onToggleFavorite,
  onMedia,
  mediaResolving,
  logoUrl,
  stageNode,
  safeMode,
  onSafeModeBlocked,
}: LibraryViewProps) {
  const isDark = theme === 'dark'
  const year = pickYear(selectedGame ?? null)
  const rating = ratingVisual((selectedGame as any)?.rating ?? null)

  const players = selectedGame?.players
  const genre = selectedGame?.genre
  const dev = selectedGame?.developer
  const pub = selectedGame?.publisher
  const descRaw = (selectedGame?.desc || selectedGame?.description) as string | null
  const desc = descRaw ? String(descRaw).slice(0, 640) : null
  const isLongDesc = descRaw ? String(descRaw).length > 520 : false

  const lastLabel = selectedGame?.lastPlayedLabel || (selectedGame?.last_played as string) || (selectedGame?.lastplayed as string) || null
  const playCount = (selectedGame?.play_count ?? selectedGame?.playcount ?? (selectedGame as any)?.playCount) as any

  const hasStats = !!(rating || players || lastLabel || (playCount != null && String(playCount).trim() !== ''))

  // players display "1P" / "2P" style – keep number as is, add P suffix if numeric
  const playersLabel = (() => {
    if (players == null || String(players).trim() === '') return null
    const s = String(players).trim()
    // if already includes P or "players" word, keep as is truncated
    if (/p/i.test(s) && s.length <= 4) return s.toUpperCase()
    if (/^\d+$/.test(s)) return `${s}P`
    return s
  })()

  return (
    <div
      className="golden-library"
      data-system-id={systemId}
      data-theme={theme}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 6,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {/* TOP minimal nav/header – 48px ~5-6% */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 0 16px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.05)'}`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          background: isDark ? 'rgba(6,9,14,0.24)' : 'rgba(250,252,255,0.52)',
        }}
      >
        <button
          onClick={onBack}
          data-action="back-to-system"
          style={{
            appearance: 'none',
            background: 'transparent',
            border: 'none',
            color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.72)',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fullName}</span>
          <span style={{ opacity: 0.5 }}>| MY LIBRARY</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ height: 18, width: 'auto', objectFit: 'contain', opacity: isDark ? 0.84 : 0.82, display: 'block' }}
            />
          )}
        </div>
      </div>

      {/* MAIN – flex split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* LEFT 34-40% – editorial info – soften seam, stronger blur to bleed parent bg */}
        <div
          style={{
            width: '37%',
            minWidth: '34%',
            maxWidth: '40%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '18px 20px 18px 20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: isDark
              ? 'linear-gradient(180deg, rgba(6,9,14,0.56) 0%, rgba(8,11,20,0.28) 68%, rgba(10,12,18,0.18) 100%)'
              : 'linear-gradient(180deg, rgba(250,252,255,0.88) 0%, rgba(244,247,255,0.54) 68%, rgba(240,244,255,0.28) 100%)',
            backdropFilter: 'blur(20px) saturate(1.06)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.06)',
            borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.042)' : 'rgba(18,26,44,0.048)'}`,
          }}
        >
          {selectedGame ? (
            <>
              {/* 1. LARGE GAME LOGO / MARQUEE – premium 420px cap */}
              {(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) ? (
                <img
                  src={(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) as string}
                  alt=""
                  style={{
                    width: '100%',
                    maxWidth: 420,
                    maxHeight: 110,
                    height: 'auto',
                    objectFit: 'contain',
                    objectPosition: 'left center',
                    marginBottom: 10,
                    display: 'block',
                    filter: isDark
                      ? 'drop-shadow(0 12px 28px rgba(0,0,0,0.56)) brightness(1.06)'
                      : 'drop-shadow(0 8px 20px rgba(18,26,44,0.16))',
                    imageRendering: 'auto',
                  }}
                />
              ) : null}

              {/* 2. TITLE – display 24 weight700 */}
              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 24,
                  fontWeight: 700,
                  color: isDark ? '#eef7ff' : '#16213e',
                  lineHeight: 1.12,
                  letterSpacing: '-0.025em',
                }}
              >
                {selectedGame.name}
              </h2>

              {/* 3. METADATA – row1: YEAR GENRE PLAYERS •, row2: DEV / PUB */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(year || genre || playersLabel) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 10.5,
                      color: isDark ? 'rgba(230,244,255,0.64)' : 'rgba(18,26,44,0.62)',
                    }}
                  >
                    {year && (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
                          lineHeight: 1,
                        }}
                      >
                        {year}
                      </span>
                    )}
                    {genre && <span>{genre}</span>}
                    {playersLabel && (
                      <span style={{ opacity: 0.92 }}>• {playersLabel}</span>
                    )}
                  </div>
                )}
                {(dev || pub) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      alignItems: 'center',
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 10.5,
                      color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.56)',
                    }}
                  >
                    {dev && <span>{dev}</span>}
                    {dev && pub && <span style={{ opacity: 0.5 }}>•</span>}
                    {pub && <span style={{ opacity: 0.82 }}>{pub}</span>}
                  </div>
                )}
              </div>

              {/* 4. DESCRIPTION – 14px comfortable reading */}
              {desc && (
                <div
                  style={{
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(22,33,62,0.76)',
                    whiteSpace: 'pre-wrap',
                    opacity: 0.92,
                    maxWidth: '100%',
                    ...(isLongDesc
                      ? {
                          WebkitMaskImage: 'linear-gradient(180deg, #000 72%, rgba(0,0,0,0) 100%)',
                          maskImage: 'linear-gradient(180deg, #000 72%, rgba(0,0,0,0) 100%)',
                        }
                      : {}),
                  }}
                >
                  {desc}
                </div>
              )}

              {/* 5. STATS – rating stars, players chip, last, playcount */}
              {hasStats && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 2, alignItems: 'center' }}>
                  {rating && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10 }}>
                      <span style={{ color: isDark ? '#7df9ff' : '#4a86ff', letterSpacing: '0.04em' }}>
                        {'★'.repeat(Math.round(rating.stars))}
                        <span style={{ opacity: 0.34 }}>{'★'.repeat(5 - Math.round(rating.stars)).replace(/★/g, '☆')}</span>
                        <span
                          style={{
                            marginLeft: 6,
                            opacity: 0.72,
                            color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.6)',
                          }}
                        >
                          {rating.label}
                        </span>
                      </span>
                    </div>
                  )}
                  {playersLabel && (
                    <span
                      style={{
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.05)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.07)'}`,
                        color: isDark ? 'rgba(230,244,255,0.66)' : 'rgba(18,26,44,0.6)',
                        lineHeight: 1,
                      }}
                    >
                      {playersLabel}
                    </span>
                  )}
                  {lastLabel && (
                    <span
                      style={{
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.58)',
                      }}
                    >
                      LAST {String(lastLabel).slice(0, 10)}
                    </span>
                  )}
                  {playCount != null && String(playCount).trim() !== '' && (
                    <span
                      style={{
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        color: isDark ? 'rgba(125,249,255,0.78)' : 'rgba(70,130,255,0.78)',
                      }}
                    >
                      ×{String(playCount)}
                    </span>
                  )}
                  {(selectedGame as any).playTimeLabel && (
                    <span
                      style={{
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        color: isDark ? 'rgba(230,244,255,0.5)' : 'rgba(18,26,44,0.5)',
                      }}
                    >
                      {(selectedGame as any).playTimeLabel}
                    </span>
                  )}
                </div>
              )}

              {/* 6. PLAY ACTION – strong primary pill */}
              <button
                onClick={() => {
                  if (safeMode) {
                    console.warn('[SAFE MODE] LibraryView PLAY blocked – frontend safe guard')
                    onSafeModeBlocked?.()
                    return
                  }
                  onLaunch(selectedGame)
                }}
                data-action="play"
                disabled={!!safeMode}
                title={safeMode ? 'SAFE MODE – launch blocked' : undefined}
                style={{
                  marginTop: 8,
                  appearance: 'none',
                  background: safeMode
                    ? isDark
                      ? 'linear-gradient(100deg, rgba(90,90,90,0.22), rgba(80,80,80,0.12))'
                      : 'linear-gradient(100deg, rgba(180,180,180,0.32), rgba(200,200,200,0.22))'
                    : isDark
                    ? 'linear-gradient(100deg, #7df9ff 0%, #8eeaff 60%, #a9f4ff 100%)'
                    : 'linear-gradient(100deg, #4a86ff 0%, #6a9cff 60%, #8ab4ff 100%)',
                  color: safeMode ? (isDark ? 'rgba(230,244,255,0.46)' : 'rgba(18,26,44,0.42)') : isDark ? '#041018' : '#fff',
                  border: 'none',
                  borderRadius: 999,
                  padding: '12px 18px',
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: safeMode ? 'not-allowed' : 'pointer',
                  opacity: safeMode ? 0.64 : 1,
                  boxShadow: safeMode
                    ? 'none'
                    : isDark
                    ? '0 10px 26px rgba(125,249,255,0.28), 0 0 0 1px rgba(125,249,255,0.22) inset'
                    : '0 10px 24px rgba(70,130,255,0.24), inset 0 1px 0 rgba(255,255,255,0.8)',
                  transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), opacity 180ms ease',
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: isDark ? 'rgba(4,16,24,0.14)' : 'rgba(255,255,255,0.22)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  A
                </span>
                <span>{safeMode ? 'SAFE MODE – launch blocked' : 'PLAY'}</span>
              </button>

              {/* 7. Secondary [X] MEDIA [Y] FAVORITE – small pills, not cluttered */}
              {(onMedia || onToggleFavorite) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  {onMedia && (
                    <button
                      onClick={() => onMedia(selectedGame.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`,
                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.64)',
                        color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.68)',
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      X MEDIA
                    </button>
                  )}
                  {onToggleFavorite && (
                    <button
                      onClick={() => onToggleFavorite(selectedGame.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: `1px solid ${
                          isDark
                            ? selectedGame.favorite
                              ? 'rgba(255,210,90,0.32)'
                              : 'rgba(255,255,255,0.10)'
                            : selectedGame.favorite
                            ? 'rgba(255,180,0,0.28)'
                            : 'rgba(18,26,44,0.10)'
                        }`,
                        background: selectedGame.favorite
                          ? isDark
                            ? 'rgba(255,210,90,0.12)'
                            : 'rgba(255,200,60,0.16)'
                          : isDark
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(255,255,255,0.64)',
                        color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.72)',
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      Y {selectedGame.favorite ? '★ FAVORITED' : 'FAVORITE'}
                    </button>
                  )}
                </div>
              )}

              {/* 8. Media resolving indicator */}
              {mediaResolving && (
                <div
                  style={{
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10,
                    opacity: 0.6,
                    color: isDark ? 'rgba(230,244,255,0.6)' : 'rgba(18,26,44,0.56)',
                  }}
                >
                  Resolving real media…
                </div>
              )}
            </>
          ) : (
            /* NULL case – only when no games exist – App auto-selects first when games exist so this stays hidden */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
              <div
                style={{
                  width: 56,
                  height: 78,
                  borderRadius: 10,
                  background: isDark
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))'
                    : 'linear-gradient(180deg, rgba(18,26,44,0.06), rgba(18,26,44,0.03))',
                  border: `1px dashed ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.10)'}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  opacity: 0.6,
                }}
              >
                ◐
              </div>
              <div
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.72)',
                }}
              >
                Populating library…
              </div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.56, lineHeight: 1.5, maxWidth: 260 }}>
                Fixture or ROM cache will fill this instantly in real run. Carousel below will auto-select first game when ready.
              </div>
            </div>
          )}
        </div>

        {/* RIGHT 60-66% hardware stage – gameplay inside calibrated display via stageNode */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: isDark ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
          }}
        >
          {stageNode || (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                opacity: 0.45,
              }}
            >
              hardware stage
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM 20-25% box carousel – 22% height, slight overlap for depth */}
      <div
        style={{
          height: '22%',
          minHeight: 148,
          maxHeight: 196,
          marginTop: -6,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,11,20,0.72), rgba(6,9,14,0.84))'
            : 'linear-gradient(180deg, rgba(250,252,255,0.92), rgba(244,247,255,0.88))',
          backdropFilter: 'blur(16px) saturate(1.04)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.04)',
          display: 'flex',
          alignItems: 'flex-end',
          paddingBottom: 6,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <GameBoxCarousel
          games={games}
          selectedId={selectedId}
          onSelect={onSelect}
          onLaunch={id => {
            const g = games.find(x => x.id === id)
            if (g && selectedGame) onLaunch(selectedGame)
            else if (g) {
              const found = selectedGame && selectedGame.id === id ? selectedGame : null
              if (found) onLaunch(found)
            }
          }}
          theme={theme}
          wrap
        />
      </div>
    </div>
  )
}

export default LibraryView
