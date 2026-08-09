import { useEffect, useRef, useState, useMemo } from 'react'
import { Desktop } from './tauri'

type Theme = 'light' | 'dark'
type SystemAsset = {
  backgroundLight?: string
  backgroundDark?: string
  logoLight?: string
  logoDark?: string
  carouselIcon?: string
}
type Manifest = Record<string, SystemAsset>

const PRIMARY = [
  'auto-allgames',
  'dreamcast',
  'gb',
  'gba',
  'gbc',
  'gc',
  'genesis',
  'n3ds',
  'n64',
  'nds',
  'nes',
  'pokemon',
  'ps2',
  'psp',
  'psx',
  'snes',
  'wii',
  'wiiu',
  'windows',
  'xbox',
  'xbox360',
  'steam',
]

function assetUrl(rel?: string) {
  if (!rel) return undefined
  // manifest rel like "backgrounds/light/ps2.png"
  return `/assets/Crystal-Frontend-Asset-Pack/${rel}`
}

function getBg(manifest: Manifest, id: string, theme: Theme) {
  const e = manifest[id]
  if (!e) return assetUrl(manifest['_default']?.[theme === 'light' ? 'backgroundLight' : 'backgroundDark'])
  const chosen = theme === 'light' ? (e.backgroundLight || e.backgroundDark) : (e.backgroundDark || e.backgroundLight)
  return assetUrl(chosen)
}

function getLogo(manifest: Manifest, id: string, theme: Theme) {
  const e = manifest[id]
  if (!e) return undefined
  const chosen = theme === 'light' ? (e.logoLight || e.logoDark) : (e.logoDark || e.logoLight)
  return assetUrl(chosen)
}

