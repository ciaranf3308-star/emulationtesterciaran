import { GameBrowserList } from './library/GameBrowserList'
import { SelectedGameContext } from './library/SelectedGameContext'
import { LibraryHero } from './library/LibraryHero'
import type { CarouselGame } from './GameBoxCarousel'
import { getLibraryVisualProfile } from './library/libraryVisualProfile'
import type { CSSProperties } from 'react'

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
  const visual = getLibraryVisualProfile(systemId)

  return (
    <div
      className="golden-library v85"
      data-system-id={systemId}
      data-theme={theme}
      data-library-family={visual.family}
      data-list-mode={visual.listMode}
      style={{
        '--library-accent': visual.accent,
        '--library-accent-2': visual.accent2,
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 6,
        pointerEvents: 'auto',
        overflow: 'hidden',
      } as CSSProperties}
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
          background: isDark ? 'rgba(4,7,13,0.44)' : 'rgba(245,248,253,0.58)',
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
      <div className="library-scene" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
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
            gridTemplateRows: 'auto minmax(0, 1.08fr) minmax(0, .92fr)',
            gap: 10,
            // feathered to transparent — no giant translucent rectangle, no visible column boundary
            background: isDark
              ? 'linear-gradient(90deg, rgba(3,7,15,.92) 0%, rgba(6,11,20,.80) 76%, rgba(6,11,20,.20) 96%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(247,250,255,.94) 0%, rgba(239,244,252,.84) 76%, rgba(239,244,252,.20) 96%, transparent 100%)',
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
            <span style={{ color: visual.accent, opacity: 1 }}>{String(games.findIndex(g => g.id === selectedId) + 1).padStart(2, '0')}</span>
            <span style={{ opacity: .35 }}> / {String(games.length).padStart(2, '0')}</span>
            <span style={{ marginLeft: 10, opacity: .72 }}>{visual.label}</span>
            <span style={{ marginLeft: 8, opacity: .32 }}>• {visual.concept}</span>
          </div>

          <GameBrowserList theme={theme} systemId={systemId} games={games} selectedId={selectedId} onSelect={onSelect} />

          <section className="library-details" style={{ minHeight: 0, overflow: 'auto', position: 'relative', zIndex: 1 }}>
            <SelectedGameContext
              theme={theme}
              systemId={systemId}
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
        <LibraryHero
          theme={theme}
          systemId={systemId}
          selectedCoverUrl={selectedGame?.coverUrl}
          selectedTitle={selectedGame?.name}
        />
      </div>

      {/* keyframes reused */}
      <style>{`
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
        @keyframes library-arrive { from { opacity: 0; transform: translate3d(-18px,0,0); } to { opacity: 1; transform: none; } }
        @keyframes hero-breathe { 0%,100% { transform: scale(1); opacity:.55 } 50% { transform: scale(1.04); opacity:.82 } }
        @keyframes scan-drift { from { transform: translateY(-28px) } to { transform: translateY(28px) } }
        .golden-library.v85 .library-left { animation: library-arrive 420ms cubic-bezier(.2,.8,.2,1) both; }
        .golden-library.v85 .game-browser-list button { position:relative; }
        .golden-library.v85 .game-browser-list button[data-selected="1"]::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:3px; border-radius:4px; background:var(--library-accent); box-shadow:0 0 18px var(--library-accent); }
        .golden-library.v85[data-library-family="cartridge"] .game-browser-list button { clip-path:polygon(0 0,96% 0,100% 14%,100% 100%,0 100%); }
        .golden-library.v85[data-library-family="dual-screen"] .game-browser-list button[data-selected="1"] { border-top-color:var(--library-accent)!important; border-bottom-color:var(--library-accent-2)!important; }
        .golden-library.v85[data-system-id="nds"] .library-left{width:27%!important;min-width:27%!important;max-width:27%!important;padding:12px 8px 12px 14px!important;grid-template-rows:auto minmax(0,1.22fr) minmax(0,.78fr);background:linear-gradient(90deg,rgba(4,8,14,.97),rgba(7,14,23,.86) 82%,transparent)!important}
        .golden-library.v85[data-system-id="nds"][data-theme="light"] .library-left{background:linear-gradient(90deg,rgba(234,242,251,.98),rgba(222,234,247,.91) 82%,transparent)!important}
        .golden-library.v85[data-system-id="nds"] .game-browser-list{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px!important;padding-right:4px!important;align-content:start}
        .golden-library.v85[data-system-id="nds"] .game-browser-list button{height:94px!important;min-height:94px!important;width:auto!important;min-width:0!important;padding:7px!important;border-radius:7px 16px 16px 7px!important;display:grid!important;grid-template-columns:46px minmax(0,1fr)!important;gap:8px!important;overflow:hidden!important;box-shadow:inset 3px 0 rgba(255,255,255,.09),0 7px 18px rgba(0,0,0,.12)!important}
        .golden-library.v85[data-system-id="nds"] .game-browser-list button::after{content:"DS";position:absolute;right:5px;bottom:3px;font:700 7px var(--crystal-mono);letter-spacing:.18em;opacity:.28}
        .golden-library.v85[data-system-id="nds"] .game-browser-list button>div:first-of-type{width:46px!important;height:70px!important;border-radius:5px!important;align-self:center}
        .golden-library.v85[data-system-id="nds"] .game-browser-list button>div:nth-of-type(2)>div:first-child{font-size:10px!important;white-space:normal!important;line-height:1.18!important;display:-webkit-box!important;-webkit-line-clamp:3;-webkit-box-orient:vertical}
        .golden-library.v85[data-system-id="nds"] .game-browser-list button[data-selected="1"]{transform:translateX(4px) scale(1.025);background:linear-gradient(135deg,color-mix(in srgb,var(--library-accent),transparent 76%),color-mix(in srgb,var(--library-accent-2),transparent 88%))!important;box-shadow:0 0 0 1px var(--library-accent),0 10px 28px color-mix(in srgb,var(--library-accent),transparent 72%)!important}
        .golden-library.v85[data-system-id="nds"] .library-details{border:1px solid color-mix(in srgb,var(--library-accent),transparent 62%);border-radius:18px 18px 28px 28px;padding:10px;background:linear-gradient(160deg,rgba(7,15,25,.92),rgba(10,24,35,.72))!important;box-shadow:inset 0 0 32px rgba(71,177,255,.06),0 16px 35px rgba(0,0,0,.22)}
        .golden-library.v85[data-system-id="nds"][data-theme="light"] .library-details{background:linear-gradient(160deg,rgba(240,247,255,.96),rgba(213,230,246,.90))!important}
        .nds-touchscreen-content{position:absolute;left:35.2%;top:48.2%;width:22.7%;height:25.4%;z-index:4;overflow:hidden;border-radius:5px;background:linear-gradient(145deg,rgba(8,17,25,.96),rgba(18,35,48,.94));box-shadow:inset 0 0 25px rgba(73,174,255,.18);display:grid;grid-template-columns:42% 58%;align-items:center;padding:8px;box-sizing:border-box;animation:nds-screen-on 320ms ease-out both;pointer-events:none}
        .nds-touchscreen-content img{width:74%;height:82%;object-fit:contain;justify-self:center;filter:drop-shadow(0 5px 7px rgba(0,0,0,.48));animation:nds-card-in 330ms cubic-bezier(.2,.8,.2,1) both}
        .nds-touchscreen-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(78,180,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(78,180,255,.09) 1px,transparent 1px);background-size:12px 12px;mask-image:linear-gradient(90deg,#000,transparent)}
        .nds-touchscreen-copy{min-width:0;display:flex;flex-direction:column;gap:6px;text-align:left;color:#d9f3ff;font-family:var(--crystal-mono);position:relative}
        .nds-touchscreen-copy span{font-size:6px;letter-spacing:.18em;color:var(--library-accent)}.nds-touchscreen-copy strong{font-size:8px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
        .nds-stylus-cursor{position:absolute;width:7px;height:7px;border:1px solid var(--library-accent);border-radius:50%;right:13%;bottom:14%;box-shadow:0 0 12px var(--library-accent);animation:nds-tap 2.8s ease-in-out infinite}
        @keyframes nds-screen-on{from{opacity:0;filter:brightness(2);transform:scaleY(.04)}to{opacity:1;filter:none;transform:none}}@keyframes nds-card-in{from{opacity:0;transform:translateY(18px) rotate(-5deg)}to{opacity:1;transform:none}}@keyframes nds-tap{0%,65%,100%{transform:translate(0,0);opacity:.35}75%{transform:translate(-18px,-10px);opacity:1}82%{transform:translate(-18px,-10px) scale(.65);opacity:1}}
        .golden-library.v85[data-library-family="handheld"] .game-browser-list button[data-selected="1"] { box-shadow:0 0 0 1px color-mix(in srgb,var(--library-accent),transparent 62%),0 12px 28px color-mix(in srgb,var(--library-accent),transparent 80%)!important; }
        .golden-library.v85[data-list-mode="spine"] .game-browser-list button { border-radius:3px 14px 14px 3px!important; }
        .golden-library.v85[data-list-mode="blade"] .game-browser-list button { clip-path:polygon(0 0,94% 0,100% 50%,94% 100%,0 100%); border-radius:2px!important; }
        .golden-library.v85[data-list-mode="channel"] .game-browser-list { display:grid!important; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-content:start; }
        .golden-library.v85[data-list-mode="channel"] .game-browser-list button { min-width:0!important; width:auto!important; height:92px!important; min-height:92px!important; flex-direction:column; align-items:flex-start!important; gap:4px!important; padding:7px!important; }
        .golden-library.v85[data-list-mode="channel"] .game-browser-list button>div:nth-of-type(2) { width:100%; }
        .golden-library.v85[data-list-mode="channel"] .game-browser-list button>div:nth-of-type(2)>div:first-child { font-size:10px!important; white-space:normal!important; display:-webkit-box!important; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .golden-library.v85[data-list-mode="channel"] .game-browser-list button>div:first-of-type { width:38px!important; height:34px!important; }
        .golden-library.v85[data-list-mode="disc"] .game-browser-list button>div:first-of-type { border-radius:50%!important; width:48px!important; height:48px!important; }
        .golden-library.v85[data-list-mode="tile"] .game-browser-list button { border-radius:16px!important; }
        .console-atmosphere{position:absolute;inset:0;overflow:hidden;opacity:.68;contain:paint;}
        .console-atmosphere .motif{position:absolute;pointer-events:none;}
        .dot-matrix{inset:9%;background-image:radial-gradient(currentColor 1px,transparent 1.5px);background-size:12px 12px;opacity:.13;mask-image:linear-gradient(90deg,transparent,#000 30%,#000,transparent)}
        .lcd-battery{right:5%;bottom:8%;font:9px var(--crystal-mono);letter-spacing:.18em;opacity:.7}.color-bars{right:7%;top:13%;width:42%;height:5px;background:linear-gradient(90deg,#e94b35,#e7ce38,#4ed273,#4bbbe9,#8a5de8);box-shadow:0 0 24px currentColor}.pixel-cross{right:8%;bottom:12%;font-size:72px;opacity:.08}
        .advance-grid{inset:6%;background-image:linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px);background-size:28px 28px;opacity:.08;mask-image:radial-gradient(circle at 60% 45%,#000,transparent 70%)}.shoulder-line{right:4%;top:8%;font:9px var(--crystal-mono);letter-spacing:.25em}
        .ds-hinge{left:14%;right:14%;top:50%;height:2px;background:linear-gradient(90deg,transparent,currentColor,transparent);box-shadow:0 0 18px currentColor}.touch-radar{right:8%;bottom:9%;width:90px;height:90px;border:1px solid currentColor;border-radius:50%;display:grid;place-items:center;font:8px var(--crystal-mono);letter-spacing:.2em;opacity:.35}
        .depth-lines{inset:10%;background:repeating-radial-gradient(ellipse at 58% 44%,transparent 0 34px,currentColor 35px 36px);opacity:.10}.depth-meter{right:4%;top:13%;font:9px var(--crystal-mono);line-height:2;letter-spacing:.2em}
        .n64-polygons{right:4%;top:7%;width:70%;height:76%;background:conic-gradient(from 30deg at 50% 50%,transparent,currentColor 2deg,transparent 4deg 40deg,currentColor 42deg,transparent 44deg);opacity:.08}.cart-slot{right:31%;bottom:7%;border:1px solid currentColor;padding:5px 34px;font:8px var(--crystal-mono);letter-spacing:.2em}
        .mode7-plane{right:5%;bottom:-18%;width:75%;height:65%;transform:perspective(300px) rotateX(64deg);background-image:linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px);background-size:34px 34px;opacity:.13}.snes-buttons{right:6%;top:12%;letter-spacing:8px;opacity:.45}
        .blast-wave{right:4%;top:42%;width:70%;height:90px;background:repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 13px);clip-path:polygon(0 48%,8% 46%,12% 20%,18% 78%,24% 35%,30% 64%,38% 48%,100% 48%,100% 52%,0 52%);opacity:.25}.sixteen-bit{right:6%;bottom:8%;font:700 56px var(--crystal-display);opacity:.06}
        .mega-ring,.ring-light,.disc-orbit,.umd-ring{right:12%;top:15%;width:42%;aspect-ratio:1;border:2px solid currentColor;border-radius:50%;box-shadow:0 0 45px color-mix(in srgb,currentColor,transparent 62%),inset 0 0 45px color-mix(in srgb,currentColor,transparent 72%)}.mega-speed{right:7%;top:10%;font:800 15px var(--crystal-display);font-style:italic}.cube-wire{right:12%;top:14%;width:32%;aspect-ratio:1;border:1px solid currentColor;transform:rotate(30deg) skew(-8deg);box-shadow:22px 22px 0 -1px transparent,22px 22px 0 0 currentColor;opacity:.18}.disc-orbit{border-style:dashed;opacity:.22}
        .dream-spiral{right:10%;top:12%;font-size:260px;line-height:1;opacity:.08;transform:rotate(28deg)}.vmu-window{right:7%;bottom:10%;border:1px solid currentColor;padding:10px 18px;font:9px var(--crystal-mono)}.ps-grid{inset:7%;background:linear-gradient(30deg,transparent 48%,currentColor 49% 50%,transparent 51%),linear-gradient(-30deg,transparent 48%,currentColor 49% 50%,transparent 51%);background-size:60px 60px;opacity:.05}.memory-card{right:5%;bottom:7%;font:8px var(--crystal-mono);letter-spacing:.16em;border-top:1px solid currentColor;padding-top:7px}.blue-towers{inset:6%;background:repeating-linear-gradient(90deg,transparent 0 28px,currentColor 29px 30px);opacity:.06;transform:perspective(400px) rotateX(55deg)}.ps2-data{right:3%;top:12%;writing-mode:vertical-rl;font:8px var(--crystal-mono);letter-spacing:.2em}
        .xmb-wave{right:-5%;top:24%;width:78%;height:44%;border-radius:50%;border-top:2px solid currentColor;transform:rotate(-8deg);box-shadow:0 -18px 0 -17px currentColor,0 -38px 0 -37px currentColor;opacity:.24}.umd-ring{display:grid;place-items:center;font:9px var(--crystal-mono);letter-spacing:.2em}.xbox-reactor{right:10%;top:10%;font:900 290px var(--crystal-display);line-height:1;color:currentColor;opacity:.055}.xbox-data{right:6%;bottom:8%;font:8px var(--crystal-mono);letter-spacing:.25em}.blade-lines{right:4%;top:13%;width:58%;height:68%;background:repeating-linear-gradient(110deg,transparent 0 40px,currentColor 41px 42px);opacity:.08}
        .channel-grid{right:5%;top:10%;width:58%;height:70%;background-image:linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px);background-size:92px 66px;opacity:.12;border:1px solid currentColor;border-radius:18px}.pointer{right:24%;top:28%;font-size:25px;text-shadow:0 0 20px currentColor}.signal-arcs{right:6%;top:15%;width:55%;height:55%;background:repeating-radial-gradient(circle at 50% 60%,transparent 0 35px,currentColor 36px 37px);opacity:.12}.gamepad-link{right:6%;bottom:8%;font:8px var(--crystal-mono);letter-spacing:.2em}.steam-nodes{right:6%;top:12%;width:58%;height:64%;background:radial-gradient(circle at 20% 30%,currentColor 0 4px,transparent 5px),radial-gradient(circle at 70% 65%,currentColor 0 7px,transparent 8px),linear-gradient(25deg,transparent 49%,currentColor 50% 51%,transparent 52%);opacity:.14}.pc-status{right:5%;bottom:8%;font:8px var(--crystal-mono);letter-spacing:.2em}
        .motion-orbit .disc-orbit,.motion-orbit .ring-light,.motion-orbit .dream-spiral{animation:console-orbit 18s linear infinite}.motion-pulse .motif{animation:console-pulse 4s ease-in-out infinite}.motion-float .motif{animation:console-float 7s ease-in-out infinite}.motion-scan .advance-grid,.motion-scan .dot-matrix,.motion-scan .color-bars{animation:console-scan 8s linear infinite}.motion-slide .blast-wave,.motion-slide .xmb-wave{animation:console-slide 6s ease-in-out infinite}
        @keyframes console-orbit{to{transform:rotate(360deg)}}@keyframes console-pulse{50%{opacity:.3}}@keyframes console-float{50%{translate:0 -8px}}@keyframes console-scan{50%{background-position:18px 28px}}@keyframes console-slide{50%{translate:18px 0}}
        @media(prefers-reduced-motion:reduce){.console-atmosphere .motif,.library-hero-orbit{animation:none!important}.game-browser-list button{transition:none!important}}
        @media(prefers-reduced-motion:reduce){.nds-touchscreen-content,.nds-touchscreen-content img,.nds-stylus-cursor{animation:none!important}}
        .library-left { scrollbar-width: thin; }
        .library-left::-webkit-scrollbar { width: 6px; }
        .library-left::-webkit-scrollbar-track { background: transparent; }
        .library-left::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.12); border-radius: 999px; }
        .game-browser-list::-webkit-scrollbar, .library-details::-webkit-scrollbar { width: 5px; }
        .game-browser-list::-webkit-scrollbar-track, .library-details::-webkit-scrollbar-track { background: transparent; }
        .game-browser-list::-webkit-scrollbar-thumb, .library-details::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.16); border-radius: 999px; }
        @media (max-width: 1280px) {
          .golden-library.v85 .library-left { min-width: 330px !important; width: 30% !important; max-width: 30% !important; }
          .golden-library.v85[data-system-id="nds"] .library-left{min-width:296px!important;width:27%!important;max-width:27%!important}
        }
        @media (max-height: 720px) {
          .golden-library.v85 .library-left { gap: 8px !important; padding: 12px 10px 10px 12px !important; }
        }
      `}</style>
    </div>
  )
}

export default LibraryView
