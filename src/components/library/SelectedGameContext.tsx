import type { LibraryGameDetail } from '../LibraryView'

type SelectedCtxProps = {
  theme: 'light' | 'dark'
  game: LibraryGameDetail | null | undefined
  mediaResolving?: boolean
  onLaunch: (game: LibraryGameDetail) => void
  onToggleFavorite?: (id: string) => void
  onMedia?: (id: string) => void
  onDiscover?: (id: string) => void
  safeMode?: boolean
  onSafeModeBlocked?: () => void
}

function pickYear(g?: LibraryGameDetail | null): string | null {
  if (!g) return null
  if (g.year) return String(g.year)
  if (g.releasedate) {
    const m = String(g.releasedate).match(/(\d{4})/)
    return m ? m[1] : null
  }
  return null
}

function ratingVisual(r?: number | string | null) {
  if (r == null) return null
  let n = typeof r === 'string' ? Number(r) : (r as number)
  if (isNaN(n)) return null
  if (n > 5 && n <= 10) n = n / 2
  else if (n <= 1 && n > 0) n = n * 5
  n = Math.max(0, Math.min(5, n))
  if (n <= 0) return null
  return { stars: n, label: `${n.toFixed(1)}/5` }
}

function playersShort(players: string | number | null | undefined): string | null {
  if (players == null || String(players).trim() === '') return null
  const s = String(players).trim()
  if (/\b\d+p\b/i.test(s) || /^\d+p$/i.test(s)) return s.toUpperCase()
  if (/^\d+$/.test(s)) return `${s}P`
  if (/players/i.test(s)) {
    const m = s.match(/(\d(?:-\d)?)/)
    if (m) return `${m[1]}P`
    return s.slice(0, 12)
  }
  return s.length > 12 ? s.slice(0, 12) : s
}

