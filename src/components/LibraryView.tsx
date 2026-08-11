import { GameBrowserList } from './library/GameBrowserList'
import { SelectedGameContext } from './library/SelectedGameContext'
import { LibraryHero } from './library/LibraryHero'
import type { CarouselGame } from './GameBoxCarousel'

/**
 * V8.5 Library — vertical browser + hero composition
 *
 * Changes vs V8.3:
 * - REMOVED bottom GameBoxCarousel primary (22% glass rail deleted)
 * - LEFT 28-32% vertical browser, 6-8 rows, cover thumb 56x56, 13.5px title
 * - REMOVE hard vertical wall — feathered gradients, no giant translucent rectangle, no column border
 * - RIGHT 68-72% hero — SystemStage layered architecture preserved (parent wrapper renders hardware)
 * - Selected info — contextual bottom-left bridge card, NOT giant slab
 * - Typography readable, CTA hierarchy A PLAY primary
 * - Performance: immediate highlight, media debounce preserved in App.tsx
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
  rating?: number | string | null
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
  onDiscover?: (id: string) => void
  mediaResolving?: boolean
  logoUrl?: string | null
  stageNode?: React.ReactNode
  safeMode?: boolean
  onSafeModeBlocked?: () => void
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
  onDiscover,
  mediaResolving,
  logoUrl,
  safeMode,
  onSafeModeBlocked,
}: LibraryViewProps) {
  const isDark = theme === 'dark'

  return (
    <div
      className="golden-library v85"
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
      {/* TOP 48px minimal header — preserved */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px 0 18px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.055)'}`,
          backdropFilter: 'blur(18px) saturate(1.12)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.12)',
          background: isDark ? 'rgba(6,9,14,0.10)' : 'rgba(250,252,255,0.32)',
          position: 'relative',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'linear-gradient(90deg, rgba(125,249,255,0.05) 0%, transparent 24%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(70,130,255,0.05) 0%, transparent 28%, transparent 100%)',
            pointerEvents: 'none',
            opacity: 0.5,
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
              style={{ height: 20, width: 'auto', maxWidth: 96, objectFit: 'contain', opacity: isDark ? 0.88 : 0.86, display: 'block' }}
            />
          )}
        </div>
      </div>

      {/* MAIN — LEFT 30% browser + RIGHT 70% hero */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* LEFT — feathered, no hard wall, shared scene */}
        <div
          className="library-left"
          style={{
            width: '30%',
            minWidth: '30%',
            maxWidth: '30%',
            height: '100%',
            overflow: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: isDark ? 'rgba(125,249,255,0.20) transparent' : 'rgba(70,130,255,0.20) transparent',
            padding: '16px 12px 16px 14px',
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) minmax(0, 1fr)',
            gap: 10,
            // feathered to transparent — no giant translucent rectangle, no visible column boundary
            background: isDark
              ? 'linear-gradient(90deg, rgba(6,10,18,0.48) 0%, rgba(8,12,20,0.34) 64%, rgba(8,12,20,0.08) 90%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(241,245,252,0.66) 0%, rgba(245,248,253,0.44) 64%, rgba(245,248,253,0.10) 90%, transparent 100%)',
            position: 'relative',
          }}
        >
          {/* subtle atmospheric glows that bleed into hero — not a wall */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark
                ? 'radial-gradient(ellipse 86% 42% at 18% 12%, rgba(125,249,255,0.05), transparent 56%)'
                : 'radial-gradient(ellipse 84% 38% at 16% 10%, rgba(70,130,255,0.06), transparent 58%)',
              pointerEvents: 'none',
              opacity: 0.9,
            }}
          />

          <div style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', opacity: 0.56, textTransform: 'uppercase' }}>
            {games.length} GAMES • {fullName}
          </div>

          <GameBrowserList theme={theme} games={games} selectedId={selectedId} onSelect={onSelect} />

          <section className="library-details" style={{ minHeight: 0, overflow: 'auto', position: 'relative', zIndex: 1 }}>
            <SelectedGameContext
              theme={theme}
              game={selectedGame}
              mediaResolving={mediaResolving}
              onLaunch={onLaunch}
              onToggleFavorite={onToggleFavorite}
              onMedia={onMedia}
              onDiscover={onDiscover}
              safeMode={safeMode}
              onSafeModeBlocked={onSafeModeBlocked}
            />
          </section>
        </div>

        {/* RIGHT HERO — more room, pushed right via paddingLeft in LibraryHero, SystemStage hardware stable */}
        <LibraryHero theme={theme} systemId={systemId} />
      </div>

      {/* keyframes reused */}
      <style>{`
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
        .library-left { scrollbar-width: thin; }
        .library-left::-webkit-scrollbar { width: 6px; }
        .library-left::-webkit-scrollbar-track { background: transparent; }
        .library-left::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.12); border-radius: 999px; }
        .game-browser-list::-webkit-scrollbar, .library-details::-webkit-scrollbar { width: 5px; }
        .game-browser-list::-webkit-scrollbar-track, .library-details::-webkit-scrollbar-track { background: transparent; }
        .game-browser-list::-webkit-scrollbar-thumb, .library-details::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.16); border-radius: 999px; }
        @media (max-width: 1280px) {
          .golden-library.v85 .library-left { min-width: 330px !important; width: 30% !important; max-width: 30% !important; }
        }
        @media (max-height: 720px) {
          .golden-library.v85 .library-left { gap: 8px !important; padding: 12px 10px 10px 12px !important; }
        }
      `}</style>
    </div>
  )
}

export default LibraryView
