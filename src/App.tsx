import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
import { listGames, listAllGames, getFavorites, getRecentlyPlayed } from './runtime/backend'

function AppInner() {
  const { config, isExample, isRealMachine, loading: machineLoading, error: machineError, validationErrors, blockingError } = useMachineConfig() as any
  const { theme, toggle, manifest, resolver, manifestLoading } = useThemeAssets()
  const [selected, setSelected] = useState<string>('ps2')
  const [view, setView] = useState<View>('systems')
  const carouselRef = useRef<HTMLDivElement>(null)
  const [showGuides, setShowGuides] = useState(false)

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
  const logoUrl = assets?.logo
  const isExampleData = isExample

  const stageConfig = useMemo(() => {
    return configForSystem(selected, fullName)
  }, [selected, fullName])

  useEffect(() => {
    if (systemsForUI.length && !systemsForUI.find(s => s.id === selected)) {
      setSelected(systemsForUI[0].id)
    }
  }, [systemsForUI]) // eslint-disable-line

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const active = el.querySelector(`[data-id="${selected}"]`) as HTMLElement | null
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selected])

  const systemIds = useMemo(()=> systemsForUI.map(s=>s.id), [systemsForUI])
  const onNavigate = useViewNavigation({ view, systemIds, selected, setSelected, setView })
  useSemanticInput(onNavigate)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) setShowGuides(false)
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
            Truth-only: MachineConfig loaded (isExample={String(isExample)}, isRealMachine={String(isRealMachine)}, populatedSystemCount={String((config as any)?.populatedSystemCount ?? 0)}, systems={String((config as any)?.systems?.length ?? 0)}) but `getPopulatedSystems()` = 0.
            <br/>Theme artwork contains many system icons, but theme must NEVER create machine systems. Verify `romDirectory` existence and `matchingRomFileCount` on the real machine, or check machine-config/example generation.
          </div>
          <div style={{ marginTop:12, display:'flex', gap:8 }}>
            <button onClick={()=>window.location.reload()} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>Reload</button>
            <button onClick={()=>setShowGuides(v=>!v)} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)', fontSize:11 }}>Toggle guides</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`fullscreen-root ${theme}-theme`} style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', background:'#0a0a0f' }}>
      <SystemStage config={{ ...stageConfig, background: { url:bgUrl }}} theme={theme} showGuides={showGuides} backgroundUrl={bgUrl}>
        <div className="top-bar" style={{ position:'absolute', top:0, left:0, right:0, zIndex:20, display:'flex', justifyContent:'space-between', padding:'18px 22px', pointerEvents:'auto' }}>
          <div className="wordmark" style={{ fontFamily:'var(--crystal-display)', fontSize:18, letterSpacing:'-0.02em', color:'var(--crystal-ink)' }}>
            crystal <span style={{ fontWeight:400, letterSpacing:'-0.01em', opacity:0.9 }}>frontend</span>
            <small style={{ marginLeft:12, fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.6 }}>
              {isRealMachine ? 'ROG Ally X • real machine' : isExample ? 'EXAMPLE manifest • dev' : 'manifest loading'} • {systemsForUI.length} systems
            </small>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="pill-btn" onClick={toggle} style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', color:'var(--crystal-ink)', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {theme==='dark' ? 'Light' : 'Dark'}
            </button>
            <button className="pill-btn" onClick={()=>setShowGuides(v=>!v)} style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', color:'var(--crystal-ink)', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {showGuides ? 'Hide guides' : 'Guides'}
            </button>
            <button className="pill-btn" onClick={()=>setView(v=> v==='allgames' ? 'systems' : 'allgames')} style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', color:'var(--crystal-ink)', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {view==='allgames' ? 'Systems' : 'All Games'}
            </button>
            <button className="pill-btn" onClick={()=>setView(v=> v==='settings' ? 'systems' : 'settings')} style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', color:'var(--crystal-ink)', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {view==='settings' ? 'Back' : 'Settings'}
            </button>
          </div>
        </div>

        <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column' }}>
          {view==='systems' && (
            <div className="stage" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:'0 22px 18px' }}>
              <div className="logo-stage" style={{ height:120, display:'grid', placeItems:'center', marginBottom:8 }}>
                {logoUrl ? <img src={logoUrl} alt={`${fullName} logo`} style={{ maxHeight:96, maxWidth:420, filter:'drop-shadow(0 8px 24px rgba(0,0,0,0.6))', transform:'translateZ(0)' }} /> : <div style={{ opacity:0.5, fontSize:12 }}>{fullName}</div>}
              </div>
              <h1 className="system-title" style={{ fontFamily:'var(--crystal-display)', fontSize:28, fontWeight:500, color:'var(--crystal-ink)', margin:'0 0 6px', letterSpacing:'-0.02em' }}>
                {selected === 'auto-allgames' ? <>All <span style={{ fontWeight:400 }}>Games</span></> : <><span style={{ fontWeight:600 }}>{fullName}</span> <span style={{ opacity:0.6, fontSize:14, fontFamily:'var(--crystal-mono)' }}>{selected}</span></>}
              </h1>
              <div className="system-meta" style={{ display:'flex', gap:10, fontSize:11, color:'var(--crystal-ink-dim)', fontFamily:'var(--crystal-mono)' }}>
                {currentSystem ? (
                  <>
                    <span>{currentSystem.matchingRomFileCount} ROMs • {currentSystem.validExtensions.slice(0,6).join(' ')} </span>
                    <span>• {currentSystem.launchSelection.selectedLabel}</span>
                    {isExampleData && <span style={{ color:'#ffb86a' }}>• example data visible</span>}
                  </>
                ) : <span>System id: {selected} • no machine data</span>}
              </div>

              <div className="carousel" ref={carouselRef} style={{ marginTop:14, display:'flex', gap:10, overflowX:'auto', scrollbarWidth:'none', paddingBottom:6 }}>
                {systemsForUI.map(s => {
                  const icon = resolver.getCarouselIcon(s.id)
                  const isActive = selected===s.id
                  return (
                    <div key={s.id} data-id={s.id} className={`carousel-item ${isActive?'active':''}`} onClick={()=>setSelected(s.id)}
                      style={{ flex:'0 0 auto', width:84, cursor:'pointer', opacity: isActive?1:0.72, border: isActive? '1px solid var(--crystal-line-strong)':'1px solid transparent', borderRadius:10, padding:8, background: isActive? 'rgba(255,255,255,0.06)':'rgba(255,255,255,0.02)' }}>
                      <div className="icon-well" style={{ width:'100%', height:48, display:'grid', placeItems:'center' }}>
                        {icon ? <img src={icon} alt={s.id} loading="lazy" style={{ maxWidth:'100%', maxHeight:40 }} /> : <span style={{ fontSize:10 }}>{s.id.slice(0,2)}</span>}
                      </div>
                      <div className="carousel-label" style={{ marginTop:6, fontSize:10, textAlign:'center', color:'var(--crystal-ink)' }}>{s.id}</div>
                      <div style={{ fontSize:9, textAlign:'center', color:'var(--crystal-ink-dim)' }}>{ (s as MachineSystem).fullName ? (s as MachineSystem).fullName.split(' ').slice(-1)[0] : '' }</div>
                    </div>
                  )
                })}
              </div>

              <div className="bottom-hint" style={{ marginTop:10, display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--crystal-ink-faint)', fontFamily:'var(--crystal-mono)' }}>
                <span>← → / A/D to switch • Enter to open library • F favorites • R recent • No fake counts</span>
                <span>Crystal Frontend • {isRealMachine ? 'real machine' : isExample ? 'example manifest – dev sanitized' : ''}</span>
              </div>
            </div>
          )}

          {view==='library' && currentSystem && config && (
            <SystemLibraryView system={currentSystem} config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} />
          )}

          {view==='settings' && (
            <SettingsView onClose={()=>setView('systems')} isExample={isExample} isRealMachine={isRealMachine} systems={systemsForUI} />
          )}

          {view==='allgames' && config && (
            <CollectionView mode="all" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} />
          )}
          {view==='favorites' && config && (
            <CollectionView mode="favorites" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} />
          )}
          {view==='recent' && config && (
            <CollectionView mode="recent" config={config as MachineConfig} onBack={()=>setView('systems')} theme={theme} isRealMachine={isRealMachine} />
          )}
        </div>
      </SystemStage>
    </div>
  )
}

