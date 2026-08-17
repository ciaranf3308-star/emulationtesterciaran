import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { GameBrowserList } from './library/GameBrowserList'
import { SelectedGameContext } from './library/SelectedGameContext'
import { LibraryHero } from './library/LibraryHero'
import type { CarouselGame } from './GameBoxCarousel'
import { getLibraryVisualProfile } from './library/libraryVisualProfile'
import type { CSSProperties } from 'react'
import { getMostPlayed, getCuratedFallbackGames } from '../lib/mostPopular'
import { getCuratedForSystem } from '../data/curatedPopular'
import type { GameEntry } from '../runtime/backend'
import { getCollections, togglePinned, toggleBacklog, type CollectionState } from '../lib/collections'

/**
 * V3.1 Library — Pillar 1 + Most Popular + Pinned Backlog
 * Preserves V8.5 layout, adds:
 * - Your Most Played = local scoring playCount*0.6 + playTime + recency
 * - Curated fallback when <3
 * - Now Playing Pinned (cross-system max 5) top rail Y+hold (gamepad button 3 / 2 600ms)
 * - Backlog Queued marks
 * - D-pad navigable rails via roving tabindex
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
  system_id?: string
  rom_basename?: string
  rom_path?: string
}

export type LibraryQuickFilter = 'all' | 'fav' | 'recent' | 'unplayed'

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
  filter?: LibraryQuickFilter
  onFilterChange?: (f: LibraryQuickFilter) => void
  chipFocused?: boolean
  onChipFocusChange?: (focused: boolean) => void
  continueGames?: Array<{ id: string; name: string; coverUrl?: string | null; lastPlayedLabel?: string | null }>
  isEmptyDriveState?: boolean
  onRefresh?: () => void
  // V3.1 additions – rich games full GameEntry for scoring
  richGames?: GameEntry[]
  allGames?: GameEntry[]
  // collections external lifted state optional (App may own)
  collections?: CollectionState | null
  onCollectionsChange?: (s: CollectionState) => void
}

type RailProps = {
  title: string
  items: Array<{ id: string; name: string; coverUrl?: string | null; systemId?: string; subtitle?: string | null; reason?: string }>
  selectedId: string
  onSelect: (id: string) => void
  isDark: boolean
  accent: string
  emphasize?: boolean
}

function Rail({ title, items, selectedId, onSelect, isDark, accent, emphasize }: RailProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)

  useEffect(() => {
    const idx = items.findIndex(i => i.id === selectedId)
    if (idx >= 0) setFocusedIdx(idx)
  }, [selectedId, items])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedIdx(i => {
        const n = Math.min(items.length - 1, i + 1)
        const next = items[n]
        if (next) onSelect(next.id)
        return n
      })
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedIdx(i => {
        const n = Math.max(0, i - 1)
        const next = items[n]
        if (next) onSelect(next.id)
        return n
      })
    }
  }, [items, onSelect])

  if (!items || items.length === 0) return null
  return (
    <div
      role="region"
      aria-label={title}
      data-rail={title}
      tabIndex={0}
      onKeyDown={onKey}
      ref={rowRef}
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '6px 0 8px',
        borderRadius: 10,
        background: emphasize
          ? (isDark ? 'rgba(125,249,255,0.06)' : 'rgba(70,130,255,0.08)')
          : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.52)'),
        border: `1px solid ${emphasize ? (isDark ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.18)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)')}`,
        overflow: 'hidden'
      }}
    >
      <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, letterSpacing: '0.10em', opacity: 0.62, textTransform: 'uppercase', padding: '0 8px 6px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: emphasize ? accent : undefined, fontWeight: emphasize ? 800 : 600 }}>{title}</span>
        <span style={{ opacity: .44 }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 8px 6px', scrollbarWidth: 'none' }}>
        {items.map((g, idx) => {
          const isFocused = idx === focusedIdx
          const isSel = g.id === selectedId
          return (
            <button
              key={g.id}
              data-rail-item={g.id}
              data-focused={isFocused ? '1' : '0'}
              onClick={() => { setFocusedIdx(idx); onSelect(g.id) }}
              style={{
                minWidth: 78,
                maxWidth: 96,
                flexShrink: 0,
                borderRadius: 8,
                border: `1px solid ${isSel ? accent : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)')}`,
                background: isSel ? (isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)') : (isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.78)'),
                padding: 6,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isFocused ? `0 0 0 2px ${isDark ? 'rgba(125,249,255,0.26)' : 'rgba(70,130,255,0.22)'}` : 'none',
                transform: isFocused ? 'translateY(-1px)' : 'none',
                transition: 'all 140ms',
              }}
            >
              {g.coverUrl ? (
                <img src={g.coverUrl} alt="" style={{ width: '100%', height: 48, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: 48, borderRadius: 6, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', display: 'grid', placeItems: 'center', fontSize: 11 }}>◐</div>
              )}
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isDark ? 'rgba(230,244,255,0.92)' : '#1a2a52' }}>{g.name.slice(0, 16)}</div>
              {g.subtitle && <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 8, opacity: .52, whiteSpace: 'nowrap', overflow: 'hidden' }}>{g.subtitle}</div>}
              {g.reason && <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 7, opacity: .54, whiteSpace: 'nowrap', overflow: 'hidden', color: accent }}>{g.reason}</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
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
  filter = 'all',
  onFilterChange,
  chipFocused = false,
  onChipFocusChange,
  continueGames = [],
  isEmptyDriveState = false,
  onRefresh,
  richGames,
  allGames,
  collections: externalCollections,
  onCollectionsChange,
}: LibraryViewProps) {
  const isDark = theme === 'dark'
  const visual = getLibraryVisualProfile(systemId)

  const [localCollections, setLocalCollections] = useState<CollectionState>({ pinned: [], backlog: [], version: 1 })
  const collections = externalCollections ?? localCollections

  const rich = useMemo(() => {
    if (richGames && richGames.length) return richGames as any[]
    // fallback: map CarouselGame to minimal GameLike – play counts missing, scoring will fallback to curated
    return games as any[]
  }, [richGames, games])

  const mostPlayed = useMemo(() => {
    try { return getMostPlayed(systemId, rich as any) } catch { return [] }
  }, [systemId, rich])

  const curatedFallback = useMemo(() => {
    const count = mostPlayed.length
    if (count >= 3) return [] as string[]
    return getCuratedFallbackGames(systemId, count)
  }, [systemId, mostPlayed])

  const mostPlayedRailItems = useMemo(() => {
    // map mostPlayed GameEntry to rail shape with cover
    const list = mostPlayed as any[]
    return list.slice(0,5).map((g:any) => {
      const cover = games.find(cg => cg.id === g.id)?.coverUrl || (g as any).coverUrl || null
      return { id: g.id, name: g.name || g.rom_basename || 'Game', coverUrl: cover, systemId: g.system_id || systemId, subtitle: g.play_count ? `${g.play_count} plays` : g.last_played ? 'Recent' : undefined }
    })
  }, [mostPlayed, games, systemId])

  const curatedRailItems = useMemo(() => {
    if (curatedFallback.length === 0) return []
    const titles = curatedFallback.length ? curatedFallback : getCuratedForSystem(systemId).slice(0,5 - mostPlayed.length)
    return titles.map((t,i)=> ({ id: `curated-${systemId}-${i}`, name: t, coverUrl: null as any, systemId, subtitle: 'Curated', reason: mostPlayed.length===0 ? 'Popular' : 'Fallback' }))
  }, [curatedFallback, systemId, mostPlayed])

  // Collections load
  useEffect(() => {
    if (externalCollections) return
    getCollections().then(setLocalCollections).catch(()=>{})
  }, [externalCollections])

  useEffect(() => {
    const onUpdate = (e:any) => {
      const s = e?.detail as CollectionState
      if (s) {
        if (onCollectionsChange) onCollectionsChange(s)
        else setLocalCollections(s)
      }
    }
    window.addEventListener('crystal:collections-updated' as any, onUpdate)
    return () => window.removeEventListener('crystal:collections-updated' as any, onUpdate)
  }, [onCollectionsChange])

  const pinnedRailItems = useMemo(() => {
    const pins = collections?.pinned || []
    return pins.slice(0,5).map(p => {
      // try resolve game from allGames or games
      const pool = (allGames || []) as any[]
      const found = pool.find((g:any)=> g.system_id===p.system_id && g.rom_basename===p.rom_basename)
      const cover = found ? (games.find(cg=>cg.id===found.id)?.coverUrl || null) : null
      return { id: `${p.system_id}:${p.rom_basename}`, name: p.name || found?.name || p.rom_basename, coverUrl: cover, systemId: p.system_id, subtitle: p.system_id }
    })
  }, [collections, allGames, games])

  const backlogSet = useMemo(() => {
    const set = new Set<string>()
    for (const b of (collections?.backlog||[])) set.add(`${b.system_id.toLowerCase()}::${b.rom_basename.toLowerCase()}`)
    return set
  }, [collections])

  const handleTogglePinned = useCallback(async (sysId?: string, romBase?: string, name?: string, romPath?: string) => {
    const sid = sysId || systemId
    const base = romBase || (selectedGame as any)?.rom_basename || (selectedGame as any)?.id?.split(':')?.[1] || selectedGame?.name || 'unknown'
    if (!base || base==='unknown') return
    try {
      const res = await togglePinned({ system_id: sid, rom_basename: String(base), rom_path: romPath || null, name: name || String(base) } as any)
      if (onCollectionsChange) onCollectionsChange(res)
      else setLocalCollections(res)
      window.dispatchEvent(new CustomEvent('crystal:collections-updated' as any, { detail: res } as any))
      // toast via custom event? simple console
    } catch (e:any) {
      const msg = e?.message||String(e)
      if (msg.includes('MAX_5')) {
        try { window.dispatchEvent(new CustomEvent('crystal:toast' as any, { detail: 'Pinned max 5 reached' } as any)) } catch {}
      }
    }
  }, [systemId, selectedGame, onCollectionsChange])

  const handleToggleBacklog = useCallback(async () => {
    const g:any = selectedGame as any
    if (!g) return
    const sid = g.system_id || systemId
    const base = g.rom_basename || g.id?.split(':')?.[1] || g.name
    if (!base) return
    try {
      const res = await toggleBacklog({ system_id: sid, rom_basename: String(base), rom_path: g.rom_path || null, name: g.name, queued: true } as any)
      if (onCollectionsChange) onCollectionsChange(res)
      else setLocalCollections(res)
      window.dispatchEvent(new CustomEvent('crystal:collections-updated' as any, { detail: res } as any))
    } catch {}
  }, [selectedGame, systemId, onCollectionsChange])

  // Y+hold detection gamepad button 3 (Y) or 2 (X) 600ms
  const holdRef = useRef<{ start: number | null; triggered: boolean }>({ start: null, triggered: false })
  useEffect(() => {
    let raf=0
    const poll = () => {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : []
        for (const pad of pads) {
          if (!pad) continue
          // button 3 is Y on standard, button 2 is X; we accept both 3 and 2 as hold source per spec
          const bY = pad.buttons[3]
          const bX = pad.buttons[2]
          const active = (bY && bY.pressed) || (bX && bX.pressed)
          if (active) {
            const now = performance.now()
            if (holdRef.current.start == null) holdRef.current.start = now
            const elapsed = now - (holdRef.current.start||now)
            if (elapsed >= 600 && !holdRef.current.triggered) {
              holdRef.current.triggered = true
              handleTogglePinned()
              // visual pulse?
              try { window.dispatchEvent(new CustomEvent('crystal:pinned-toggle' as any, { detail: { systemId, id: selectedId } } as any)) } catch {}
            }
          } else {
            holdRef.current.start = null
            holdRef.current.triggered = false
          }
        }
      } catch {}
      raf = window.requestAnimationFrame(poll)
    }
    raf = window.requestAnimationFrame(poll)
    return () => { try { window.cancelAnimationFrame(raf) } catch {} }
  }, [handleTogglePinned, systemId, selectedId])

  // Keyboard alternative: Y hold via key 'y' held 600ms – emulate
  useEffect(() => {
    let timer:number|null=null
    let down=false
    const onDown=(e:KeyboardEvent)=>{
      if (e.key.toLowerCase()!=='y' || down) return
      down=true
      timer=window.setTimeout(()=>{ handleTogglePinned() },600) as any
    }
    const onUp=(e:KeyboardEvent)=>{
      if (e.key.toLowerCase()!=='y') return
      down=false
      if (timer!=null){ window.clearTimeout(timer); timer=null }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return ()=>{ window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); if (timer!=null) window.clearTimeout(timer) }
  }, [handleTogglePinned])

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
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 0 18px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.055)'}`, backdropFilter: 'blur(18px) saturate(1.12)', WebkitBackdropFilter: 'blur(18px) saturate(1.12)', background: isDark ? 'rgba(4,7,13,0.44)' : 'rgba(245,248,253,0.58)', position: 'relative' }}>
        <div aria-hidden style={{ position:'absolute', inset:0, background: isDark? 'linear-gradient(90deg, rgba(125,249,255,0.05), transparent 24%)':'linear-gradient(90deg, rgba(70,130,255,0.05), transparent 28%)', pointerEvents:'none', opacity:0.5 }}/>
        <button onClick={onBack} data-action="back-to-system" style={{ appearance:'none', background:'transparent', border:'none', color:isDark?'rgba(230,244,255,0.86)':'rgba(18,26,44,0.78)', fontFamily:'var(--crystal-mono)', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:10, letterSpacing:'0.04em', position:'relative', zIndex:1 }}>
          <span style={{ width:24, height:24, borderRadius:'50%', display:'grid', placeItems:'center', border:`1px solid ${isDark?'rgba(255,255,255,0.11)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.72)', fontSize:12, lineHeight:1 }}>←</span>
          <span style={{ textTransform:'uppercase', letterSpacing:'0.06em' }}>{fullName}</span><span style={{ opacity:0.42, fontWeight:500 }}>| MY LIBRARY</span>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative', zIndex:1 }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height:20, width:'auto', maxWidth:96, objectFit:'contain', opacity:isDark?0.88:0.86, display:'block' }} />}
          {collections?.pinned?.length ? <span title={`Pinned ${collections.pinned.length}/5`} style={{ fontFamily:'var(--crystal-mono)', fontSize:9, padding:'3px 7px', borderRadius:999, border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, background:isDark?'rgba(125,249,255,0.08)':'rgba(70,130,255,0.08)', color: visual.accent }}>📌 {collections.pinned.length}/5</span>:null}
        </div>
      </div>

      <div className="library-scene" style={{ flex:1, display:'flex', overflow:'hidden', position:'relative', minHeight:0 }}>
        <div className="library-left" style={{ width:'30%', minWidth:'30%', maxWidth:'30%', height:'100%', overflow:'hidden', scrollbarWidth:'thin', scrollbarColor:isDark?'rgba(125,249,255,0.20) transparent':'rgba(70,130,255,0.20) transparent', padding:'14px 12px 14px 14px', boxSizing:'border-box', display:'grid', gridTemplateRows:'auto auto auto auto auto minmax(0, 1.04fr) minmax(0, .90fr)', gap:10, background:isDark?'linear-gradient(90deg, rgba(3,7,15,.92), rgba(6,11,20,.80) 76%, rgba(6,11,20,.20) 96%, transparent)':'linear-gradient(90deg, rgba(247,250,255,.94), rgba(239,244,252,.84) 76%, rgba(239,244,252,.20) 96%, transparent)', position:'relative' }}>
          <div aria-hidden style={{ position:'absolute', inset:0, background:isDark?'radial-gradient(ellipse 86% 42% at 18% 12%, rgba(125,249,255,0.05), transparent 56%)':'radial-gradient(ellipse 84% 38% at 16% 10%, rgba(70,130,255,0.06), transparent 58%)', pointerEvents:'none', opacity:0.9 }} />

          <div style={{ position:'relative', zIndex:1, fontFamily:'var(--crystal-mono)', fontSize:10, letterSpacing:'0.08em', opacity:0.56, textTransform:'uppercase', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:visual.accent, opacity:1 }}>{String(Math.max(1, games.findIndex(g=>g.id===selectedId)+1)).padStart(2,'0')}</span>
            <span style={{ opacity:.35 }}> / {String(games.length).padStart(2,'0')}</span>
            <span style={{ marginLeft:10, opacity:.72 }}>{visual.label}</span>
            <span style={{ marginLeft:8, opacity:.32 }}>• {visual.concept}</span>
            {chipFocused && <span style={{ marginLeft:12, fontSize:9, opacity:.52, color:visual.accent }}>◂ CHIP NAV ▸</span>}
          </div>

          {/* Smart filter chips – preserved */}
          <div role="tablist" aria-label="Library quick filters" data-library-chip-row data-chip-focused={chipFocused?'1':'0'} style={{ position:'relative', zIndex:1, display:'flex', gap:6, flexWrap:'wrap', padding:'2px 0 4px' }}>
            {(['all','fav','recent','unplayed'] as const).map(fid=>{
              const active=filter===fid
              const label=fid==='all'?'All':fid==='fav'?'★ Favorites':fid==='recent'?'Recent':'Unplayed'
              return <button key={fid} role="tab" aria-selected={active} data-library-chip={fid} data-selected={active?'1':'0'} onClick={()=>onFilterChange?.(fid)} onFocus={()=>onChipFocusChange?.(true)} style={{ appearance:'none', borderRadius:999, padding:'5px 11px', fontFamily:'var(--crystal-mono)', fontSize:10, letterSpacing:'0.06em', fontWeight:active?800:600, border:active?`1px solid ${isDark?'rgba(125,249,255,0.42)':'rgba(70,130,255,0.34)'}`:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:active?(isDark?'rgba(125,249,255,0.16)':'rgba(70,130,255,0.14)'):(isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.62)'), color:active?(isDark?'#c8fcff':'#1d3a88'):(isDark?'rgba(230,244,255,0.72)':'rgba(18,26,44,0.68)'), cursor:'pointer', boxShadow:active&&chipFocused?`0 0 0 2px ${isDark?'rgba(125,249,255,0.30)':'rgba(70,130,255,0.24)'}`:active?`0 2px 12px ${isDark?'rgba(125,249,255,0.16)':'rgba(70,130,255,0.12)'}`:'none', transform:active?'translateZ(0) scale(1.02)':'none' }}>{label}</button>
            })}
          </div>

          {/* V3.1 Now Playing Pinned – cross-system max5 – Y+hold */}
          {pinnedRailItems.length>0 && (
            <Rail title="📌 Now Playing" items={pinnedRailItems as any} selectedId={selectedId} onSelect={onSelect} isDark={isDark} accent={visual.accent} emphasize />
          )}

          {/* Your Most Played */}
          {mostPlayedRailItems.length>0 && (
            <Rail title="🔥 Your Most Played" items={mostPlayedRailItems as any} selectedId={selectedId} onSelect={onSelect} isDark={isDark} accent={visual.accent} />
          )}

          {/* Curated fallback when <3-5 */}
          {curatedRailItems.length>0 && (
            <Rail title={mostPlayedRailItems.length===0 ? "🌟 Popular in System" : "💡 Curated Picks"} items={curatedRailItems as any} selectedId={selectedId} onSelect={(id)=>{
              // curated items are not launchable real games – if select curated, attempt to open discover? fallback no-op
              if (id.startsWith('curated-')) {
                // open discover with prefill
                onDiscover?.(id)
                return
              }
              onSelect(id)
            }} isDark={isDark} accent={visual.accent} />
          )}

          {continueGames.length>0 && (
            <div style={{ position:'relative', zIndex:1, padding:'6px 0 8px', borderRadius:10, background:isDark?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.52)', border:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)'}`, overflow:'hidden' }}>
              <div style={{ fontFamily:'var(--crystal-mono)', fontSize:9, letterSpacing:'0.10em', opacity:0.56, textTransform:'uppercase', padding:'0 8px 6px', display:'flex', justifyContent:'space-between' }}><span>↺ Continue Playing</span><span style={{ opacity:.44 }}>{continueGames.length}</span></div>
              <div style={{ display:'flex', gap:8, overflowX:'auto', padding:'0 8px 6px', scrollbarWidth:'none' }}>
                {continueGames.slice(0,5).map(g=>(
                  <button key={g.id} onClick={()=>onSelect(g.id)} style={{ minWidth:74, maxWidth:92, flexShrink:0, borderRadius:8, border:`1px solid ${selectedId===g.id?visual.accent:(isDark?'rgba(255,255,255,0.08)':'rgba(18,26,44,0.08)')}`, background:selectedId===g.id?(isDark?'rgba(125,249,255,0.10)':'rgba(70,130,255,0.10)'):(isDark?'rgba(0,0,0,0.18)':'rgba(255,255,255,0.72)'), padding:6, cursor:'pointer', textAlign:'left' }}>
                    {g.coverUrl?<img src={g.coverUrl} alt="" style={{ width:'100%', height:48, objectFit:'cover', borderRadius:6 }}/>:<div style={{ width:'100%', height:48, borderRadius:6, background:isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)', display:'grid', placeItems:'center', fontSize:11 }}>◐</div>}
                    <div style={{ fontFamily:'var(--crystal-mono)', fontSize:9, marginTop:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:isDark?'rgba(230,244,255,0.88)':'#1a2a52' }}>{g.name.slice(0,14)}</div>
                    {g.lastPlayedLabel && <div style={{ fontFamily:'var(--crystal-mono)', fontSize:8, opacity:.52 }}>{g.lastPlayedLabel}</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEmptyDriveState ? (
            <div style={{ position:'relative', zIndex:1, minHeight:180, borderRadius:14, border:`1px dashed ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.12)'}`, background:isDark?'linear-gradient(145deg, rgba(22,24,28,0.86), rgba(18,20,24,0.72))':'linear-gradient(145deg, rgba(255,255,255,0.86), rgba(242,245,248,0.86))', display:'grid', placeItems:'center', padding:18, textAlign:'center' }}>
              <div style={{ width:86, height:86, borderRadius:18, background:isDark?'radial-gradient(120% 120% at 30% 20%, #2a2e36, #1a1e24 60%, #13161b)':'radial-gradient(120% 120% at 30% 20%, #f8fafc, #e8edf3 62%, #dfe6ee)', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(18,26,44,0.08)'}`, display:'grid', placeItems:'center' }}>
                <span style={{ fontSize:26, opacity:0.7 }}>💾</span>
              </div>
              <div style={{ marginTop:12, fontFamily:'var(--crystal-display)', fontSize:13, fontWeight:700, color:isDark?'#e6f0ff':'#1a2a4a' }}>Connect your library drive</div>
              <div style={{ marginTop:6, fontFamily:'var(--crystal-mono)', fontSize:10.5, opacity:.68, maxWidth:220, color:isDark?'rgba(230,244,255,0.68)':'rgba(18,26,44,0.68)' }}>
                Plug in your <span style={{ color:visual.accent, fontWeight:700 }}>D:\Emulation</span> external drive to browse {fullName}.
              </div>
              {onRefresh && <button onClick={onRefresh} style={{ marginTop:12, borderRadius:999, padding:'7px 14px', fontFamily:'var(--crystal-mono)', fontSize:10, fontWeight:700, border:`1px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(18,26,44,0.12)'}`, background:isDark?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.92)', color:isDark?'#eef7ff':'#16213e', cursor:'pointer' }}>↺ Refresh</button>}
            </div>
          ) : (
            <div style={{ position:'relative' }}>
              <GameBrowserList theme={theme} systemId={systemId} games={games} selectedId={selectedId} onSelect={onSelect} />
              {/* Backlog marks overlay hint */}
              {backlogSet.size>0 && <div style={{ position:'absolute', top:-22, right:0, fontFamily:'var(--crystal-mono)', fontSize:8, opacity:0.5 }}>backlog {backlogSet.size}</div>}
            </div>
          )}

          <section className="library-details" style={{ minHeight:0, overflow:'auto', position:'relative', zIndex:1 }}>
            <SelectedGameContext theme={theme} systemId={systemId} game={selectedGame} mediaResolving={mediaResolving} onLaunch={onLaunch} onToggleFavorite={onToggleFavorite} onMedia={onMedia} onDiscover={onDiscover} safeMode={safeMode} onSafeModeBlocked={onSafeModeBlocked} />
            {/* Y hold + Backlog buttons */}
            <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
              <button onClick={()=>handleTogglePinned()} title="Hold Y 600ms to pin (max 5) – Now Playing" style={{ appearance:'none', borderRadius:999, padding:'5px 10px', fontFamily:'var(--crystal-mono)', fontSize:9, border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, background:isDark?'rgba(125,249,255,0.08)':'rgba(70,130,255,0.08)', color:isDark?'#bafcff':'#2a4d9e', cursor:'pointer' }}>
                {collections?.pinned?.find(p=> `${p.system_id}:${p.rom_basename}`===`${systemId}:${(selectedGame as any)?.rom_basename}`) ? '📌 Unpin [Y hold]' : '📌 Pin [Y hold]'}
              </button>
              <button onClick={()=>handleToggleBacklog()} title="Backlog queued toggle" style={{ appearance:'none', borderRadius:999, padding:'5px 10px', fontFamily:'var(--crystal-mono)', fontSize:9, border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.72)', color:isDark?'#eef7ff':'#16213e', cursor:'pointer' }}>
                {backlogSet.has(`${systemId.toLowerCase()}::${String((selectedGame as any)?.rom_basename||'').toLowerCase()}`) ? '✓ Queued Backlog' : '+ Backlog'}
              </button>
            </div>
          </section>
        </div>

        <LibraryHero theme={theme} systemId={systemId} selectedCoverUrl={selectedGame?.coverUrl} selectedTitle={selectedGame?.name} />
      </div>

      <style>{`
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
        @keyframes library-arrive { from { opacity:0; transform:translate3d(-18px,0,0);} to { opacity:1; transform:none;} }
        .golden-library.v85 .library-left { animation: library-arrive 420ms cubic-bezier(.2,.8,.2,1) both; }
        .golden-library.v85 .game-browser-list button { position:relative; }
        .golden-library.v85 .game-browser-list button[data-selected="1"]::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:3px; border-radius:4px; background:var(--library-accent); box-shadow:0 0 18px var(--library-accent); }
        .library-left { scrollbar-width:thin; }
        .library-left::-webkit-scrollbar { width:6px; }
        .library-left::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.12); border-radius:999px; }
      `}</style>
    </div>
  )
}
export default LibraryView
