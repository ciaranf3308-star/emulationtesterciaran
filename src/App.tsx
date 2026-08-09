import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ThemeProvider, useThemeAssets } from './providers/ThemeProvider'
import { MachineConfigProvider, useMachineConfig } from './providers/MachineConfigProvider'
import { getPopulatedSystems, getSystemById, getSystemFullName } from './machine/selectors'
import { configForSystem } from './stage'
import SystemStage from './stage/SystemStage'
import type { MachineSystem } from './machine/types'
import { useSemanticInput } from './hooks/useSemanticInput'

type View = 'systems' | 'library' | 'allgames' | 'favorites' | 'recent' | 'settings'

function AppInner() {
  const { config, isExample, isRealMachine, loading: machineLoading, error: machineError } = useMachineConfig()
  const { theme, toggle, manifest, resolver, manifestLoading } = useThemeAssets()
  const [selected, setSelected] = useState<string>('ps2')
  const [view, setView] = useState<View>('systems')
  const carouselRef = useRef<HTMLDivElement>(null)
  const [showGuides, setShowGuides] = useState(false)

  // Derive populated systems from machine config (source of truth), not theme
  const populatedSystems = useMemo(() => {
    if (!config) return []
    return getPopulatedSystems(config)
  }, [config])

  // All systems (including those with 0 files but defined) for Systems view? Prefer populated per audit
  const systemsForUI = useMemo(() => {
    if (populatedSystems.length) return populatedSystems
    // fallback to manifest ids only if machine missing (dev without config)
    if (!manifest) return []
    return Object.keys(manifest).filter(k => k !== '_default').map(id => ({ id, fullName: id } as MachineSystem))
  }, [populatedSystems, manifest])

  const currentSystem = useMemo(() => {
    if (!config) return undefined
    return getSystemById(config, selected)
  }, [config, selected])

  const fullName = useMemo(() => {
    if (currentSystem) return getSystemFullName(currentSystem)
    return selected
  }, [currentSystem, selected])

  // Resolve theme assets for selected – graceful fallback, genesis/megadrive distinct
  const assets = useMemo(() => {
    if (!manifest) return undefined
    return resolver.getThemeAssetsForSystem(selected, theme)
  }, [manifest, selected, theme, resolver])

  const bgUrl = assets?.background
  const logoUrl = assets?.logo
  const isExampleData = isExample

  // Stage config: supports single vs dual-screen for DS/3DS
  const stageConfig = useMemo(() => {
    return configForSystem(selected, fullName)
  }, [selected, fullName])

  // Initialize selected from first populated system when machine loads
  useEffect(() => {
    if (systemsForUI.length && !systemsForUI.find(s => s.id === selected)) {
      setSelected(systemsForUI[0].id)
    }
  }, [systemsForUI])

  // Auto-scroll active carousel item into view
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const active = el.querySelector(`[data-id="${selected}"]`) as HTMLElement | null
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selected])

  // Semantic input: controller-first, keyboard adapter, mouse secondary
  const onNavigate = useCallback((action: import('./input/types').NavigationAction) => {
    const ids = systemsForUI.map(s=>s.id)
    const idx = ids.indexOf(selected)
    if (action === 'left' || action === 'up' || action === 'previousSystem') {
      setSelected(ids[(idx-1+ids.length)%ids.length])
    } else if (action === 'right' || action === 'down' || action === 'nextSystem') {
      setSelected(ids[(idx+1)%ids.length])
    } else if (action === 'confirm' && view === 'systems') {
      setView('library')
    } else if (action === 'back' && view === 'library') {
      setView('systems')
    }
  }, [selected, systemsForUI, view])

  useSemanticInput(onNavigate)

  // Dev performance: reduced-motion detection, tab hidden pause
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) setShowGuides(false)
  }, [])

  if (machineLoading || manifestLoading) {
    return (
      <div style={{ width:'100vw', height:'100vh', display:'grid', placeItems:'center', background:'#121214', color:'#f3eee8' }}>
        <div style={{ opacity:0.6, fontSize:12, letterSpacing:'0.08em' }}>crystal frontend • loading machine…</div>
      </div>
    )
  }

  if (machineError) {
    return (
      <div style={{ width:'100vw', height:'100vh', display:'grid', placeItems:'center', background:'#121214', color:'#f3eee8', padding:24 }}>
        <div style={{ maxWidth:520, fontSize:13, lineHeight:1.5 }}>
          <div style={{ marginBottom:8, opacity:0.8 }}>machine manifest failed to load</div>
          <div style={{ fontFamily:'monospace', fontSize:11, background:'rgba(255,255,255,0.06)', padding:12, borderRadius:8, overflow:'auto' }}>{machineError}</div>
          <div style={{ marginTop:12, opacity:0.6 }}>Browser dev mode expects sanitized example at /config/machine-config.example.json</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`fullscreen-root ${theme}-theme`} style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', background:'#0a0a0f' }}>
      {/* SYSTEM STAGE BACKGROUND LAYERS */}
      <SystemStage config={{ ...stageConfig, background: { url:bgUrl }}} theme={theme} showGuides={showGuides} backgroundUrl={bgUrl}>
        {/* UI CHROME IN STAGE */}
        <div className="top-bar" style={{ position:'absolute', top:0, left:0, right:0, zIndex:20, display:'flex', justifyContent:'space-between', padding:'18px 22px', pointerEvents:'auto' }}>
          <div className="wordmark" style={{ fontFamily:'Newsreader, serif', fontSize:18, letterSpacing:'-0.02em', color:'#f3eee8' }}>
            crystal <span style={{ fontWeight:300, fontStyle:'italic', opacity:0.9 }}>frontend</span>
            <small style={{ marginLeft:12, fontFamily:'Fragment Mono', fontSize:10, opacity:0.6 }}>
              {isRealMachine ? 'ROG Ally X • real machine' : isExample ? 'EXAMPLE manifest • dev' : 'manifest loading'} • {systemsForUI.length} systems
            </small>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="pill-btn" onClick={toggle} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', color:'#f3eee8', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {theme==='dark' ? 'Light' : 'Dark'}
            </button>
            <button className="pill-btn" onClick={()=>setShowGuides(v=>!v)} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', color:'#f3eee8', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {showGuides ? 'Hide guides' : 'Guides'}
            </button>
            <button className="pill-btn" onClick={()=>setView(v=> v==='settings' ? 'systems' : 'settings')} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', color:'#f3eee8', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
              {view==='settings' ? 'Back' : 'Settings'}
            </button>
          </div>
        </div>

        {/* MAIN VIEW */}
        <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column' }}>
          {view==='systems' && (
            <div className="stage" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:'0 22px 18px' }}>
              <div className="logo-stage" style={{ height:120, display:'grid', placeItems:'center', marginBottom:8 }}>
                {logoUrl ? <img src={logoUrl} alt={`${fullName} logo`} style={{ maxHeight:96, maxWidth:420, filter:'drop-shadow(0 8px 24px rgba(0,0,0,0.6))', transform:'translateZ(0)' }} /> : <div style={{ opacity:0.5, fontSize:12 }}>{fullName}</div>}
              </div>
              <h1 className="system-title" style={{ fontFamily:'Newsreader, serif', fontSize:28, fontWeight:400, color:'#f3eee8', margin:'0 0 6px', letterSpacing:'-0.02em' }}>
                {selected === 'auto-allgames' ? <>All <span style={{ fontStyle:'italic' }}>Games</span></> : <><span style={{ fontWeight:600 }}>{fullName}</span> <span style={{ opacity:0.6, fontSize:14, fontFamily:'Fragment Mono' }}>{selected}</span></>}
              </h1>
              <div className="system-meta" style={{ display:'flex', gap:10, fontSize:11, color:'rgba(243,238,232,0.6)', fontFamily:'Fragment Mono' }}>
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
                      style={{ flex:'0 0 auto', width:84, cursor:'pointer', opacity: isActive?1:0.72, border: isActive? '1px solid rgba(243,238,232,0.2)':'1px solid transparent', borderRadius:10, padding:8, background: isActive? 'rgba(255,255,255,0.06)':'rgba(255,255,255,0.02)' }}>
                      <div className="icon-well" style={{ width:'100%', height:48, display:'grid', placeItems:'center' }}>
                        {icon ? <img src={icon} alt={s.id} loading="lazy" style={{ maxWidth:'100%', maxHeight:40 }} /> : <span style={{ fontSize:10 }}>{s.id.slice(0,2)}</span>}
                      </div>
                      <div className="carousel-label" style={{ marginTop:6, fontSize:10, textAlign:'center', color:'#f3eee8' }}>{s.id}</div>
                      <div style={{ fontSize:9, textAlign:'center', color:'rgba(243,238,232,0.5)' }}>{ (s as MachineSystem).fullName ? (s as MachineSystem).fullName.split(' ').slice(-1)[0] : '' }</div>
                    </div>
                  )
                })}
              </div>

              <div className="bottom-hint" style={{ marginTop:10, display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(243,238,232,0.45)', fontFamily:'Fragment Mono' }}>
                <span>← → / A/D to switch • Enter to open library • Q/E prev/next • No fake counts</span>
                <span>Crystal Frontend • {isRealMachine ? 'real machine' : isExample ? 'example manifest – replace with machine-local via Tauri' : ''}</span>
              </div>
            </div>
          )}

          {view==='library' && currentSystem && (
            <SystemLibraryView system={currentSystem} onBack={()=>setView('systems')} theme={theme} />
          )}

          {view==='settings' && (
            <SettingsView onClose={()=>setView('systems')} isExample={isExample} isRealMachine={isRealMachine} systems={systemsForUI} />
          )}
          {(view==='allgames' || view==='favorites' || view==='recent') && (
            <div style={{ padding:'88px 22px', color:'#f3eee8' }}>
              <div style={{ fontSize:12, opacity:0.6 }}>{view} – architecture ready, will use metadata domain gamelist.xml parsing (no fake data). Hook up to AllGames / Favorites selectors after metadata parsing implemented.</div>
              <button onClick={()=>setView('systems')} style={{ marginTop:12, padding:'8px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.06)', color:'#f3eee8' }}>Back to systems</button>
            </div>
          )}
        </div>
      </SystemStage>
    </div>
  )
}

