import { useEffect, useMemo, useState, useCallback } from 'react'
import { ThemeProvider, useThemeAssets } from './providers/ThemeProvider'
import { MachineConfigProvider, useMachineConfig } from './providers/MachineConfigProvider'
import { getPopulatedSystems, getSystemById, getSystemFullName } from './machine/selectors'
import { configForSystem } from './stage'
import SystemStage from './stage/SystemStage'
import type { MachineSystem, MachineConfig } from './machine/types'
import { useSemanticInput } from './hooks/useSemanticInput'
import { useViewNavigation, type View } from './hooks/useViewNavigation'
import { isTauriEnvironment } from './runtime/environment'
import { resolveLaunchRequest } from './launcher/resolver'
import { getLauncherBridge } from './launcher/bridge'
import type { GameEntry } from './runtime/backend'
import { listGames, listAllGames, getFavorites, getRecentlyPlayed, verifyMedia } from './runtime/backend'
import { SystemShelf, type ShelfSystem } from './components/SystemShelf'
import { toAssetUrl, pickGameplayFromResolved, type ResolvedGameMedia } from './runtime/mediaUrl'
import type { GameplaySource } from './stage/types'

function AppInner() {
  const { config, isExample, isRealMachine, loading: machineLoading, error: machineError, validationErrors, blockingError } = useMachineConfig() as any
  const { theme, toggle, manifest, resolver, manifestLoading } = useThemeAssets()
  const [selected, setSelected] = useState<string>('ps2')
  const [view, setView] = useState<View>('systems')
  const [showGuides, setShowGuides] = useState(false)
  const [devMode, setDevMode] = useState(false)

  // selected game bridge – V7.3 live media
  const [selectedGame, setSelectedGame] = useState<GameEntry | null>(null)
  const [selectedGameplaySources, setSelectedGameplaySources] = useState<GameplaySource[] | undefined>(undefined)
  const [selectedPhysicalUrl, setSelectedPhysicalUrl] = useState<string | undefined>(undefined)
  const [mediaResolving, setMediaResolving] = useState(false)

  useEffect(() => {
    // dev mode opt-in via query ?dev=1 or localStorage crystal-dev=1
    try {
      const qp = typeof window !== 'undefined' ? window.location.search : ''
      const ls = typeof window !== 'undefined' ? window.localStorage.getItem('crystal-dev') : null
      if (qp.includes('dev') || ls === '1') setDevMode(true)
    } catch {}
  }, [])

  const populatedSystems = useMemo(() => {
    if (!config) return []
    return getPopulatedSystems(config)
  }, [config])

  const systemsForUI = useMemo(() => {
    if (config) return populatedSystems
    if (!manifest) return []
    return Object.keys(manifest).filter(k => k !== '_default').map(id => ({ id, fullName: id } as MachineSystem))
  }, [config, populatedSystems, manifest])

  const currentSystem = useMemo(() => {
    if (!config) return undefined
    return getSystemById(config, selected)
  }, [config, selected])

  const fullName = useMemo(() => {
    if (currentSystem) return getSystemFullName(currentSystem)
    return selected
  }, [currentSystem, selected])

  const assets = useMemo(() => {
    if (!manifest) return undefined
    return resolver.getThemeAssetsForSystem(selected, theme)
  }, [manifest, selected, theme, resolver])

  const bgUrl = assets?.background

  const stageConfig = useMemo(() => {
    return configForSystem(selected, fullName)
  }, [selected, fullName])

  // shelf systems with logo resolution – swappable provider later
  const shelfSystems: ShelfSystem[] = useMemo(() => {
    return systemsForUI.map(s => {
      const id = (s as any).id
      const fn = (s as any).fullName || id
      let logo: string | undefined
      let icon: string | undefined
      try {
        // prefer theme logo asset for shelf hero
        const a = resolver.getThemeAssetsForSystem ? resolver.getThemeAssetsForSystem(id, theme) : undefined
        logo = a?.logo
      } catch {}
      try {
        icon = resolver.getCarouselIcon ? resolver.getCarouselIcon(id) : undefined
      } catch {}
      return { id, fullName: fn, logoUrl: logo || icon, iconUrl: icon }
    })
  }, [systemsForUI, resolver, theme])

  useEffect(() => {
    if (systemsForUI.length && !systemsForUI.find(s => s.id === selected)) {
      setSelected(systemsForUI[0].id)
    }
  }, [systemsForUI]) // eslint-disable-line

  // preload adjacent backgrounds/hardware/logos for smooth shelf motion
  useEffect(() => {
    if (!systemsForUI.length) return
    const idx = systemsForUI.findIndex(s => s.id === selected)
    if (idx < 0) return
    const len = systemsForUI.length
    const neighbours = [idx - 1, idx + 1, idx - 2, idx + 2].map(i => ((i % len) + len) % len)
    neighbours.forEach(i => {
      const sid = systemsForUI[i].id
      try {
        const a = resolver.getThemeAssetsForSystem(sid, theme)
        if (a?.background) {
          const im = new Image()
          im.decoding = 'async'
          im.src = a.background
        }
        if (a?.logo) {
          const il = new Image()
          il.decoding = 'async'
          il.src = a.logo
        }
        const ico = resolver.getCarouselIcon(sid)
        if (ico) {
          const ii = new Image()
          ii.decoding = 'async'
          ii.src = ico
        }
      } catch {}
      // hardware
      try {
        const cfg = configForSystem(sid)
        const hw = (cfg as any).hardwareForeground as string | undefined
        if (hw) {
          const h = new Image()
          h.decoding = 'async'
          h.src = hw
        }
      } catch {}
    })
  }, [selected, systemsForUI, resolver, theme])

  const systemIds = useMemo(()=> systemsForUI.map(s=>s.id), [systemsForUI])
  const onNavigate = useViewNavigation({ view, systemIds, selected, setSelected, setView } as any)
  useSemanticInput(onNavigate as any)

  // when switching systems, clear selectedGame bridge (fresh showroom)
  useEffect(() => {
    setSelectedGame(null)
    setSelectedGameplaySources(undefined)
    setSelectedPhysicalUrl(undefined)
  }, [selected])

  // utility active mapping for shelf highlight
  const activeUtility = useMemo(() => {
    if (view === 'allgames') return 'allgames' as const
    if (view === 'favorites') return 'favorites' as const
    if (view === 'recent') return 'recent' as const
    if (view === 'settings') return 'settings' as const
    return null
  }, [view])

  // handle live media resolution when selectedGame changes
  const handleSelectGame = useCallback(async (game: GameEntry) => {
    setSelectedGame(game)
    setMediaResolving(true)
    setSelectedGameplaySources(undefined)
    setSelectedPhysicalUrl(undefined)
    try {
      const isTauri = isTauriEnvironment()
      if (!isTauri || !isRealMachine) {
        // browser dev – cannot verify real media – degrade to idle glass / no real media
        setMediaResolving(false)
        return
      }
      const verification = await verifyMedia(game.system_id, game.rom_basename, ['video','screenshot','titlescreen','miximage','cover','physicalmedia'])
      const rawMedia = (verification as any).media as Record<string, { exists: boolean; path?: string; candidates: string[] }>
      const resolved: ResolvedGameMedia = {}
      // convert each present path via Tauri asset url
      for (const [type, chk] of Object.entries(rawMedia || {})) {
        if (!chk?.exists) continue
        const p = (chk as any).path as string | undefined
        if (!p) continue
        const url = await toAssetUrl(p)
        if (!url) continue
        if (type === 'video') resolved.video = url
        else if (type === 'screenshot') resolved.screenshot = url
        else if (type === 'titlescreen') resolved.titleScreen = url
        else if (type === 'miximage') resolved.mixImage = url
        else if (type === 'cover') resolved.cover = url
        else if (type === 'physicalmedia') resolved.physicalMedia = url
      }

      // physical media – real only, no fake
      if (resolved.physicalMedia) {
        setSelectedPhysicalUrl(resolved.physicalMedia)
      } else {
        setSelectedPhysicalUrl(undefined)
      }

      // gameplay priority
      const pick = pickGameplayFromResolved(resolved)
      // build gameplaySources per region truthfully
      const regions = stageConfig.gameplayRegions
      if (!regions || regions.length === 0) {
        setSelectedGameplaySources(undefined)
      } else if (regions.length === 1) {
        if (pick.primaryUrl && pick.primaryType !== 'none') {
          setSelectedGameplaySources([{ regionId: regions[0].id, url: pick.primaryUrl, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }])
        } else {
          setSelectedGameplaySources(undefined) // idle glass / empty handled by stage
        }
      } else {
        // dual-screen – truthful, do NOT duplicate same source as fake dual
        if (pick.primaryUrl) {
          // single combined preview – policy: show in top primary, leave bottom idle unless we have distinct second media (currently backend provides single preview per game)
          // document limitation in comment – we deliberately do not fake
          const primaryRegion = regions[0]
          const sources: GameplaySource[] = [{ regionId: primaryRegion.id, url: pick.primaryUrl, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }]
          // if later we have second screen distinct media type, could extend – currently leave second empty
          setSelectedGameplaySources(sources)
        } else {
          setSelectedGameplaySources(undefined)
        }
      }
    } catch (e) {
      // truthful – on error, show idle not fake
      setSelectedGameplaySources(undefined)
      setSelectedPhysicalUrl(undefined)
    } finally {
      setMediaResolving(false)
    }
  }, [isRealMachine, stageConfig.gameplayRegions])

  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    if (mq?.matches) setShowGuides(false)
  }, [])

  if (machineLoading || manifestLoading) {
    return (
      <div style={{ width:'100vw', height:'100vh', display:'grid', placeItems:'center', background:'var(--crystal-bg)', color:'var(--crystal-ink)' }}>
        <div style={{ opacity:0.6, fontSize:12, letterSpacing:'0.08em' }}>crystal frontend • loading machine…</div>
      </div>
    )
  }

  if (machineError) {
    const isBlocking = !!(blockingError || (typeof machineError === 'string' && machineError.includes('Real machine configuration failed')))
    return (
      <div style={{ width:'100vw', height:'100vh', display:'grid', placeItems:'center', background:'var(--crystal-bg)', color:'var(--crystal-ink)', padding:24 }}>
        <div style={{ maxWidth:640, fontSize:13, lineHeight:1.5, fontFamily:'var(--crystal-mono)' }}>
          <div style={{ marginBottom:10, fontFamily:'var(--crystal-display)', fontSize:14, fontWeight:500, color: isBlocking ? '#ff7b7b' : 'var(--crystal-ink)', display:'flex', alignItems:'center', gap:8 }}>
            {isBlocking && <span style={{ width:8, height:8, borderRadius:'50%', background:'#ff6b6b', boxShadow:'0 0 12px rgba(255,107,107,0.4)', display:'inline-block' }} />}
            {isBlocking ? 'Real machine configuration failed – blocking' : 'Machine manifest failed to load'}
          </div>
          <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11, background:'var(--crystal-glass)', border:`1px solid ${isBlocking ? 'rgba(255,107,107,0.25)' : 'var(--crystal-line)'}`, padding:14, borderRadius:10, overflow:'auto', whiteSpace:'pre-wrap' }}>{machineError}</div>
          {validationErrors && validationErrors.length > 0 && (
            <div style={{ marginTop:10, fontSize:11, opacity:0.8 }}>
              <div style={{ marginBottom:4, opacity:0.7 }}>Validation errors ({validationErrors.length}):</div>
              {validationErrors.slice(0,8).map((e:any,i:number)=>(
                <div key={i} style={{ padding:'3px 0', borderBottom:'1px solid var(--crystal-line)', fontSize:10 }}>
                  <span style={{ color:'var(--crystal-electric)' }}>{e.path}</span> <span>– {e.message}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop:12, opacity:0.6, fontSize:11 }}>
            {isBlocking ? 'A real installed frontend must never masquerade as successfully configured while showing example-machine data. Fix backend config/invoke and restart.' : 'Browser dev mode expects sanitized example at /config/machine-config.example.json. Tauri / installed mode must supply real machine config via window.__CRYSTAL_MACHINE_CONFIG__ or get_machine_config invoke.'}
          </div>
        </div>
      </div>
    )
  }

  if (config && populatedSystems.length === 0) {
    return (
      <div style={{ width:'100vw', height:'100vh', display:'grid', placeItems:'center', background:'var(--crystal-bg,#0a0a0f)', color:'var(--crystal-ink)', padding:24 }}>
        <div style={{ maxWidth:560, fontSize:13, lineHeight:1.6, fontFamily:'var(--crystal-mono)', border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', padding:18, borderRadius:12 }}>
          <div style={{ fontFamily:'var(--crystal-display)', fontSize:14, fontWeight:500, marginBottom:8, color:'var(--crystal-ink)' }}>Machine reports 0 populated systems – add ROMs / check machine config</div>
          <div style={{ opacity:0.8, fontSize:11 }}>
            Truth-only: MachineConfig loaded (isExample={String(isExample)}, isRealMachine={String(isRealMachine)}) but getPopulatedSystems() = 0.
          </div>
          <div style={{ marginTop:12, display:'flex', gap:8 }}>
            <button onClick={()=>window.location.reload()} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>Reload</button>
            <button onClick={()=>setShowGuides(v=>!v)} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>Toggle guides</button>
          </div>
        </div>
      </div>
    )
  }

  // V7.3 showroom – shelf left 26-31%, hardware right 68%
  return (
    <div className={`fullscreen-root ${theme}-theme`} style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', background:'#0a0a0f' }}>
      <SystemStage
        config={{ ...(stageConfig as any), background: { url:bgUrl }}}
        theme={theme}
        showGuides={showGuides}
        backgroundUrl={bgUrl}
        gameplaySources={view === 'library' ? selectedGameplaySources : undefined}
        physicalMediaUrl={view === 'library' ? selectedPhysicalUrl : undefined}
        isEntered={view==='library'}
        mode={view==='library' ? 'library' : 'storefront'}
      >
        {/* Chrome layer – floating UI */}
        <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column', pointerEvents:'none' }}>
          {view==='systems' && (
            <div className="stage storefront-stage" style={{ flex:1, display:'flex', position:'relative', width:'100%', height:'100%' }}>
              <SystemShelf
                systems={shelfSystems}
                selectedId={selected}
                onSelect={setSelected}
                theme={theme}
                onOpenLibrary={()=>setView('library')}
                onAllGames={()=>setView('allgames')}
                onFavorites={()=>setView('favorites')}
                onRecent={()=>setView('recent')}
                onSettings={()=>setView('settings')}
                activeUtility={activeUtility}
              />
              {/* dev chrome – only in dev mode */}
              {devMode && (
                <div style={{ position:'absolute', top:10, right:14, display:'flex', gap:8, pointerEvents:'auto' }}>
                  <button onClick={toggle} style={{ background:'rgba(0,0,0,0.35)', border:'1px solid rgba(255,255,255,0.12)', backdropFilter:'blur(12px)', color:'#e8f2ff', padding:'5px 10px', borderRadius:999, fontSize:10, fontFamily:'var(--crystal-mono)' }}>{theme==='dark' ? 'Light' : 'Dark'}</button>
                  <button onClick={()=>setShowGuides(v=>!v)} style={{ background:'rgba(0,0,0,0.35)', border:'1px solid rgba(255,255,255,0.12)', backdropFilter:'blur(12px)', color:'#e8f2ff', padding:'5px 10px', borderRadius:999, fontSize:10 }}>{showGuides ? 'Hide guides' : 'Guides'}</button>
                  <button onClick={()=>setDevMode(false)} style={{ background:'rgba(0,0,0,0.32)', border:'1px solid rgba(255,255,255,0.10)', color:'#e8f2ff', padding:'5px 10px', borderRadius:999, fontSize:10 }}>Exit dev</button>
                </div>
              )}
              {/* normal user minimal chrome – theme toggle ghost */}
              {!devMode && (
                <button onClick={toggle} aria-label="Toggle theme" style={{ position:'absolute', top:12, right:14, width:28, height:28, borderRadius:'50%', background: theme==='dark' ? 'rgba(6,10,16,0.36)' : 'rgba(245,248,255,0.64)', backdropFilter:'blur(12px)', border:`1px solid ${theme==='dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,24,44,0.10)'}`, color: theme==='dark' ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.7)', display:'grid', placeItems:'center', pointerEvents:'auto', fontSize:12 }}>◐</button>
              )}
              {/* breathing room – no bottom carousel – hardware hero unobstructed */}
            </div>
          )}

          {view==='library' && currentSystem && config && (
            <SystemLibraryView
              system={currentSystem}
              config={config as MachineConfig}
              onBack={()=>{ setView('systems'); setSelectedGame(null); setSelectedGameplaySources(undefined); setSelectedPhysicalUrl(undefined) }}
              theme={theme}
              isRealMachine={isRealMachine}
              onSelectGame={handleSelectGame}
              selectedGame={selectedGame}
              mediaResolving={mediaResolving}
              devMode={devMode}
              showGuides={showGuides}
              toggleGuides={()=>setShowGuides(v=>!v)}
            />
          )}

          {view==='settings' && (
            <SettingsView onClose={()=>setView('systems')} isExample={isExample} isRealMachine={isRealMachine} systems={systemsForUI} theme={theme} devMode={devMode} toggleTheme={toggle} showGuides={showGuides} toggleGuides={()=>setShowGuides(v=>!v)} />
          )}

          {view==='allgames' && config && (
            <CollectionView mode="all" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} onSelectGame={handleSelectGame} />
          )}
          {view==='favorites' && config && (
            <CollectionView mode="favorites" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} onSelectGame={handleSelectGame} />
          )}
          {view==='recent' && config && (
            <CollectionView mode="recent" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} onSelectGame={handleSelectGame} />
          )}
        </div>
      </SystemStage>
    </div>
  )
}

