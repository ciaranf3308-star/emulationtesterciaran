import GameBoxCarousel, { type CarouselGame } from './GameBoxCarousel'

/**
 * Golden Screen B — GAME LIBRARY
 *
 * Layout:
 * TOP minimal nav/header
 * LEFT 34-40% game info
 * RIGHT 60-66% game/hardware/media stage (children slot)
 * BOTTOM 20-25% horizontal box-art carousel
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
}: LibraryViewProps) {
  const isDark = theme === 'dark'
  const year = pickYear(selectedGame ?? null)
  const rating = ratingVisual((selectedGame as any)?.rating ?? null)

  const players = selectedGame?.players
  const genre = selectedGame?.genre
  const dev = selectedGame?.developer
  const pub = selectedGame?.publisher
  const desc = (selectedGame?.desc || selectedGame?.description) as string | null

  const lastLabel = selectedGame?.lastPlayedLabel || (selectedGame?.last_played as string) || (selectedGame?.lastplayed as string) || null
  const playCount = (selectedGame?.play_count ?? selectedGame?.playcount ?? (selectedGame as any)?.playCount) as any

  const hasStats = !!(rating || players || lastLabel || playCount != null)

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
      {/* TOP minimal header */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 0 16px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
          backdropFilter: 'blur(14px)',
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
          <span style={{ fontSize: 14 }}>←</span> <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fullName}</span> <span style={{ opacity: 0.5 }}>| MY LIBRARY</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ height: 18, width: 'auto', objectFit: 'contain', opacity: isDark ? 0.84 : 0.82 }} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* LEFT 34-40% game info */}
        <div
          style={{
            width: '37%',
            minWidth: '34%',
            maxWidth: '40%',
            height: '100%',
            overflowY: 'auto',
            padding: '18px 20px 18px 20px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: isDark
              ? 'linear-gradient(180deg, rgba(6,9,14,0.56), rgba(8,11,20,0.32) 60%, rgba(10,12,18,0.18))'
              : 'linear-gradient(180deg, rgba(250,252,255,0.88), rgba(244,247,255,0.56) 60%, rgba(240,244,255,0.28))',
            backdropFilter: 'blur(16px) saturate(1.03)',
            borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)'}`,
          }}
        >
          {selectedGame ? (
            <>
              {/* GAME LOGO / MARQUEE */}
              {(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) ? (
                <img
                  src={(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) as string}
                  alt=""
                  style={{ maxWidth: '80%', maxHeight: 74, width: 'auto', height: 'auto', objectFit: 'contain', marginBottom: 4, filter: isDark ? 'drop-shadow(0 6px 18px rgba(0,0,0,0.5))' : 'drop-shadow(0 4px 12px rgba(18,26,44,0.12))' }}
                />
              ) : null}

              {/* TITLE */}
              <h2 style={{ margin: 0, fontFamily: 'var(--crystal-display)', fontSize: 22, fontWeight: 600, color: isDark ? '#eef7ff' : '#16213e', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                {selectedGame.name}
              </h2>

              {/* YEAR / GENRE / DEV / PUB line – collapse if missing */}
              {(year || genre || dev || pub) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 10.5, color: isDark ? 'rgba(230,244,255,0.64)' : 'rgba(18,26,44,0.62)' }}>
                  {year && <span style={{ padding: '3px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}` }}>{year}</span>}
                  {genre && <span>{genre}</span>}
                  {dev && <span>• {dev}</span>}
                  {pub && <span style={{ opacity: 0.82 }}>• {pub}</span>}
                </div>
              )}

              {/* DESCRIPTION – collapse if absent */}
              {desc && (
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, lineHeight: 1.6, color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(18,26,44,0.76)', whiteSpace: 'pre-wrap', opacity: 0.92 }}>
                  {String(desc).slice(0, 640)}
                </div>
              )}

              {/* compact stats – only if any real metadata exists */}
              {hasStats && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
                  {rating && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10 }}>
                      <span style={{ color: isDark ? '#7df9ff' : '#4a86ff', letterSpacing: '0.04em' }}>
                        {'★'.repeat(Math.round(rating.stars))}{'☆'.repeat(5 - Math.round(rating.stars))} <span style={{ opacity: 0.72, color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.6)' }}>{rating.label}</span>
                      </span>
                    </div>
                  )}
                  {players && (
                    <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.05)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`, color: isDark ? 'rgba(230,244,255,0.66)' : 'rgba(18,26,44,0.6)' }}>
                      {players}P
                    </span>
                  )}
                  {lastLabel && (
                    <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.58)' }}>LAST {String(lastLabel).slice(0, 10)}</span>
                  )}
                  {playCount != null && String(playCount).trim() !== '' && (
                    <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, color: isDark ? 'rgba(125,249,255,0.78)' : 'rgba(70,130,255,0.78)' }}>×{String(playCount)}</span>
                  )}
                </div>
              )}

              {/* Primary A PLAY */}
              <button
                onClick={() => onLaunch(selectedGame)}
                data-action="play"
                style={{
                  marginTop: 8,
                  appearance: 'none',
                  background: isDark
                    ? 'linear-gradient(100deg, #7df9ff 0%, #8eeaff 60%, #a9f4ff 100%)'
                    : 'linear-gradient(100deg, #4a86ff 0%, #6a9cff 60%, #8ab4ff 100%)',
                  color: isDark ? '#041018' : '#fff',
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
                  cursor: 'pointer',
                  boxShadow: isDark ? '0 10px 26px rgba(125,249,255,0.28), 0 0 0 1px rgba(125,249,255,0.22) inset' : '0 10px 24px rgba(70,130,255,0.24), inset 0 1px 0 rgba(255,255,255,0.8)',
                  transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: isDark ? 'rgba(4,16,24,0.16)' : 'rgba(255,255,255,0.22)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>A</span>
                <span>PLAY</span>
              </button>

              {(onMedia || onToggleFavorite) && (
                <div style={{ display: 'flex', gap: 8 }}>
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
                        border: `1px solid ${isDark ? (selectedGame.favorite ? 'rgba(255,210,90,0.32)' : 'rgba(255,255,255,0.10)') : (selectedGame.favorite ? 'rgba(255,180,0,0.28)' : 'rgba(18,26,44,0.10)')}`,
                        background: selectedGame.favorite ? (isDark ? 'rgba(255,210,90,0.12)' : 'rgba(255,200,60,0.16)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.64)',
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

              {mediaResolving && (
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, color: isDark ? 'rgba(230,244,255,0.6)' : 'rgba(18,26,44,0.56)' }}>Resolving real media…</div>
              )}
            </>
          ) : (
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.6, color: isDark ? 'rgba(230,244,255,0.6)' : 'rgba(18,26,44,0.56)' }}>Select a game</div>
          )}
        </div>

        {/* RIGHT 60-66% stage */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: isDark ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)',
          }}
        >
          {stageNode || (
            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.5 }}>hardware stage</div>
          )}
        </div>
      </div>

      {/* BOTTOM 20-25% box carousel */}
      <div
        style={{
          height: '22%',
          minHeight: 148,
          maxHeight: 196,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,11,20,0.72), rgba(6,9,14,0.84))'
            : 'linear-gradient(180deg, rgba(250,252,255,0.92), rgba(244,247,255,0.88))',
          backdropFilter: 'blur(16px) saturate(1.04)',
          display: 'flex',
          alignItems: 'flex-end',
          paddingBottom: 6,
        }}
      >
        <GameBoxCarousel games={games} selectedId={selectedId} onSelect={onSelect} onLaunch={id => {
          const g = games.find(x => x.id === id)
          if (g && selectedGame) onLaunch(selectedGame)
          else if (g) {
            // fallback lookup for game detail? parent ensures selectedGame syncs to selectedId
            const found = selectedGame && selectedGame.id === id ? selectedGame : null
            if (found) onLaunch(found)
          }
        }} theme={theme} wrap />
      </div>
    </div>
  )
}

export default LibraryView