export function SelectedGameContext({
  theme,
  game,
  mediaResolving,
  onLaunch,
  onToggleFavorite,
  onMedia,
  onDiscover,
  safeMode,
  onSafeModeBlocked,
}: SelectedCtxProps) {
  const isDark = theme === 'dark'
  if (!game) return null

  const year = pickYear(game)
  const rating = ratingVisual((game as any).rating ?? null)
  const playersLabel = playersShort(game.players as any)
  const genre = game.genre
  const descRaw = (game.desc || game.description) as string | null
  const desc = descRaw ? String(descRaw).slice(0, 360) : null
  const lastLabel = game.lastPlayedLabel || (game.last_played as string) || (game.lastplayed as string) || null
  const playCount = (game.play_count ?? game.playcount ?? (game as any).playCount) as any
  const playTime = (game as any).playTimeLabel as string | null | undefined

  return (
    <div
      style={{
        width: 'min(100%, 500px)',
        maxWidth: '100%',
        background: isDark
          ? 'linear-gradient(145deg, rgba(8,14,24,0.78) 0%, rgba(8,12,20,0.62) 100%)'
          : 'linear-gradient(145deg, rgba(250,252,255,0.90) 0%, rgba(239,244,252,0.76) 100%)',
        backdropFilter: 'blur(18px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.08)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}`,
        borderRadius: 16,
        padding: '14px 14px 12px 14px',
        boxShadow: isDark
          ? '0 14px 32px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.03) inset'
          : '0 12px 28px rgba(18,26,44,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'auto',
      }}
    >
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--crystal-display)',
            fontSize: 17,
            fontWeight: 760,
            lineHeight: 1.14,
            letterSpacing: '-0.02em',
            color: isDark ? '#eef7ff' : '#142040',
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {game.name}
        </h2>
        {rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ color: isDark ? '#7df9ff' : '#4a86ff', fontSize: 11, letterSpacing: '0.04em' }}>
              {'★'.repeat(Math.round(rating.stars))}
            </span>
            <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, color: isDark ? 'rgba(230,244,255,0.62)' : 'rgba(18,26,44,0.56)' }}>{rating.label}</span>
          </div>
        )}
      </div>

      {/* meta line */}
      {(year || genre || playersLabel) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 10.5, color: isDark ? 'rgba(230,244,255,0.68)' : 'rgba(18,26,44,0.64)' }}>
          {year && <span style={{ padding: '3px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}` }}>{year}</span>}
          {genre && <span style={{ opacity: 0.9 }}>{genre}</span>}
          {playersLabel && <span style={{ opacity: 0.86, display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 2.5, height: 2.5, borderRadius: '50%', background: isDark ? 'rgba(230,244,255,0.36)' : 'rgba(18,26,44,0.28)', display: 'inline-block' }} />{playersLabel}</span>}
        </div>
      )}

      {/* desc 3 lines */}
      {desc && (
        <div
          style={{
            fontFamily: 'var(--crystal-display)',
            fontSize: 13.5,
            lineHeight: 1.46,
            color: isDark ? 'rgba(230,244,255,0.78)' : 'rgba(22,33,62,0.78)',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical' as any,
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }}
        >
          {desc}
        </div>
      )}

      {/* small stats line */}
      {(lastLabel || playCount != null || playTime) && (
        <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--crystal-mono)', fontSize: 10.5, color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.54)' }}>
          {lastLabel && <span>{String(lastLabel).slice(0, 10)}</span>}
          {playCount != null && String(playCount).trim() !== '' && <span style={{ color: isDark ? 'rgba(125,249,255,0.76)' : 'rgba(70,130,255,0.76)', fontWeight: 600 }}>×{String(playCount)}</span>}
          {playTime && <span>{playTime}</span>}
        </div>
      )}

      {/* actions – CTA hierarchy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        <button
          onClick={() => {
            if (safeMode) {
              onSafeModeBlocked?.()
              return
            }
            onLaunch(game)
          }}
          data-action="play"
          disabled={!!safeMode}
          title={safeMode ? 'SAFE MODE – launch blocked' : undefined}
          style={{
            appearance: 'none',
            border: 'none',
            borderRadius: 999,
            padding: '9px 16px 9px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            cursor: safeMode ? 'not-allowed' : 'pointer',
            background: safeMode
              ? isDark ? 'rgba(90,90,90,0.22)' : 'rgba(180,180,180,0.22)'
              : isDark ? 'linear-gradient(100deg, #7df9ff 0%, #a9f4ff 100%)' : 'linear-gradient(100deg, #4a86ff 0%, #7aa8ff 100%)',
            color: safeMode ? (isDark ? 'rgba(230,244,255,0.46)' : 'rgba(18,26,44,0.46)') : isDark ? '#041018' : '#fff',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.05em',
            boxShadow: safeMode ? 'none' : isDark ? '0 8px 18px rgba(125,249,255,0.24), inset 0 1px 0 rgba(255,255,255,0.3)' : '0 8px 16px rgba(70,130,255,0.18)',
            opacity: safeMode ? 0.64 : 1,
          }}
        >
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: isDark ? 'rgba(4,16,24,0.14)' : 'rgba(255,255,255,0.28)', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 800 }}>A</span>
          {safeMode ? 'SAFE MODE' : 'PLAY'}
        </button>

        {onMedia && (
          <button
            onClick={() => onMedia(game.id)}
            style={{
              padding: '6px 11px',
              borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.11)' : 'rgba(18,26,44,0.10)'}`,
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.70)',
              color: isDark ? 'rgba(230,244,255,0.76)' : 'rgba(18,26,44,0.68)',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: 800, opacity: 0.72 }}>X</span> MEDIA
          </button>
        )}
        {onToggleFavorite && (
          <button
            onClick={() => onToggleFavorite(game.id)}
            style={{
              padding: '6px 11px',
              borderRadius: 999,
              border: `1px solid ${game.favorite ? (isDark ? 'rgba(255,214,90,0.32)' : 'rgba(255,180,0,0.32)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
              background: game.favorite ? (isDark ? 'rgba(255,214,90,0.14)' : 'rgba(255,200,60,0.18)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.66)',
              color: isDark ? 'rgba(230,244,255,0.84)' : 'rgba(18,26,44,0.76)',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: game.favorite ? (isDark ? '#ffd85a' : '#b77900') : undefined }}>Y</span> {game.favorite ? '★ FAV' : 'FAV'}
          </button>
        )}
        {onDiscover && (
          <button
            onClick={() => onDiscover(game.id)}
            style={{
              padding: '6px 11px',
              borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.16)'}`,
              background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)',
              color: isDark ? 'rgba(230,244,255,0.80)' : 'rgba(18,26,44,0.72)',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            VIEW DISCOVER
          </button>
        )}
      </div>

      {mediaResolving && (
        <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.62, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.42)'}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'crystal-spin 0.9s linear infinite' }} />
          Resolving media…
        </div>
      )}
    </div>
  )
}