// ---------- System Library (real ROM list) ----------

function SystemLibraryView({ system, config, onBack, theme, isRealMachine }: { system: MachineSystem, config: MachineConfig, onBack:()=>void, theme:'light'|'dark', isRealMachine:boolean }) {
  void theme
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
        // Browser dev – truth-only: do not fabricate from matchingRomFileCount
        if (cancelled) return
        setGames([])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return ()=>{ cancelled=true }
  }, [system.id, isTauri, isRealMachine])

  // Controller navigation for game list – local handler overriding global directional noop
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

  // Local semantic input for library – second listener, runs alongside global (global noops directional)
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
      // Success – backend spawned detached, frontend stays alive
    } catch (e:any) {
      setLaunchError(e?.message || String(e))
    } finally {
      setLaunching(null)
    }
  }, [config, system])

  const mediaSummary = useMemo(()=> {
    const entries = Object.entries(system.media||{}).map(([type, c]: any)=> ({ type, fileCount: c.fileCount, exists:c.exists }))
    return entries
  }, [system])

  return (
    <div style={{ flex:1, padding:'88px 22px 22px', display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontSize:22, fontWeight:500, color:'var(--crystal-ink)' }}>{system.fullName} <span style={{ opacity:0.6, fontFamily:'var(--crystal-mono)', fontSize:12 }}>{system.id}</span></h2>
        <button onClick={onBack} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Back</button>
      </div>
      <div style={{ display:'flex', gap:10, fontSize:11, opacity:0.7, fontFamily:'var(--crystal-mono)' }}>
        <span>ROM dir: {system.romDirectory.replace(/^[A-Z]:\\Users\\[^\\]+/i,'~')}</span>
        <span>• {system.matchingRomFileCount} files audited</span>
        <span>• cmd: {system.launchSelection.selectedLabel}</span>
        <span style={{ color: system.launchSelection.status==='STATICALLY_RESOLVED' ? '#8ef0a4' : '#ffb86a' }}>• {system.launchSelection.status}</span>
        {isRealMachine && isTauri && games && <span style={{ color:'var(--crystal-electric)' }}>• {games.length} real ROMs</span>}
      </div>

      {launchError && (
        <div style={{ fontSize:11, color:'#ff7b7b', background:'rgba(255,107,107,0.08)', border:'1px solid rgba(255,107,107,0.25)', padding:'8px 12px', borderRadius:8, fontFamily:'var(--crystal-mono)' }}>
          Launch blocked: {launchError}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:14, flex:1, overflow:'hidden' }}>
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
                <div key={g.id} onClick={()=>{ setSelectedIdx(i); handleLaunch(g) }} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', borderRadius:8, cursor:'pointer', background: i===selectedIdx?'rgba(125,249,255,0.09)':'rgba(255,255,255,0.02)', border:i===selectedIdx?'1px solid rgba(125,249,255,0.18)':'1px solid transparent' }}>
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
        <div style={{ background:'rgba(0,0,0,0.28)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12, overflowY:'auto' }}>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:8, fontFamily:'var(--crystal-mono)' }}>Media summary (from machine JSON)</div>
          {mediaSummary.map((m:any)=>(
            <div key={m.type} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0', fontFamily:'var(--crystal-mono)' }}>
              <span>{m.type}</span><span>{m.fileCount}</span>
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>Valid ext: {system.validExtensions.join(' ')}</div>
          <div style={{ marginTop:8, fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>Commands: {system.commands.map(c=>c.label).join(' • ')}</div>
          <div style={{ marginTop:10, fontSize:10, opacity:0.7, fontFamily:'var(--crystal-mono)' }}>
            Controls: ↑↓ choose • Enter launch • Esc back – controller-first, no mouse required.
          </div>
        </div>
      </div>
    </div>
  )
}

function CollectionView({ mode, config, onBack, isRealMachine, theme }: { mode:'all'|'favorites'|'recent', config: MachineConfig, onBack:()=>void, isRealMachine:boolean, theme:'light'|'dark' }) {
  void theme
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
        // launch
        const sys = config.systems.find(s=>s.id===g.system_id)
        if (!sys){ setLaunchErr('System not in config'); return }
        const req = resolveLaunchRequest(config as any, { systemId:g.system_id, romPath:g.rom_path, selectedCommandLabel: sys.launchSelection.selectedLabel })
        if (req.ok === false){ setLaunchErr(req.reason); return }
        getLauncherBridge().launch(req.backendRequest).catch((e:any)=>setLaunchErr(e?.message||String(e)))
      }
    }
  }, [games, idx, onBack, config])
  useSemanticInput(onNav as any)

  const title = mode==='all'?'All Games': mode==='favorites'?'Favorites':'Recently Played'

  return (
    <div style={{ flex:1, padding:'88px 22px 22px', display:'flex', flexDirection:'column', gap:12, color:'var(--crystal-ink)' }}>
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

function SettingsView({ onClose, isExample, isRealMachine, systems }: { onClose:()=>void, isExample:boolean, isRealMachine:boolean, systems:any[] }) {
  const isTauri = isTauriEnvironment()
  return (
    <div style={{ padding:'88px 22px 22px', maxWidth:680 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontWeight:500, color:'var(--crystal-ink)' }}>Settings / V6 Runtime</h2>
        <button onClick={onClose} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Close</button>
      </div>
      <div style={{ marginTop:14, fontSize:12, opacity:0.8, lineHeight:1.6, color:'var(--crystal-ink-dim)', fontFamily:'var(--crystal-mono)' }}>
        <div>Machine: {isRealMachine ? 'Real ROG Ally X – machine-local manifest via get_machine_config (Tauri)' : isExample ? 'SANITIZED EXAMPLE – 5 systems (browser dev)' : 'No machine loaded' }</div>
        <div>Mode: {isTauri ? 'Tauri installed (V6 genuine runtime)' : 'Browser dev (sanitized fixtures only)' }</div>
        <div>Systems: {systems.length}</div>
        <div>V6: get_machine_config never falls back to example in Tauri – blocking error if missing.</div>
        <div>V6: ROM enumeration respects validExtensions – no fabrication – gamelist.xml join by basename – preserves ROM path exactly.</div>
        <div>V6: Media verification checks FS existence backend – covers/physicalmedia/screenshots/titlescreens/videos/marquees/miximages.</div>
        <div>V6: Launch backend owns find-rule resolution, placeholder substitution, wd, quoting, spawn detached – unknown ES-DE semantics remain blocked.</div>
        <div>V6: Return flow – frontend remains alive after emulator exit (spawn, no wait).</div>
        <div>V6: Controller flow – Crystal open → system → real game → confirm → launch (no mouse).</div>
        <div style={{ marginTop:12, color:'var(--crystal-electric)', border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', padding:'8px 12px', borderRadius:8 }}>
          GBA.mGBA / PS2.PCSX2 / 3DS.Azahar prioritized launch-ready; Xbox360 %INJECT% and Steam %OS-SHELL% remain blocked with explicit capability error.
        </div>
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