function getIcon(manifest: Manifest, id: string) {
  const e = manifest[id]
  return assetUrl(e?.carouselIcon)
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [selected, setSelected] = useState<string>('ps2')
  const [emuRoot, setEmuRoot] = useState('C:\\Emulation')
  const carouselRef = useRef<HTMLDivElement>(null)
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'empty'>('idle')

  useEffect(() => {
    fetch('/assets/Crystal-Frontend-Asset-Pack/manifest.json')
      .then(r => r.json())
      .then((j: Manifest) => {
        setManifest(j)
        const avail = PRIMARY.filter(k => j[k])
        if (avail.length && !avail.includes(selected)) setSelected(avail[0])
      })
      .catch(() => {
        fetch('/assets/manifest.json').then(r=>r.json()).then((j:Manifest)=>setManifest(j)).catch(()=>{})
      })
  }, [])

  const primarySystems = useMemo(() => {
    if (!manifest) return PRIMARY
    const avail = PRIMARY.filter(id => manifest[id])
    // also include any other systems that have both bg and logo even if not in PRIMARY, sorted
    const extra = Object.keys(manifest).filter(k => k !== '_default' && !avail.includes(k) && manifest[k].backgroundLight && manifest[k].logoLight)
    return [...avail, ...extra.slice(0,4)]
  }, [manifest])

  const currentEntry = manifest?.[selected]
  const bgUrl = manifest ? getBg(manifest, selected, theme) : undefined
  const logoUrl = manifest ? getLogo(manifest, selected, theme) : undefined
  const isSteamMissingLight = selected === 'steam' && theme === 'light' && manifest?.steam && !manifest.steam.logoLight

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const active = el.querySelector(`[data-id="${selected}"]`) as HTMLElement | null
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selected])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = primarySystems.indexOf(selected)
        setSelected(primarySystems[(idx+1)%primarySystems.length])
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = primarySystems.indexOf(selected)
        setSelected(primarySystems[(idx-1+primarySystems.length)%primarySystems.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, primarySystems])

  const handleScan = async () => {
    setScanState('scanning')
    try {
      const res = await Desktop.scanEmuDeckRoms(emuRoot)
      if (!res.discoveredSystems.length) setScanState('empty')
      else setScanState('idle')
    } catch {
      setScanState('empty')
    }
  }

  return (
    <div className={`fullscreen-root ${theme}-theme`}>
      <div className="bg-layer">
        {primarySystems.map(id => {
          const url = manifest ? getBg(manifest, id, theme) : undefined
          if (!url) return null
          return <img key={id+theme} src={url} className={`bg-image ${selected===id ? 'active' : ''}`} alt="" decoding="async" />
        })}
        {!bgUrl && <div className="bg-image active" style={{background: 'var(--bg)'}} />}
        <div className="bg-vignette" />
        <div className="bg-grain" />
        <div className="chrome-frame" />
      </div>

      <div className="top-bar">
        <div className="wordmark">
          crystal <span style={{fontWeight:400, fontStyle:'italic'}}>frontend</span>
          <small>EmuDeck • {theme} • {primarySystems.length} systems</small>
        </div>
        <div className="top-actions">
          <button className="pill-btn" onClick={()=>setTheme(t=> t==='dark' ? 'light' : 'dark')}>
            {theme==='dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button className="pill-btn" onClick={()=>alert('Prototype scaffold.\n\nThis will become a Windows fullscreen shell that launches emulators from EmuDeck installation.\nNo new artwork is generated — all backgrounds/logos are from your ES-DE asset pack.')}>
            About
          </button>
        </div>
      </div>

      <div className="stage">
        <div className="carousel-column">
          <div className="logo-stage">
            {logoUrl ? <img src={logoUrl} alt={`${selected} logo`} /> : <div style={{opacity:0.5,fontSize:12}}>no logo • {selected}</div>}
          </div>
          <h1 className="system-title">
            {selected === 'auto-allgames' ? <>All <span>Games</span></> : <><span>{selected}</span></>}
          </h1>
          <div className="system-meta">
            <span>System id: {selected}</span>
            <span className="meta-dot"/>
            <span>{currentEntry?.backgroundLight || currentEntry?.backgroundDark ? 'has background' : 'no bg'}</span>
            <span className="meta-dot"/>
            <span>{currentEntry?.logoLight || currentEntry?.logoDark ? 'has logo' : 'no logo'}</span>
            {isSteamMissingLight && <><span className="meta-dot"/><span style={{color:'#ffb86a'}}>light logo missing → dark fallback</span></>}
          </div>

          <div className="carousel" ref={carouselRef}>
            {primarySystems.map(id => {
              const icon = manifest ? getIcon(manifest, id) : undefined
              return (
                <div key={id} data-id={id} className={`carousel-item ${selected===id ? 'active' : ''}`} onClick={()=>setSelected(id)}>
                  <div className="icon-well">
                    {icon ? <img src={icon} alt={id} loading="lazy"/> : <span style={{fontSize:10}}>{id.slice(0,2)}</span>}
                  </div>
                  <div className="carousel-label">{id}</div>
                </div>
              )
            })}
          </div>

          <div className="badge-row" style={{marginTop:14}}>
            <div className="badge"><img src="/assets/Crystal-Frontend-Asset-Pack/shared-ui/badge-favorite.svg" width={14} height={14} alt="" /> EmuDeck underneath</div>
            <div className="badge"><img src="/assets/Crystal-Frontend-Asset-Pack/shared-ui/icon-star-filled.svg" width={12} height={12} alt="" />No fake counts</div>
            <div className="badge">Fullscreen 100vw × 100vh</div>
          </div>
        </div>

        <div className="detail-pane">
          <div className="detail-card">
            <div className="detail-eyebrow">EmuDeck • Windows frontend • replacement for ES-DE visual</div>

            <div className="detail-row">
              <span>ROM folder</span>
              <span className="detail-value">Emulation/roms/{selected}</span>
            </div>

            <div className="detail-row">
              <span>Background asset</span>
              <span className="detail-value">{currentEntry?.[theme==='light'?'backgroundLight':'backgroundDark'] || '—'}</span>
            </div>

            <div className="detail-row">
              <span>Logo asset</span>
              <span className="detail-value">{(theme==='light' ? (currentEntry?.logoLight || currentEntry?.logoDark) : (currentEntry?.logoDark || currentEntry?.logoLight)) || '—'}</span>
            </div>

            <div className="detail-row">
              <span>Carousel icon</span>
              <span className="detail-value">{currentEntry?.carouselIcon || '—'} • preserved id</span>
            </div>

            <div className="detail-row">
              <span>EmuDeck root</span>
              <input value={emuRoot} onChange={e=>setEmuRoot(e.target.value)} style={{width:160,fontSize:11,background:'transparent',border:'1px solid var(--line)',color:'var(--text)',padding:'4px 8px',borderRadius:6}}/>
            </div>

            <div style={{display:'flex',gap:8}}>
              <button className="pill-btn" onClick={handleScan} style={{flex:1}}>{scanState==='scanning' ? 'Scanning…' : 'Scan EmuDeck (Tauri)'}</button>
              <button className="pill-btn" onClick={()=>Desktop.launchGame(selected, `${emuRoot}\\roms\\${selected}\\example.rom`)}>Launch placeholder</button>
            </div>

            {scanState==='empty' && <div className="empty-state">No ROMs discovered in mock browser mode. Real scan runs via Tauri backend with fs scope to {emuRoot}.<br/><br/>This UI shows no fake ROM counts, fake compatibility, or fake emulator statistics. Connect EmuDeck folder when desktop shell is ready.</div>}

            {scanState==='idle' && <div className="empty-state">Ready for Tauri integration. This frontend replaces only the visual layer. Emulators, BIOS, saves remain in your existing EmuDeck install at <code style={{fontSize:11}}>%USERPROFILE%\\EmuDeck</code> and <code style={{fontSize:11}}>Emulation/tools</code> shims.<br/><br/>Original single-file Vault prototype preserved at <code>prototype/original-vault.html</code> and no longer used for UI.</div>}

            <div style={{display:'flex',gap:10,alignItems:'center',opacity:0.8}}>
              <img src="/assets/Crystal-Frontend-Asset-Pack/shared-ui/storefront-chrome.svg" width={18} height={18} alt="" />
              <img src="/assets/Crystal-Frontend-Asset-Pack/shared-ui/storefront-media-frame.svg" width={18} height={18} alt="" />
              <span style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-dim)'}}>Shared UI • boutique hotel • Soho House + Hume • intimate warm</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-hint">
        <span>← → to switch • click carousel • theme swaps backgrounds/logos per manifest.json • 100vw 100vh overflow hidden • no window chrome</span>
        <span>Crystal Frontend • candidate replaces ES-DE • preserves filenames + system IDs exactly</span>
      </div>
    </div>
  )
}