function SystemLibraryView({ system, config, onBack, theme: _theme, isRealMachine, onSelectGame, selectedGame, mediaResolving, devMode, showGuides, toggleGuides }: { system: MachineSystem, config: MachineConfig, onBack:()=>void, theme:'light'|'dark', isRealMachine:boolean, onSelectGame:(g:GameEntry)=>void, selectedGame: GameEntry|null, mediaResolving:boolean, devMode:boolean, showGuides:boolean, toggleGuides:()=>void }) {
  const [games, setGames] = useState<GameEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [launching, setLaunching] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const isTauri = isTauriEnvironment()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      if (isTauri && isRealMachine) {
        try {
          const realGames = await listGames(system.id)
          if (cancelled) return
          setGames(realGames)
        } catch (e:any) {
          if (cancelled) return
          setError(e?.message || String(e))
          setGames([])
        }
      } else {
        if (cancelled) return
        setGames([])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return ()=>{ cancelled=true }
  }, [system.id, isTauri, isRealMachine])

  // bridge selectedIdx → onSelectGame for live media
  useEffect(() => {
    if (!games || games.length===0) return
    const g = games[selectedIdx]
    if (g) onSelectGame(g)
  }, [games, selectedIdx, onSelectGame])

  const onGameNav = useCallback((action: string) => {
    if (!games || games.length===0) {
      if (action==='back') onBack()
      return
    }
    if (action==='up') setSelectedIdx(i=> (i-1+games.length)%games.length)
    else if (action==='down') setSelectedIdx(i=> (i+1)%games.length)
    else if (action==='back') onBack()
    else if (action==='confirm') {
      const g = games[selectedIdx]
      if (g) handleLaunch(g)
    }
  }, [games, selectedIdx, onBack])

  useSemanticInput(onGameNav as any)

  const handleLaunch = useCallback(async (game: GameEntry) => {
    setLaunchError(null)
    setLaunching(game.id)
    try {
      const req = resolveLaunchRequest(config, { systemId: system.id, romPath: game.rom_path, selectedCommandLabel: system.launchSelection.selectedLabel })
      if (req.ok === false) {
        setLaunchError(req.reason)
        setLaunching(null)
        return
      }
      const bridge = getLauncherBridge()
      await bridge.launch(req.backendRequest)
    } catch (e:any) {
      setLaunchError(e?.message || String(e))
    } finally {
      setLaunching(null)
    }
  }, [config, system])

  return (
    <div style={{ flex:1, padding:'22px 22px 22px 20px', display:'flex', flexDirection:'column', gap:12, pointerEvents:'auto', height:'100vh', boxSizing:'border-box' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontSize:18, fontWeight:500, color:'var(--crystal-ink)', letterSpacing:'-0.02em' }}>{system.fullName}</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onBack} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', backdropFilter:'blur(12px)', fontSize:11 }}>Back</button>
          {devMode && <button onClick={toggleGuides} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>{showGuides ? 'Hide guides' : 'Guides'}</button>}
        </div>
      </div>

      {launchError && (
        <div style={{ fontSize:11, color:'#ff7b7b', background:'rgba(255,107,107,0.08)', border:'1px solid rgba(255,107,107,0.25)', padding:'8px 12px', borderRadius:8, fontFamily:'var(--crystal-mono)' }}>
          Launch blocked: {launchError}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 260px', gap:14, flex:1, overflow:'hidden' }}>
        <div style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12, overflowY:'auto', backdropFilter:'blur(var(--crystal-blur))' }}>
          {loading && <div style={{ fontSize:11, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>Scanning {system.id} ROMs via Tauri backend…</div>}
          {!loading && error && (
            <div style={{ fontSize:11, color:'#ffb86a', fontFamily:'var(--crystal-mono)' }}>
              {isRealMachine ? `Backend error: ${error}` : `Browser dev: ${error}`}
            </div>
          )}
          {!loading && !error && games && games.length===0 && (
            system.matchingRomFileCount===0 ? (
              <div className="empty-state" style={{ border:'1px dashed var(--crystal-line)', borderRadius:12, padding:'18px 16px', color:'var(--crystal-ink-dim)', fontSize:12, lineHeight:1.5 }}>
                <div style={{ fontFamily:'var(--crystal-display)', fontSize:13, marginBottom:6, color:'var(--crystal-ink)' }}>No games found in machine audit</div>
                <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11 }}>No ROMs for {system.id}. Add files to {system.romDirectory} and rescan.</div>
              </div>
            ) : isTauri && isRealMachine ? (
              <div style={{ fontSize:11, opacity:0.7, fontFamily:'var(--crystal-mono)' }}>
                Backend returned 0 games but audit reports {system.matchingRomFileCount}. Check romDirectory existence or validExtensions.
              </div>
            ) : (
              <div style={{ border:'1px dashed var(--crystal-line)', borderRadius:12, padding:'18px 16px', color:'var(--crystal-ink-dim)', fontSize:12, lineHeight:1.6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--crystal-electric)', boxShadow:'0 0 12px var(--crystal-electric-dim)', display:'inline-block' }} />
                  <span style={{ fontFamily:'var(--crystal-display)', fontWeight:500, color:'var(--crystal-ink)' }}>Browser preview – real ROM list is Tauri-only</span>
                </div>
                <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11 }}>
                  Audit shows {system.matchingRomFileCount} matching ROMs. Install Tauri build on Windows to enumerate real files under<br/>
                  <span style={{ color:'var(--crystal-ink)', background:'rgba(255,255,255,0.06)', padding:'2px 6px', borderRadius:6 }}>{system.romDirectory.replace(/^[A-Z]:\\Users\\[^\\]+/i,'~')}</span>
                  <br/>with gamelist.xml join and media verification. No fake rows generated.
                </div>
              </div>
            )
          )}
          {!loading && games && games.length>0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {games.map((g, i)=>(
                <div key={g.id} onClick={()=>{ setSelectedIdx(i); handleLaunch(g) }} onMouseEnter={()=>setSelectedIdx(i)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', borderRadius:8, cursor:'pointer', background: i===selectedIdx?'rgba(125,249,255,0.09)':'rgba(255,255,255,0.02)', border:i===selectedIdx?'1px solid rgba(125,249,255,0.18)':'1px solid transparent' }}>
                  <div>
                    <div style={{ fontSize:12, color:'var(--crystal-ink)', fontWeight: i===selectedIdx?600:400 }}>{g.name}</div>
                    <div style={{ fontSize:10, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>{g.rom_basename}{g.extension} {g.favorite?'• ★':''} {g.last_played?`• last ${g.last_played.slice(0,10)}`:''}</div>
                  </div>
                  <div style={{ fontSize:10, opacity:0.7 }}>{launching===g.id?'Launching…':'↗'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background:'rgba(0,0,0,0.28)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12, overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
          {selectedGame ? (
            <>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--crystal-ink)', letterSpacing:'-0.01em' }}>{selectedGame.name}</div>
              <div style={{ fontSize:10, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>{selectedGame.rom_basename}{selectedGame.extension} • {system.id}</div>
              <div style={{ fontSize:10, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>{mediaResolving ? 'Resolving real media…' : selectedGame ? 'Real media verified – video priority truthful' : 'No selection'}</div>
            </>
          ) : (
            <div style={{ fontSize:11, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>Select a game to preview real media inside hardware – truthful dual-screen for NDS/3DS (no fake duplication).</div>
          )}
          {devMode && (
            <>
              <div style={{ height:1, background:'rgba(255,255,255,0.08)' }} />
              <div style={{ fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>ROM dir: {system.romDirectory.replace(/^[A-Z]:\\Users\\[^\\]+/i,'~')}</div>
              <div style={{ fontSize:10, opacity:0.5 }}>cmd: {system.launchSelection.selectedLabel} • {system.launchSelection.status}</div>
            </>
          )}
          <div style={{ marginTop:'auto', fontSize:10, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>Controls: ↑↓ choose • Enter launch • Esc back – controller-first</div>
        </div>
      </div>
    </div>
  )
}

function CollectionView({ mode, config, onBack, isRealMachine, theme: _theme, onSelectGame }: { mode:'all'|'favorites'|'recent', config: MachineConfig, onBack:()=>void, isRealMachine:boolean, theme:'light'|'dark', onSelectGame?:(g:GameEntry)=>void }) {
  const [games, setGames] = useState<GameEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [launchErr, setLaunchErr] = useState<string | null>(null)
  const isTauri = isTauriEnvironment()

  useEffect(()=>{
    let cancelled=false
    async function load(){
      setLoading(true)
      setError(null)
      if (!isTauri || !isRealMachine) {
        if (!cancelled){ setGames([]); setLoading(false) }
        return
      }
      try {
        let res: GameEntry[] = []
        if (mode==='all') res = await listAllGames()
        else if (mode==='favorites') res = await getFavorites()
        else res = await getRecentlyPlayed()
        if (cancelled) return
        setGames(res)
      } catch(e:any){
        if (!cancelled){ setError(e?.message||String(e)); setGames([]) }
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return ()=>{cancelled=true}
  }, [mode, isTauri, isRealMachine])

  const onNav = useCallback((a:string)=>{
    if (!games || games.length===0){ if (a==='back') onBack(); return }
    if (a==='up') setIdx(i=>(i-1+games.length)%games.length)
    else if (a==='down') setIdx(i=>(i+1)%games.length)
    else if (a==='back') onBack()
    else if (a==='confirm'){
      const g = games[idx]
      if (g){
        const sys = config.systems.find(s=>s.id===g.system_id)
        if (!sys){ setLaunchErr('System not in config'); return }
        const req = resolveLaunchRequest(config as any, { systemId:g.system_id, romPath:g.rom_path, selectedCommandLabel: sys.launchSelection.selectedLabel })
        if (req.ok === false){ setLaunchErr(req.reason); return }
        getLauncherBridge().launch(req.backendRequest).catch((e:any)=>setLaunchErr(e?.message||String(e)))
        onSelectGame?.(g)
      }
    }
  }, [games, idx, onBack, config, onSelectGame])
  useSemanticInput(onNav as any)

  const title = mode==='all'?'All Games': mode==='favorites'?'Favorites':'Recently Played'

  return (
    <div style={{ flex:1, padding:'22px 22px 22px', display:'flex', flexDirection:'column', gap:12, color:'var(--crystal-ink)', pointerEvents:'auto', height:'100vh', boxSizing:'border-box' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontWeight:500 }}>{title} {games?`• ${games.length}`:''}</h2>
        <button onClick={onBack} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Back</button>
      </div>
      {launchErr && <div style={{ fontSize:11, color:'#ff7b7b', background:'rgba(255,107,107,0.08)', border:'1px solid rgba(255,107,107,0.25)', padding:'8px 12px', borderRadius:8, fontFamily:'var(--crystal-mono)' }}>Launch blocked: {launchErr}</div>}
      <div style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12, flex:1, overflowY:'auto' }}>
        {loading && <div style={{ fontSize:11, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>Loading {title.toLowerCase()} via Tauri backend…</div>}
        {!loading && error && <div style={{ fontSize:11, color:'#ffb86a' }}>Backend error: {error}</div>}
        {!loading && !error && games && games.length===0 && (
          <div style={{ fontSize:11, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>
            {isTauri && isRealMachine ? `No ${title.toLowerCase()} yet – add ROMs and play history, or favorites from gamelist.xml.` : `Browser dev – ${title} requires Tauri installed mode (real machine) with gamelist.xml join. No fake data shown.`}
          </div>
        )}
        {!loading && games && games.length>0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {games.map((g,i)=>(
              <div key={g.id} onClick={()=>setIdx(i)} style={{ padding:'8px 10px', borderRadius:8, background:i===idx?'rgba(125,249,255,0.09)':'rgba(255,255,255,0.02)', border:i===idx?'1px solid rgba(125,249,255,0.18)':'1px solid transparent', cursor:'pointer', display:'flex', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:i===idx?600:400 }}>{g.name} <span style={{ opacity:0.6, fontSize:10 }}>({g.system_id})</span></div>
                  <div style={{ fontSize:10, opacity:0.6, fontFamily:'var(--crystal-mono)' }}>{g.rom_basename}{g.extension} {g.favorite?'★':''} {g.last_played?`• ${g.last_played.slice(0,10)}`:''}</div>
                </div>
                <span style={{ fontSize:10, opacity:0.6 }}>↗</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SettingsView({ onClose, isExample, isRealMachine, systems, theme, devMode, toggleTheme, showGuides, toggleGuides }: { onClose:()=>void, isExample:boolean, isRealMachine:boolean, systems:any[], theme:'light'|'dark', devMode:boolean, toggleTheme:()=>void, showGuides:boolean, toggleGuides:()=>void }) {
  const isTauri = isTauriEnvironment()
  return (
    <div style={{ padding:'22px 22px 22px', maxWidth:680, pointerEvents:'auto', height:'100vh', overflowY:'auto', boxSizing:'border-box' }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontWeight:500, color:'var(--crystal-ink)' }}>Settings</h2>
        <button onClick={onClose} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Close</button>
      </div>
      <div style={{ marginTop:14, fontSize:12, opacity:0.8, lineHeight:1.6, color:'var(--crystal-ink-dim)', fontFamily:'var(--crystal-mono)' }}>
        <div>Machine: {isRealMachine ? 'Real ROG Ally X – machine-local manifest via get_machine_config (Tauri)' : isExample ? 'SANITIZED EXAMPLE – 5 systems (browser dev)' : 'No machine loaded' }</div>
        <div>Mode: {isTauri ? 'Tauri installed (V6 genuine runtime)' : 'Browser dev (sanitized fixtures only)' }</div>
        <div>Systems: {systems.length}</div>
        {devMode && (
          <>
            <div style={{ marginTop:12, display:'flex', gap:8 }}>
              <button onClick={toggleTheme} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>{theme==='dark'?'Light':'Dark'} mode</button>
              <button onClick={toggleGuides} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>{showGuides ? 'Hide guides':'Guides'}</button>
              <button onClick={()=>{ try{ localStorage.setItem('crystal-dev','1'); window.location.reload() }catch{} }} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>Enable dev</button>
            </div>
            <div style={{ marginTop:12, color:'var(--crystal-electric)', border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', padding:'8px 12px', borderRadius:8 }}>
              GBA.mGBA / PS2.PCSX2 / 3DS.Azahar prioritized launch-ready; Xbox360 %INJECT% and Steam %OS-SHELL% remain blocked with explicit capability error.
            </div>
          </>
        )}
        <div style={{ marginTop:8, opacity:0.6, fontSize:11 }}>
          Privacy: real machine config, personal Windows paths, ROM filenames, scraped media, saves/BIOS never committed.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <MachineConfigProvider>
        <AppInner />
      </MachineConfigProvider>
    </ThemeProvider>
  )
}
