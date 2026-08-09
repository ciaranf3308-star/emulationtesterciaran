/**
 * GameBoxCarousel – premium horizontal library carousel REQUIRED for V8
 *
 * - Real scraped covers/box art
 * - Selected larger opaque 1.08 forward crisp optional reflection
 * - Neighbours smaller opacity 0.68/0.38 scale 0.92/0.82
 * - 5-7 covers depending width – we show 5 centered window -2..+2
 * - Bottom 20-25% overlap integrated not full-width navy bar
 * - Graceful fallback if missing cover: title text elegant placeholder
 * - Wraps cyclically if allowed (default true – controller friendly)
 */

export type CarouselGame = {
  id: string
  name: string
  coverUrl?: string | null
}

export type GameBoxCarouselProps = {
  games: CarouselGame[]
  selectedId: string
  onSelect: (id: string) => void
  onLaunch?: (id: string) => void
  theme: 'light' | 'dark'
  wrap?: boolean
}

function wrapIndex(i: number, len: number): number {
  if (len === 0) return 0
  return ((i % len) + len) % len
}

export function GameBoxCarousel({ games, selectedId, onSelect, onLaunch, theme, wrap = true }: GameBoxCarouselProps) {
  const isDark = theme === 'dark'
  const len = games.length
  const selIdx = Math.max(0, games.findIndex(g => g.id === selectedId))
  const selectedIdx = selIdx >= 0 ? selIdx : 0

  // visible window 5-7: we do -3..+3 for 7 max but compress to 5 on narrow? use -2..+2 core =5, extended -3,+3 for wide – we keep 7 with opacity handling
  const offsets = [-3, -2, -1, 0, 1, 2, 3]

  const visible = offsets
    .map(off => {
      const realIdx = wrap ? wrapIndex(selectedIdx + off, len) : selectedIdx + off
      if (!wrap && (realIdx < 0 || realIdx >= len)) return null
      const game = games[realIdx]
      if (!game) return null
      return { offset: off, game, realIdx }
    })
    .filter(Boolean) as Array<{ offset: number; game: CarouselGame; realIdx: number }>

  return (
    <div
      className="game-box-carousel"
      data-theme={theme}
      data-selected-id={selectedId}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'auto',
        paddingBottom: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 14,
          width: '100%',
          transform: 'translateZ(0)',
          padding: '0 24px',
          boxSizing: 'border-box',
        }}
      >
        {visible.map(({ offset, game }) => {
          const isSel = offset === 0
          const dist = Math.abs(offset)
          const opacity = isSel ? 1 : dist === 1 ? 0.78 : dist === 2 ? 0.52 : 0.34
          const scale = isSel ? 1.08 : dist === 1 ? 0.92 : dist === 2 ? 0.84 : 0.78
          const translateY = isSel ? -10 : dist === 1 ? -2 : 4
          const blur = isSel ? 0 : dist >= 2 ? 0.6 : 0

          return (
            <button
              key={`${game.id}-${offset}`}
              onClick={() => {
                if (isSel) onLaunch?.(game.id)
                else onSelect(game.id)
              }}
              data-offset={offset}
              data-game-id={game.id}
              data-selected={isSel ? '1' : '0'}
              className={`box-item ${isSel ? 'is-selected' : ''}`}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                transform: `translateY(${translateY}px) scale(${scale})`,
                opacity,
                filter: blur > 0 ? `blur(${blur}px)` : 'none',
                transition: 'transform 260ms cubic-bezier(0.16,1,0.3,1), opacity 260ms ease, filter 260ms ease',
                willChange: 'transform, opacity, filter',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'auto',
              }}
              aria-current={isSel ? 'true' : undefined}
              aria-label={game.name}
            >
              <div
                style={{
                  width: isSel ? 112 : 82,
                  height: isSel ? 152 : 112,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)',
                  border: isSel
                    ? `1px solid ${isDark ? 'rgba(125,249,255,0.22)' : 'rgba(70,130,255,0.22)'}`
                    : `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                  boxShadow: isSel
                    ? isDark
                      ? '0 18px 38px rgba(0,0,0,0.52), 0 6px 16px rgba(0,0,0,0.34), 0 0 0 1px rgba(125,249,255,0.08) inset, 0 0 22px rgba(125,249,255,0.10)'
                      : '0 14px 32px rgba(18,26,44,0.18), 0 4px 12px rgba(18,26,44,0.12), inset 0 1px 0 rgba(255,255,255,0.9)'
                    : isDark
                      ? '0 8px 18px rgba(0,0,0,0.34)'
                      : '0 6px 14px rgba(18,26,44,0.10)',
                  transform: 'translateZ(0)',
                  position: 'relative',
                }}
              >
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 10,
                      boxSizing: 'border-box',
                      fontFamily: 'var(--crystal-display)',
                      fontSize: isSel ? 11 : 9.5,
                      color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.72)',
                      textAlign: 'center' as const,
                      lineHeight: 1.25,
                    }}
                  >
                    {game.name}
                  </div>
                )}
                {isSel && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 10,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22)`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
              {/* reflection */}
              {isSel && (
                <div
                  aria-hidden
                  style={{
                    width: isSel ? 112 : 82,
                    height: 24,
                    marginTop: -2,
                    background: isDark
                      ? 'linear-gradient(180deg, rgba(125,249,255,0.18), transparent)'
                      : 'linear-gradient(180deg, rgba(70,130,255,0.12), transparent)',
                    filter: 'blur(6px)',
                    opacity: isDark ? 0.36 : 0.28,
                    transform: 'scaleY(-1)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {isSel && (
                <div
                  style={{
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10,
                    color: isDark ? 'rgba(230,244,255,0.72)' : 'rgba(18,26,44,0.64)',
                    maxWidth: 128,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'center' as const,
                  }}
                >
                  {game.name}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default GameBoxCarousel
