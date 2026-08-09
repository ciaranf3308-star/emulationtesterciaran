import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeProvider, useThemeAssets } from './providers/ThemeProvider'
import { MachineConfigProvider, useMachineConfig } from './providers/MachineConfigProvider'
import { getPopulatedSystems, getSystemById, getSystemFullName } from './machine/selectors'
import { configForSystem } from './stage'
import SystemStage from './stage/SystemStage'
import type { MachineSystem } from './machine/types'
import { useSemanticInput } from './hooks/useSemanticInput'
import { useViewNavigation } from './hooks/useViewNavigation'

type View = 'systems' | 'library' | 'allgames' | 'favorites' | 'recent' | 'settings'

function AppInner() {
  const { config, isExample, isRealMachine, loading: machineLoading, error: machineError, validationErrors, blockingError } = useMachineConfig() as any
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

  // Truth-only machine source: when MachineConfig is present we NEVER invent systems from theme/manifest.
  // Only when config is missing entirely (browser dev before example load) may we show manifest ids as scaffolding.
  const systemsForUI = useMemo(() => {
    if (config) {
      // machine truth present – even if 0, return truth (0) – no theme fallback
      return populatedSystems
    }
    // config missing – dev scaffolding fallback allowed
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

  // View-aware navigation – semantic input central, directional does NOT mutate selected when in library/settings/etc.
  const systemIds = useMemo(()=> systemsForUI.map(s=>s.id), [systemsForUI])
  const onNavigate = useViewNavigation({ view, systemIds, selected, setSelected, setView })
  useSemanticInput(onNavigate)

  // Dev performance: reduced-motion detection, tab hidden pause
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

  // Truth-only empty state – when MachineConfig loaded but reports 0 populated systems,
  // we must NOT fill UI with systems because artwork exists. Show explicit truth.
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
      {/* SYSTEM STAGE BACKGROUND LAYERS */}
      <SystemStage config={{ ...stageConfig, background: { url:bgUrl }}} theme={theme} showGuides={showGuides} backgroundUrl={bgUrl}>
        {/* UI CHROME IN STAGE */}
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
            <button className="pill-btn" onClick={()=>setView(v=> v==='settings' ? 'systems' : 'settings')} style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', color:'var(--crystal-ink)', padding:'6px 12px', borderRadius:999, fontSize:11 }}>
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
            <div style={{ padding:'88px 22px', color:'var(--crystal-ink)' }}>
              <div style={{ fontSize:12, opacity:0.6 }}>{view} – architecture ready, will use metadata domain gamelist.xml parsing (no fake data). Hook up to AllGames / Favorites selectors after metadata parsing implemented.</div>
              <button onClick={()=>setView('systems')} style={{ marginTop:12, padding:'8px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.06)', color:'var(--crystal-ink)' }}>Back to systems</button>
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
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontSize:22, fontWeight:500, color:'var(--crystal-ink)' }}>{system.fullName} <span style={{ opacity:0.6, fontFamily:'var(--crystal-mono)', fontSize:12 }}>{system.id}</span></h2>
        <button onClick={onBack} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Back</button>
      </div>
      <div style={{ display:'flex', gap:10, fontSize:11, opacity:0.7, fontFamily:'var(--crystal-mono)' }}>
        <span>ROM dir: {system.romDirectory.replace(/^[A-Z]:\\Users\\[^\\]+/i,'~')}</span>
        <span>• {system.matchingRomFileCount} files audited</span>
        <span>• cmd: {system.launchSelection.selectedLabel}</span>
        <span style={{ color: system.launchSelection.status==='STATICALLY_RESOLVED' ? '#8ef0a4' : '#ffb86a' }}>• {system.launchSelection.status}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:14, flex:1 }}>
        <div style={{ background:'var(--crystal-glass)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12, overflowY:'auto', backdropFilter:'blur(var(--crystal-blur))' }}>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:12, fontFamily:'var(--crystal-mono)' }}>
            Machine truth reports {system.matchingRomFileCount} matching ROM files for {system.id} via audit – actual file list only available on real machine via Tauri backend.
          </div>
          {system.matchingRomFileCount === 0 ? (
            <div className="empty-state" style={{ border:'1px dashed var(--crystal-line)', borderRadius:12, padding:'18px 16px', color:'var(--crystal-ink-dim)', fontSize:12, lineHeight:1.5 }}>
              <div style={{ fontFamily:'var(--crystal-display)', fontSize:13, marginBottom:6, color:'var(--crystal-ink)' }}>No games found in machine audit</div>
              <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11 }}>
                This system was scanned – audit reports 0 matching ROM files. Add ROMs to the configured ROM directory and rescan on the real machine.
              </div>
            </div>
          ) : (
            <div style={{ border:'1px dashed var(--crystal-line)', borderRadius:12, padding:'18px 16px', color:'var(--crystal-ink-dim)', fontSize:12, lineHeight:1.6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--crystal-electric)', boxShadow:'0 0 12px var(--crystal-electric-dim)', display:'inline-block' }} />
                <span style={{ fontFamily:'var(--crystal-display)', fontWeight:500, color:'var(--crystal-ink)' }}>Browser preview – runtime game list unavailable</span>
              </div>
              <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11 }}>
                No fake rows generated. On Tauri (real installed frontend) this panel will list actual ROM basenames discovered under<br/>
                <span style={{ color:'var(--crystal-ink)', background:'rgba(255,255,255,0.06)', padding:'2px 6px', borderRadius:6 }}>
                  {system.romDirectory.replace(/^[A-Z]:\\Users\\[^\\]+/i,'~')}
                </span><br/>
                with full media resolution and gamelist.xml metadata joining. Truth-only: audit count is shown, but not expanded into fake game objects.
              </div>
              <div style={{ marginTop:12, fontSize:10, opacity:0.7, fontFamily:'var(--crystal-mono)' }}>
                Valid extensions: {system.validExtensions.slice(0,12).join(' ')} • Launch template preserved: {system.launchSelection.selectedLabel.slice(0,64)}
              </div>
            </div>
          )}
        </div>
        <div style={{ background:'rgba(0,0,0,0.28)', border:'1px solid var(--crystal-line)', borderRadius:12, padding:12 }}>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:8, fontFamily:'var(--crystal-mono)' }}>Media summary (from machine JSON, not FS scan yet)</div>
          {mediaSummary.map((m:any)=>(
            <div key={m.type} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0', fontFamily:'var(--crystal-mono)' }}>
              <span>{m.type}</span><span>{m.fileCount}</span>
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>Valid ext: {system.validExtensions.join(' ')}</div>
          <div style={{ marginTop:8, fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>Commands: {system.commands.map(c=>c.label).join(' • ')}</div>
          <div style={{ marginTop:8, fontSize:10, opacity:0.5, fontFamily:'var(--crystal-mono)' }}>Launch selection source: {(system.launchSelection.source||'').split('\\').pop()}</div>
        </div>
      </div>
    </div>
  )
}

function SettingsView({ onClose, isExample, isRealMachine, systems }: { onClose:()=>void, isExample:boolean, isRealMachine:boolean, systems:any[] }) {
  return (
    <div style={{ padding:'88px 22px 22px', maxWidth:640 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <h2 style={{ margin:0, fontFamily:'var(--crystal-display)', fontWeight:500, color:'var(--crystal-ink)' }}>Settings / Dev</h2>
        <button onClick={onClose} style={{ padding:'6px 12px', borderRadius:999, border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', color:'var(--crystal-ink)' }}>Close</button>
      </div>
      <div style={{ marginTop:14, fontSize:12, opacity:0.8, lineHeight:1.6, color:'var(--crystal-ink-dim)', fontFamily:'var(--crystal-mono)' }}>
        <div>Machine: {isRealMachine ? 'Real ROG Ally X – machine-local manifest supplied via backend' : isExample ? 'SANITIZED EXAMPLE – 5 systems (browser dev)' : 'No machine loaded' }</div>
        <div>Systems in machine: {systems.length}</div>
        <div>Theme: artwork composable per-field (background from Crystal pack preserved, logo/hardware fg future pluggable). Tokens: var(--crystal-*) graphite/silver/cyan glass.</div>
        <div>SystemStage: 5 layers – background (crystal pack), gameplay regions (DS/3DS dual requires multiple regions), physical media, hardware fg, chrome. GPU translateZ(0), hardware fg fabrication suppressed until assets exist.</div>
        <div>Input: NavigationAction semantic – keyboard + gamepad (deadzone 0.25, D-pad, repeat 400/120, debounce, connect/disconnect) controller-first.</div>
        <div>Launch: frontend request {'{'} systemId, romPath, selectedCommandLabel {'}'} {'->'} backend owns find-rule, placeholders, quoting, STARTDIR/EMUDIR/GAMEDIR/BASENAME/INJECT, etc. Xbox/Xbox360 preserved verbatim, UNSUPPORTED never guessed.</div>
        <div style={{ marginTop:12, color:'var(--crystal-electric)', border:'1px solid var(--crystal-line)', background:'var(--crystal-glass)', padding:'8px 12px', borderRadius:8 }}>Real config failure in Tauri now blocks – frontend never masquerades as configured while showing example-machine data. Browser dev still allows sandboxed example.</div>
        <div style={{ marginTop:8, opacity:0.7 }}>Config files CRYSTAL-MACHINE-AUDIT.md and crystal-machine-config.json are machine-local, never committed – see .gitignore. Art pack 22 dark / 22 light bgs, 231 icons, 22 logos preserved.</div>
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
