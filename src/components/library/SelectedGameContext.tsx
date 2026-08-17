import type { LibraryGameDetail } from '../LibraryView'

type SelectedCtxProps = {
  theme: 'light' | 'dark'
  systemId?: string
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
  systemId,
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
  // V3.1 Game Notes – progress surfaced from LibraryView detail (return from launch)
  const notesProgress = (game as any).notesProgress as number | undefined
  const notesText = (game as any).notesText as string | undefined

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        minHeight: '100%',
        boxSizing: 'border-box',
        background: isDark
          ? 'linear-gradient(145deg, rgba(5,10,19,.94) 0%, rgba(9,15,26,.82) 100%)'
          : 'linear-gradient(145deg, rgba(255,255,255,.96) 0%, rgba(237,243,252,.92) 100%)',
        backdropFilter: 'blur(18px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.08)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.07)'}`,
        borderRadius: systemId === 'n64' || systemId === 'genesis' || systemId === 'megadrive' ? '8px 18px 18px 8px' : 16,
        padding: '14px 14px 12px 14px',
        boxShadow: isDark
          ? '0 14px 32px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.03) inset'
          : '0 12px 28px rgba(18,26,44,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
        borderLeft: '3px solid var(--library-accent)',
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

      {/* V3.1 Game Notes – progress bar surfaced on return from launch */}
      {typeof notesProgress === 'number' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 0 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.68 }}>
            <span>Notes progress</span>
            <span style={{ color: isDark ? '#7df9ff' : '#295fdc', fontWeight: 700 }}>{notesProgress}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, notesProgress))}%`, height: '100%', background: isDark ? 'linear-gradient(90deg,#7df9ff,#a0f0ff)' : 'linear-gradient(90deg,#4a86ff,#7aa8ff)', transition: 'width 240ms ease', borderRadius: 999 }} />
          </div>
          {notesText && (
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              “{notesText.slice(0, 56)}{notesText.length>56?'…':''}”
            </div>
          )}
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
            tabIndex={0}
            style={{
              padding: '6px 11px',
              borderRadius: 999,
              border: `1px solid ${typeof notesProgress === 'number' ? (isDark ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.20)') : isDark ? 'rgba(255,255,255,0.11)' : 'rgba(18,26,44,0.10)'}`,
              background: typeof notesProgress === 'number' ? (isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.10)') : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.70)',
              color: isDark ? 'rgba(230,244,255,0.76)' : 'rgba(18,26,44,0.68)',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Game notes – progress & memo"
          >
            <span style={{ fontWeight: 800, opacity: 0.72 }}>X</span> NOTES{typeof notesProgress === 'number' ? ` ${notesProgress}%` : ''}
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