function SystemLibraryView({ system, onBack, theme: _theme }: { system: MachineSystem, onBack:()=>void, theme:'light'|'dark' }) {
  void _theme;
  const mediaSummary = useMemo(()=> {
    const entries = Object.entries(system.media||{}).map(([type, c]: any)=> ({ type, fileCount: c.fileCount, exists:c.exists }))
    return entries
  }, [system])
  return (
    <div style={{ flex:1, padding:'88px 22px 22px', display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0, fontFamily:'Newsreader, serif', fontSize:22, fontWeight:400 }}>{system.fullName} <span style={{ opacity:0.6, fontFamily:'Fragment Mono', fontSize:12 }}>{system.id}</span></h2>
        <button onClick={onBack} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#f3eee8' }}>Back</button>
      </div>
      <div style={{ display:'flex', gap:10, fontSize:11, opacity:0.7, fontFamily:'Fragment Mono' }}>
        <span>ROM dir: {system.romDirectory.replace('C:\\\\Users\\\\ciara','~')}</span>
        <span>• {system.matchingRomFileCount} files</span>
        <span>• cmd: {system.launchSelection.selectedLabel}</span>
        <span style={{ color: system.launchSelection.status==='STATICALLY_RESOLVED' ? '#8ef0a4' : '#ffb86a' }}>• {system.launchSelection.status}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:14, flex:1 }}>
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:12, overflowY:'auto' }}>
          <div style={{ fontSize:11, opacity:0.5, marginBottom:8 }}>Games discovered via {system.matchingRomFileCount} matching files – future AllGames view will join gamelist.xml metadata (no fake). ROM quoting handled backend.</div>
          <div style={{ display:'grid', gap:6 }}>
            {Array.from({length: Math.min(system.matchingRomFileCount, 40)}).map((_,i)=> (
              <div key={i} style={{ padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12 }}>{system.id} – game #{i+1} placeholder</span>
                <span style={{ fontSize:10, opacity:0.5 }}>launch via {system.launchSelection.selectedLabel.slice(0,18)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:'rgba(0,0,0,0.28)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:12 }}>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:8 }}>Media summary (from machine JSON, not FS scan yet)</div>
          {mediaSummary.map((m:any)=>(
            <div key={m.type} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0' }}>
              <span>{m.type}</span><span>{m.fileCount}</span>
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:10, opacity:0.5 }}>Valid ext: {system.validExtensions.join(' ')}</div>
          <div style={{ marginTop:8, fontSize:10, opacity:0.5 }}>Commands: {system.commands.map(c=>c.label).join(' • ')}</div>
          <div style={{ marginTop:8, fontSize:10, opacity:0.5 }}>Launch selection source: {(system.launchSelection.source||'').split('\\').pop()}</div>
        </div>
      </div>
    </div>
  )
}

function SettingsView({ onClose, isExample, isRealMachine, systems }: { onClose:()=>void, isExample:boolean, isRealMachine:boolean, systems:any[] }) {
  return (
    <div style={{ padding:'88px 22px 22px', maxWidth:640 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <h2 style={{ margin:0, fontFamily:'Newsreader, serif' }}>Settings / Dev</h2>
        <button onClick={onClose} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#f3eee8' }}>Close</button>
      </div>
      <div style={{ marginTop:14, fontSize:12, opacity:0.7, lineHeight:1.6 }}>
        <div>Machine: {isRealMachine ? 'Real ROG Ally X – machine-local manifest supplied via backend' : isExample ? 'SANITIZED EXAMPLE – no personal paths, 5 systems' : 'No machine loaded' }</div>
        <div>Systems in machine: {systems.length}</div>
        <div>Theme: artwork composable per-field (background from Crystal, future logo/hardware fg from other packs)</div>
        <div>SystemStage: 5 layers – background, gameplay regions (DS/3DS dual requires multiple regions), physical media, hardware fg, chrome. Hardware fg fabrication suppressed until assets exist.</div>
        <div>Input: NavigationAction semantic – keyboard + gamepad (deadzone 0.25, D-pad, repeat 400/120, debounce, connect/disconnect)</div>
        <div>Launch: frontend request {'{'} systemId, romPath, selectedCommandLabel {'}'} {'->'} backend owns find-rule, placeholders, quoting, STARTDIR/EMUDIR/GAMEDIR/BASENAME/INJECT, etc. Xbox/Xbox360 preserved verbatim.</div>
        <div style={{ marginTop:8, color:'#ffb86a' }}>Config files CRYSTAL-MACHINE-AUDIT.md and crystal-machine-config.json are machine-local, never committed – see .gitignore.</div>
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
