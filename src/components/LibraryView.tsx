import GameBoxCarousel, { type CarouselGame } from './GameBoxCarousel'

/**
 * Golden Screen B — GAME LIBRARY — V8.3 Crystal Editorial Premium
 *
 * V8.3 pass:
 * - Unified atmospheric Crystal background (SystemStage) — no vertical seam, no navy bar
 * - LEFT 34-40% editorial rich, softly scrimmed → transparent fade on right edge
 *  - RIGHT 60-66% hardware stage transparent – stageNode preserved (SystemStage.showroom)
 * - BOTTOM 22% carousel slight overlap, blur 16px, gradient veil not opaque footer
 *
 * Required per-game: title, genre, year, dev/pub, rating, players, lastplayed,
 * playtime/playcount, favorite, description, box art, gameplay video/screenshot via stage,
 * physical media prop via stage physicalUrl layer (GBC cart / PS2 disc / GC disc real mode)
 *
 * Media hierarchy: video > screenshot > title > mix > cover > powered-off glass
 *                handled in SystemStage; LibraryView never hides physical layer.
 * L/R immediate cover/logo/title/meta then 130ms debounce gameplay/physical → App.tsx
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
  stageNode?: React.ReactNode // RIGHT 60-66% hardware stage from SystemStage (null in real flow — we are chrome of SystemStage)
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
  const desc = descRaw ? String(descRaw).slice(0, 720) : null
  const isLongDesc = descRaw ? String(descRaw).length > 540 : false

  const lastLabel = selectedGame?.lastPlayedLabel || (selectedGame?.last_played as string) || (selectedGame?.lastplayed as string) || null
  const playCount = (selectedGame?.play_count ?? selectedGame?.playcount ?? (selectedGame as any)?.playCount) as any
  const playTime = (selectedGame as any)?.playTimeLabel as string | null | undefined

  const hasStats = !!(rating || players || lastLabel || playTime || (playCount != null && String(playCount).trim() !== ''))

  const playersLabel = (() => {
    if (players == null || String(players).trim() === '') return null
    const s = String(players).trim()
    if (/\b\d+p\b/i.test(s) || /^\d+p$/i.test(s)) return s.toUpperCase()
    if (/^\d+$/.test(s)) return `${s}P`
    // shorten verbose "1-2 Players" -> "1-2P"
    if (/players/i.test(s)) {
      const m = s.match(/(\d(?:-\d)?)/)
      if (m) return `${m[1]}P`
      return s.slice(0, 12)
    }
    return s.length > 12 ? s.slice(0, 12) : s
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
      {/* TOP 48px minimal header — premium, no full toolbar */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px 0 18px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.055)'}`,
          backdropFilter: 'blur(20px) saturate(1.18)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.18)',
          background: isDark ? 'rgba(6,9,14,0.14)' : 'rgba(250,252,255,0.38)',
          position: 'relative',
        }}
      >
        {/* left↔right gradient veil to avoid hard edge with unified bg */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'linear-gradient(90deg, rgba(125,249,255,0.06) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0) 100%)'
              : 'linear-gradient(90deg, rgba(70,130,255,0.06) 0%, transparent 28%, transparent 100%)',
            pointerEvents: 'none',
            opacity: isDark ? 0.5 : 0.42,
          }}
        />
        <button
          onClick={onBack}
          data-action="back-to-system"
          style={{
            appearance: 'none',
            background: 'transparent',
            border: 'none',
            color: isDark ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.78)',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            letterSpacing: '0.04em',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.11)' : 'rgba(18,26,44,0.10)'}`,
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
              fontSize: 12,
              lineHeight: 1,
              boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.28)' : '0 2px 10px rgba(18,26,44,0.07)',
            }}
          >
            ←
          </span>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fullName}</span>
          <span style={{ opacity: 0.42, fontWeight: 500 }}>| MY LIBRARY</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ height: 20, width: 'auto', maxWidth: 96, objectFit: 'contain', opacity: isDark ? 0.88 : 0.86, display: 'block', filter: isDark ? 'brightness(1.06)' : 'none' }}
            />
          )}
        </div>
      </div>

      {/* MAIN — LEFT editorial + RIGHT transparent hardware stage */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* LEFT 34-40% editorial — softly scrimmed, fades to transparent, no vertical wall */}
        <div
          style={{
            width: '37%',
            minWidth: '34%',
            maxWidth: '40%',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '22px 22px 20px 22px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            // Unified atmospheric: gradient that bleeds to transparent on the right edge
            background: isDark
              ? 'linear-gradient(90deg, rgba(6,9,14,0.62) 0%, rgba(8,11,20,0.40) 48%, rgba(10,12,18,0.16) 78%, rgba(10,12,18,0.04) 90%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(250,252,255,0.86) 0%, rgba(244,247,255,0.58) 52%, rgba(240,244,255,0.24) 80%, rgba(240,244,255,0.06) 92%, transparent 100%)',
            // subtle vignette depth without hard edge
            backdropFilter: 'blur(22px) saturate(1.08)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.08)',
            borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.038)' : 'rgba(18,26,44,0.042)'}`,
            position: 'relative',
          }}
        >
          {/* local contrast shaping veil */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark
                ? 'radial-gradient(ellipse 86% 58% at 12% 8%, rgba(125,249,255,0.08), transparent 60%), radial-gradient(ellipse 72% 52% at 42% 86%, rgba(20,30,48,0.42), transparent 70%)'
                : 'radial-gradient(ellipse 84% 56% at 10% 6%, rgba(70,130,255,0.09), transparent 62%), radial-gradient(ellipse 70% 48% at 44% 88%, rgba(220,234,255,0.7), transparent 66%)',
              pointerEvents: 'none',
              opacity: isDark ? 0.9 : 0.9,
            }}
          />

          {selectedGame ? (
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%' }}>
              {/* LOGO / MARQUEE — 380-460 maxW, 110-120 maxH, left, drop-shadow brightness 1.06 */}
              {(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) ? (
                <img
                  src={(selectedGame.logoUrl || (selectedGame as any).marqueeUrl) as string}
                  alt=""
                  style={{
                    width: '100%',
                    maxWidth: 440,
                    maxHeight: 118,
                    minHeight: 28,
                    height: 'auto',
                    objectFit: 'contain',
                    objectPosition: 'left center',
                    display: 'block',
                    filter: isDark
                      ? 'drop-shadow(0 14px 32px rgba(0,0,0,0.58)) drop-shadow(0 2px 8px rgba(0,0,0,0.36)) brightness(1.06)'
                      : 'drop-shadow(0 10px 26px rgba(18,26,44,0.18)) drop-shadow(0 2px 6px rgba(18,26,44,0.10)) brightness(1.02)',
                    imageRendering: 'auto',
                    marginBottom: 2,
                  }}
                />
              ) : null}

              {/* TITLE — 22-26 weight 700-800 letter -0.025em #eef7ff / #16213e */}
              <h2
                style={{
                  margin: '0 0 2px 0',
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 25,
                  fontWeight: 780,
                  color: isDark ? '#eef7ff' : '#16213e',
                  lineHeight: 1.08,
                  letterSpacing: '-0.025em',
                  textShadow: isDark ? '0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.48)' : '0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                {selectedGame.name}
              </h2>

              {/* META ROW — YEAR pill + GENRE + PLAYERS bullet */}
              {(year || genre || playersLabel) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 9,
                    alignItems: 'center',
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10.5,
                    color: isDark ? 'rgba(230,244,255,0.68)' : 'rgba(18,26,44,0.65)',
                    marginTop: -2,
                  }}
                >
                  {year && (
                    <span
                      style={{
                        padding: '4px 9px',
                        borderRadius: 999,
                        background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.06)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(18,26,44,0.08)'}`,
                        lineHeight: 1,
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.9)',
                      }}
                    >
                      {year}
                    </span>
                  )}
                  {genre && <span style={{ letterSpacing: '0.02em' }}>{genre}</span>}
                  {playersLabel && (
                    <span style={{ opacity: 0.90, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <span aria-hidden style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: isDark ? 'rgba(230,244,255,0.36)' : 'rgba(18,26,44,0.28)', display: 'inline-block' }} /> {playersLabel}
                    </span>
                  )}
                </div>
              )}

              {/* DEV • PUB — 10.5 mono 0.58 opacity */}
              {(dev || pub) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 7,
                    alignItems: 'center',
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10.5,
                    color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.58)',
                    opacity: 0.95,
                    letterSpacing: '0.015em',
                  }}
                >
                  {dev && <span>{dev}</span>}
                  {dev && pub && <span style={{ opacity: 0.46 }}>•</span>}
                  {pub && <span style={{ opacity: 0.84 }}>{pub}</span>}
                </div>
              )}

              {/* Thin divider */}
              <div
                aria-hidden
                style={{
                  height: 1,
                  background: isDark
                    ? 'linear-gradient(90deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03) 42%, transparent 90%)'
                    : 'linear-gradient(90deg, rgba(18,26,44,0.08), rgba(18,26,44,0.03) 46%, transparent 92%)',
                  margin: '4px 0 2px',
                }}
              />

              {/* DESC — 16-18px lh 1.45-1.6 clamped 6-8 lines, fade mask */}
              {desc && (
                <div
                  style={{
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 16,
                    lineHeight: 1.52,
                    color: isDark ? 'rgba(230,244,255,0.82)' : 'rgba(22,33,62,0.82)',
                    whiteSpace: 'pre-wrap',
                    opacity: 0.96,
                    maxWidth: '100%',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical' as any,
                    WebkitLineClamp: 7,
                    overflow: 'hidden',
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

              {/* STATS — typography dividers, not boxes — stars, players, last, plays/time */}
              {hasStats && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0,
                    alignItems: 'center',
                    marginTop: 6,
                    borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                    paddingTop: 12,
                    fontFamily: 'var(--crystal-mono)',
                  }}
                >
                  {rating && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 14, borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.07)'}`, marginRight: 14 }}>
                      <span style={{ color: isDark ? '#7df9ff' : '#4a86ff', letterSpacing: '0.08em', fontSize: 11, lineHeight: 1 }}>
                        {'★'.repeat(Math.round(rating.stars))}
                        <span style={{ opacity: 0.28 }}>{'★'.repeat(5 - Math.round(rating.stars)).replace(/★/g, '☆')}</span>
                      </span>
                      <span style={{ fontSize: 10.5, color: isDark ? 'rgba(230,244,255,0.66)' : 'rgba(18,26,44,0.60)' }}>{rating.label}</span>
                    </div>
                  )}
                  {playersLabel && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: isDark ? 'rgba(230,244,255,0.64)' : 'rgba(18,26,44,0.6)',
                        paddingRight: 12,
                        marginRight: 12,
                        borderRight: hasStats && (lastLabel || playCount || playTime) ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}` : 'none',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {playersLabel}
                    </span>
                  )}
                  {lastLabel && (
                    <span
                      title={String(lastLabel)}
                      style={{
                        fontSize: 10.5,
                        color: isDark ? 'rgba(230,244,255,0.60)' : 'rgba(18,26,44,0.56)',
                        paddingRight: 10,
                      }}
                    >
                      {String(lastLabel).slice(0, 10)}
                    </span>
                  )}
                  {playCount != null && String(playCount).trim() !== '' && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: isDark ? 'rgba(125,249,255,0.78)' : 'rgba(70,130,255,0.78)',
                        marginLeft: lastLabel ? 2 : 0,
                        fontWeight: 600,
                      }}
                    >
                      ×{String(playCount)}
                    </span>
                  )}
                  {playTime && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: isDark ? 'rgba(230,244,255,0.52)' : 'rgba(18,26,44,0.52)',
                        marginLeft: 10,
                      }}
                    >
                      {playTime}
                    </span>
                  )}
                </div>
              )}

              {/* ACTIONS — strong PLAY + secondary [X] MEDIA [Y] FAVORITE pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
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
                    appearance: 'none',
                    width: 'fit-content',
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
                    padding: '13px 20px 13px 13px',
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
                      ? '0 10px 26px rgba(125,249,255,0.28), 0 0 0 1px rgba(125,249,255,0.22) inset, 0 1px 0 rgba(255,255,255,0.42) inset'
                      : '0 10px 24px rgba(70,130,255,0.24), 0 0 0 1px rgba(90,140,255,0.10) inset, inset 0 1px 0 rgba(255,255,255,0.88)',
                    transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), opacity 180ms ease, box-shadow 220ms ease',
                    transform: 'translateZ(0)',
                  }}
                  onMouseEnter={e => {
                    if (!safeMode) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px) translateZ(0)'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) translateZ(0)'
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: isDark ? 'rgba(4,16,24,0.16)' : 'rgba(255,255,255,0.26)',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: 12,
                      boxShadow: isDark ? '0 0 0 1px rgba(4,16,24,0.08) inset' : '0 0 0 1px rgba(255,255,255,0.22) inset',
                      flexShrink: 0,
                    }}
                  >
                    A
                  </span>
                  <span>{safeMode ? 'SAFE MODE' : 'PLAY'}</span>
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: safeMode ? 'transparent' : isDark ? 'rgba(4,16,24,0.62)' : 'rgba(255,255,255,0.92)',
                      boxShadow: safeMode ? 'none' : isDark ? '0 0 8px rgba(4,16,24,0.42)' : '0 0 10px rgba(255,255,255,0.9)',
                      marginLeft: 2,
                      opacity: 0.9,
                    }}
                  />
                </button>

                {(onMedia || onToggleFavorite) && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {onMedia && (
                      <button
                        onClick={() => onMedia(selectedGame.id)}
                        style={{
                          padding: '7px 13px',
                          borderRadius: 999,
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.11)' : 'rgba(18,26,44,0.10)'}`,
                          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          color: isDark ? 'rgba(230,244,255,0.76)' : 'rgba(18,26,44,0.68)',
                          fontFamily: 'var(--crystal-mono)',
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ opacity: 0.72, fontWeight: 800 }}>X</span> MEDIA
                      </button>
                    )}
                    {onToggleFavorite && (
                      <button
                        onClick={() => onToggleFavorite(selectedGame.id)}
                        style={{
                          padding: '7px 13px',
                          borderRadius: 999,
                          border: `1px solid ${
                            selectedGame.favorite
                              ? isDark
                                ? 'rgba(255,214,90,0.32)'
                                : 'rgba(255,180,0,0.32)'
                              : isDark
                              ? 'rgba(255,255,255,0.10)'
                              : 'rgba(18,26,44,0.10)'
                          }`,
                          background: selectedGame.favorite
                            ? isDark
                              ? 'rgba(255,214,90,0.14)'
                              : 'rgba(255,200,60,0.18)'
                            : isDark
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(255,255,255,0.66)',
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          color: isDark ? 'rgba(230,244,255,0.84)' : 'rgba(18,26,44,0.76)',
                          fontFamily: 'var(--crystal-mono)',
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: selectedGame.favorite ? (isDark ? '0 0 14px rgba(255,214,90,0.18)' : '0 0 12px rgba(255,190,30,0.16)') : 'none',
                        }}
                      >
                        <span style={{ opacity: selectedGame.favorite ? 1 : 0.62, color: selectedGame.favorite ? (isDark ? '#ffd85a' : '#b77900') : undefined }}>Y</span> {selectedGame.favorite ? '★ FAVORITED' : 'FAVORITE'}
                      </button>
                    )}
                  </div>
                )}

                {mediaResolving && (
                  <div
                    style={{
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 10.5,
                      opacity: 0.62,
                      color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.58)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 2,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        border: `1.5px solid ${isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.42)'}`,
                        borderTopColor: 'transparent',
                        display: 'inline-block',
                        animation: 'crystal-spin 0.9s linear infinite',
                      }}
                    />
                    Resolving real media…
                  </div>
                )}
              </div>

              {/* spacer so editorial never collides with carousel */}
              <div style={{ flex: 1, minHeight: 12 }} />
            </div>
          ) : (
            /* NULL case — only when no games exist; App auto-selects first otherwise so real lib never shows this */
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
              <div
                style={{
                  width: 62,
                  height: 84,
                  borderRadius: 12,
                  background: isDark
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
                    : 'linear-gradient(180deg, rgba(18,26,44,0.07), rgba(18,26,44,0.03))',
                  border: `1px dashed ${isDark ? 'rgba(255,255,255,0.13)' : 'rgba(18,26,44,0.11)'}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  opacity: 0.62,
                  boxShadow: isDark ? '0 8px 22px rgba(0,0,0,0.26)' : '0 8px 22px rgba(18,26,44,0.08)',
                }}
              >
                ◐
              </div>
              <div
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 15,
                  fontWeight: 650,
                  color: isDark ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.80)',
                  letterSpacing: '-0.01em',
                }}
              >
                Populating library…
              </div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.58, lineHeight: 1.55, maxWidth: 280 }}>
                Fixture or ROM cache will fill this instantly in real run. Carousel below will auto-select first game when ready.
              </div>
            </div>
          )}
        </div>

        {/* RIGHT 60-66% — transparent so unified blurred Crystal from SystemStage shows one atmospheric */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'transparent',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            // soft vignette shaping behind stage, no wall
            boxShadow: isDark ? 'inset 48px 0 92px rgba(0,0,0,0.18), inset -32px 0 72px rgba(0,0,0,0.08)' : 'inset 54px 0 84px rgba(250,252,255,0.46), inset -28px 0 62px rgba(240,244,255,0.22)',
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
                opacity: 0.36,
                color: isDark ? '#eef7ff' : '#16213e',
              }}
            >
              {/* stageNode is intentionally null here — hardware stage lives in parent SystemStage showroom wrapper.
                  Physical cart/disc/box is in SystemStage.physicalUrl layer, not hidden. Video > screenshot > title priority preserved there. */}
            </div>
          )}
        </div>

        {/* Inline keyframes helper */}
        <style>{`
          @keyframes crystal-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* BOTTOM 22% carousel — premium: NOT navy bar, glass gradient veil, 16px blur, slight overlap */}
      <div
        style={{
          height: '22%',
          minHeight: 148,
          maxHeight: 196,
          marginTop: -6,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.055)'}`,
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,11,20,0.36), rgba(6,9,14,0.72))'
            : 'linear-gradient(180deg, rgba(250,252,255,0.66), rgba(244,247,255,0.82))',
          backdropFilter: 'blur(16px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.05)',
          display: 'flex',
          alignItems: 'flex-end',
          paddingBottom: 6,
          position: 'relative',
          zIndex: 2,
          overflow: 'visible',
        }}
      >
        {/* top soft edge — blends hardware stage into rail, no hard line */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -18,
            height: 18,
            background: isDark
              ? 'linear-gradient(180deg, transparent, rgba(6,9,14,0.22))'
              : 'linear-gradient(180deg, transparent, rgba(250,252,255,0.42))',
            pointerEvents: 'none',
            opacity: 0.9,
          }}
        />
        <GameBoxCarousel
          games={games}
          selectedId={selectedId}
          onSelect={onSelect}
          onLaunch={id => {
            // keep controller flow: if selected pressed PLAY, else select
            const g = games.find(x => x.id === id)
            if (!g) return
            if (id === selectedId && selectedGame) onLaunch(selectedGame)
            else if (selectedGame && selectedGame.id === id) onLaunch(selectedGame)
            else onSelect(id)
          }}
          theme={theme}
          wrap
        />
      </div>
    </div>
  )
}

export default LibraryView
