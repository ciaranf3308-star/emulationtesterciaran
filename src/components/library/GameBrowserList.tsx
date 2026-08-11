import { useEffect, useRef } from 'react'
import type { CarouselGame } from '../GameBoxCarousel'

export type GameBrowserListProps = {
  theme: 'light' | 'dark'
  games: CarouselGame[]
  selectedId: string
  onSelect: (id: string) => void
  // optional richer meta if present on game object (compat)
  maxVisible?: number
}

export function GameBrowserList({ theme, games, selectedId, onSelect }: GameBrowserListProps) {
  const isDark = theme === 'dark'
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>('[data-selected="1"]')
    if (!list || !selected) return
    const itemTop = selected.offsetTop
    const itemBottom = itemTop + selected.offsetHeight
    if (itemTop < list.scrollTop) list.scrollTo({ top: itemTop, behavior: 'smooth' })
    else if (itemBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: itemBottom - list.clientHeight, behavior: 'smooth' })
    }
  }, [selectedId])

  return (
    <div
      ref={listRef}
      className="game-browser-list"
      role="listbox"
      aria-label="Game browser"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: 0,
        margin: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        flex: 1,
        minHeight: 0,
        scrollbarWidth: 'thin',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {games.map((g) => {
        const isSel = g.id === selectedId
        return (
          <button
            key={g.id}
            role="option"
            aria-selected={isSel}
            onClick={() => onSelect(g.id)}
            data-game-id={g.id}
            data-selected={isSel ? '1' : '0'}
            style={{
              appearance: 'none',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              height: 72,
              minHeight: 72,
              boxSizing: 'border-box',
              borderRadius: 12,
              border: isSel
                ? `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`
                : `1px solid transparent`,
              background: isSel
                ? isDark
                  ? 'rgba(125,249,255,0.12)'
                  : 'rgba(70,130,255,0.10)'
                : isDark
                ? 'linear-gradient(90deg, rgba(13,19,30,0.58), rgba(13,19,30,0.28))'
                : 'linear-gradient(90deg, rgba(255,255,255,0.70), rgba(255,255,255,0.44))',
              backdropFilter: 'blur(12px) saturate(1.08)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.08)',
              boxShadow: isSel
                ? isDark
                  ? '0 0 22px rgba(125,249,255,0.14), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : '0 6px 18px rgba(70,130,255,0.12), inset 0 1px 0 rgba(255,255,255,0.9)'
                : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease',
              opacity: isSel ? 1 : 0.86,
              transform: isSel ? 'translateZ(0) scale(1.01)' : 'translateZ(0)',
            }}
            onMouseEnter={e => {
              if (!isSel) (e.currentTarget as HTMLButtonElement).style.opacity = '1'
            }}
            onMouseLeave={e => {
              if (!isSel) (e.currentTarget as HTMLButtonElement).style.opacity = '0.86'
            }}
          >
            <div
              style={{
                width: 48,
                height: 52,
                borderRadius: 8,
                overflow: 'hidden',
                flexShrink: 0,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.09)'}`,
                boxShadow: isSel ? '0 4px 12px rgba(0,0,0,0.24)' : 'none',
              }}
            >
              {g.coverUrl ? (
                <img src={g.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 11, fontFamily: 'var(--crystal-display)', color: isDark ? 'rgba(230,244,255,0.5)' : 'rgba(18,26,44,0.5)' }}>
                  {(g.name || '').slice(0, 18)}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div
                style={{
                  fontFamily: 'var(--crystal-display)',
                  fontSize: 13.5,
                  fontWeight: 670,
                  lineHeight: 1.22,
                  color: isDark ? '#e6f4ff' : '#16213e',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em',
                }}
                title={g.name}
              >
                {g.name}
              </div>
              {/* restrained secondary line – year/genre if present via extra props */}
              {/* @ts-ignore optional extended fields */}
              {((g as any).year || (g as any).genre || (g as any).developer) && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 10.5,
                    color: isDark ? 'rgba(230,244,255,0.58)' : 'rgba(18,26,44,0.56)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {/* @ts-ignore */}
                  {(g as any).year && <span style={{ padding: '2px 7px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(18,26,44,0.08)'}`, lineHeight: 1 }}>{(g as any).year}</span>}
                  {/* @ts-ignore */}
                  {(g as any).genre && <span style={{ opacity: 0.92 }}>{String((g as any).genre).slice(0, 22)}</span>}
                </div>
              )}
              {/* tiny progress/favorite hint if available */}
              {/* @ts-ignore */}
              {(g as any).favorite && <div style={{ fontSize: 10, color: isDark ? '#ffd85a' : '#b77900' }}>★ fav</div>}
            </div>
            {isSel && (
              <div
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isDark ? '#7df9ff' : '#4a86ff',
                  boxShadow: isDark ? '0 0 8px rgba(125,249,255,0.7)' : '0 0 8px rgba(70,130,255,0.6)',
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export default GameBrowserList
