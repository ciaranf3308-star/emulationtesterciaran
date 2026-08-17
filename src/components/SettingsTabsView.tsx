import { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import type { MachineSystem } from '../machine/types'
import { SettingsUpdaterPanel } from './SettingsUpdaterPanel'
import { DownloadResolverPanel } from './DownloadResolverPanel'
import { CURRENT_VERSION, COMMIT_SHA } from '../runtime/buildInfo'
import { clearRestoreState } from '../lifecycle/launchCycle'
import { invokeBackend } from '../runtime/backend'
import { getTauriInvoker } from '../runtime/tauri'
import { configForSystem } from '../stage'

type TabId = 'general' | 'library' | 'downloads' | 'updates' | 'diagnostics'

const TABS: Array<{ id: TabId; label: string; hint?: string }> = [
  { id: 'general', label: 'General', hint: 'theme · safe mode' },
  { id: 'library', label: 'Library', hint: '19 systems · roots' },
  { id: 'downloads', label: 'Downloads', hint: 'inbox · import' },
  { id: 'updates', label: 'Updates', hint: 'signed · Tauri v2' },
  { id: 'diagnostics', label: 'Diagnostics', hint: 'logs · debug · crash' },
]

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  showGuides: boolean
  onToggleGuides: () => void
  devMode: boolean
  onToggleDevMode?: () => void
  safeMode: boolean
  systems: Array<{ id: string; fullName?: string }>
  populatedSystems?: MachineSystem[]
  config?: any
  activeSystemId: string
  onLibraryChanged: (systemId: string) => Promise<void> | void
  onClose: () => void
  onDebugOverlayToggle: () => void
  debugOverlayVisible: boolean
  onOpenDiagnosticsDebug?: () => void
}

// Local storage helpers for settings toggles that are otherwise not persisted
function useLocalBool(key: string, defaultVal = false) {
  const [v, setV] = useState<boolean>(() => {
    try {
      const ls = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      if (ls === '1' || ls === 'true') return true
      if (ls === '0' || ls === 'false') return false
      return defaultVal
    } catch {
      return defaultVal
    }
  })
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, v ? '1' : '0')
    } catch {}
  }, [v, key])
  return [v, setV] as const
}

export function SettingsTabsView({
  theme,
  onToggleTheme,
  showGuides,
  onToggleGuides,
  devMode,
  onToggleDevMode,
  safeMode,
  systems,
  populatedSystems,
  config,
  activeSystemId,
  onLibraryChanged,
  onClose,
  onDebugOverlayToggle,
  debugOverlayVisible,
}: Props) {
  const isDark = theme === 'dark'
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [keepSource, setKeepSource] = useLocalBool('crystal-downloads-keep-source', false) // default false = delete after verified
  const [autoClassify, setAutoClassify] = useLocalBool('crystal-downloads-auto-classify', true)
  const [watchDownloads, setWatchDownloads] = useLocalBool('crystal-downloads-watch', true)
  const [dedupToast, setDedupToast] = useLocalBool('crystal-library-dedup-toast', true)
  const [safeInsetDebug, setSafeInsetDebug] = useLocalBool('crystal-diagnostics-safe-inset-debug', false)
  const [soakTest, setSoakTest] = useLocalBool('crystal-diagnostics-soak-test', false)
  const [reducedMotion, setReducedMotion] = useLocalBool('crystal-diagnostics-reduced-motion', false)
  // V3.1 General toggles – CRT preview + Micro Sound/Haptic (default off, persisted)
  const [crtMode, setCrtMode] = useLocalBool('crystal_crt_mode', false)
  const [soundsEnabledLocal, setSoundsEnabledLocal] = useLocalBool('crystal_sounds_enabled', false)
  const [crashList, setCrashList] = useState<Array<{ name: string; time?: string }>>([])
  const [restoreClearing, setRestoreClearing] = useState(false)
  const [logsPathInfo, setLogsPathInfo] = useState<string>('D:\\CrystalFrontend\\logs\\')

  const contentRef = useRef<HTMLDivElement>(null)

  // V3.1 sync root class + events when CRT/sounds toggled from settings
  useEffect(() => {
    try {
      if (crtMode) document.documentElement.classList.add('crystal-crt-enabled')
      else document.documentElement.classList.remove('crystal-crt-enabled')
      window.dispatchEvent(new CustomEvent('crystal:crt-changed' as any, { detail: { enabled: crtMode } } as any))
    } catch {}
  }, [crtMode])

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('crystal:sounds-changed' as any, { detail: { enabled: soundsEnabledLocal } } as any))
    } catch {}
  }, [soundsEnabledLocal])

  // Focus-follow scrolling – similar to V2 audit (spatial D-pad navigation)
  const moveFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const container = contentRef.current
    if (!container) return
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
      b => (b as HTMLElement).offsetParent !== null || (b as HTMLElement).getClientRects().length > 0
    ) as HTMLButtonElement[]
    if (!buttons.length) return
    const current = document.activeElement as HTMLButtonElement | null
    if (!current || !buttons.includes(current)) {
      // focus first control inside active tab content (ignore tab bar)
      const first = buttons.find(b => b.closest('[data-settings-tab-content]')) || buttons[0]
      try {
        first.focus({ preventScroll: true })
        first.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {}
      return
    }
    const from = current.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const vertical = direction === 'up' || direction === 'down'
    const sign = direction === 'up' || direction === 'left' ? -1 : 1
    const ranked = buttons
      .filter(b => b !== current)
      .map(b => {
        const rect = b.getBoundingClientRect()
        const dx = rect.left + rect.width / 2 - fromX
        const dy = rect.top + rect.height / 2 - fromY
        const primary = vertical ? dy * sign : dx * sign
        const cross = vertical ? Math.abs(dx) : Math.abs(dy)
        // Prefer forward progress
        return { button: b, primary, score: primary * 10 + cross }
      })
      .filter(item => item.primary > 3)
      .sort((a, b) => a.score - b.score)
    const next = ranked[0]?.button || buttons[(buttons.indexOf(current) + sign + buttons.length) % buttons.length]
    try {
      next.focus({ preventScroll: true })
      next.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    } catch {}
  }, [])

  // Tab cycling L/R per spec
  const cycleTab = useCallback((dir: 1 | -1) => {
    const idx = TABS.findIndex(t => t.id === activeTab)
    const nextIdx = (idx + dir + TABS.length) % TABS.length
    setActiveTab(TABS[nextIdx].id)
    // After tab change, focus follow will be initiated by effect below
  }, [activeTab])

  // Expose keyboard / gamepad handling via window custom events (App onNav will also call this)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return
      if (e.key === 'ArrowUp') {
        e.preventDefault(); moveFocus('up')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); moveFocus('down')
      } else if (e.key === 'ArrowLeft') {
        // if meta for tab cycling – L/R cycles tabs per spec
        // If user holds Alt? Simple: left cycles tabs
        e.preventDefault(); cycleTab(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); cycleTab(1)
      } else if (e.key === 'Enter' || e.key === ' ') {
        const focused = document.activeElement as HTMLButtonElement | null
        if (focused?.matches('[data-settings-control], [data-settings-tab]')) {
          e.preventDefault(); focused.click()
        }
      }
    }
    // gamepad semantic bridge – listen to crystal-settings-nav custom event from App
    const onCustom = (ev: any) => {
      const action = ev?.detail as string
      if (!action) return
      if (action === 'up') moveFocus('up')
      else if (action === 'down') moveFocus('down')
      else if (action === 'left' || action === 'previousSystem') cycleTab(-1)
      else if (action === 'right' || action === 'nextSystem') cycleTab(1)
      else if (action === 'confirm') {
        const focused = document.activeElement as HTMLButtonElement | null
        if (focused?.matches('[data-settings-control], [data-settings-tab]')) focused.click()
        else moveFocus('down')
      }
    }
    const onJump = (ev: any) => {
      const tab = ev?.detail as string
      if (!tab) return
      if ((TABS as any).some((t: any) => t.id === tab)) {
        setActiveTab(tab as TabId)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-settings-nav' as any, onCustom)
    window.addEventListener('crystal-settings-jump' as any, onJump)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('crystal-settings-nav' as any, onCustom)
      window.removeEventListener('crystal-settings-jump' as any, onJump)
    }
  }, [moveFocus, cycleTab])

  // Auto-focus first control when tab changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      const container = contentRef.current
      if (!container) return
      const btns = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-settings-control]')) as HTMLButtonElement[]
      const first = btns[0]
      if (first) {
        try { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [activeTab])

  // Diagnostics – logs path resolution
  useEffect(() => {
    let cancelled = false
    async function resolveLogs() {
      try {
        const inv = await getTauriInvoker()
        if (!inv) return
        // Try native writable root
        try {
          const root = await inv('get_writable_root' as any)
          if (typeof root === 'string' && !cancelled) {
            const sep = root.includes('\\') || root.includes('D:') ? '\\' : '/'
            setLogsPathInfo(`${root}${sep}logs${sep}`)
            return
          }
        } catch {}
        // fallback to D:\CrystalFrontend\logs\ as authoritative per Pillar 1 audit
        if (!cancelled) setLogsPathInfo('D:\\CrystalFrontend\\logs\\')
      } catch {}
    }
    void resolveLogs()
    return () => { cancelled = true }
  }, [])

  // Crash diagnostics listing – try Tauri FS / backend
  useEffect(() => {
    let cancelled = false
    async function listCrashes() {
      try {
        const inv = await getTauriInvoker()
        if (!inv) return
        try {
          const crashes = await inv('list_crash_logs' as any).catch(() => null)
          if (crashes && Array.isArray(crashes) && !cancelled) {
            setCrashList(crashes.map((c: any) => typeof c === 'string' ? { name: c } : c))
            return
          }
        } catch {}
        try {
          const logs = await inv('get_diagnostics' as any).catch(() => null)
          if (logs && Array.isArray((logs as any).crashes) && !cancelled) {
            setCrashList((logs as any).crashes)
            return
          }
        } catch {}
      } catch {}
    }
    void listCrashes()
    return () => { cancelled = true }
  }, [activeTab])

  const currentConfig = useMemo(() => {
    try {
      return configForSystem(activeSystemId, activeSystemId) as any
    } catch {
      return null
    }
  }, [activeSystemId])

  const romRoot = config?.roots?.rom || 'D:\\Emulation\\roms\\'
  const mediaRoot = config?.roots?.scrapedMedia || 'D:\\Emulation\\storage\\downloaded_media'

  // Media storage consistency check – D vs C
  const mediaConsistency = useMemo(() => {
    if (!populatedSystems) return { dCount: 0, cCount: 0, mismatched: [] as any[] }
    let d = 0, c = 0
    const mism: any[] = []
    for (const sys of populatedSystems) {
      const media = (sys as any).media as any
      if (!media) continue
      for (const [k, cat] of Object.entries(media)) {
        const rec = cat as any
        const dir = rec?.directory || ''
        if (!dir) continue
        if (String(dir).toLowerCase().startsWith('d:')) d++
        else if (String(dir).toLowerCase().startsWith('c:')) c++
        if (String(dir).toLowerCase().includes('c:\\emulation') || String(dir).toLowerCase().includes('c:/emulation')) {
          mism.push({ systemId: sys.id, mediaType: k, dir })
        }
      }
    }
    return { dCount: d, cCount: c, mismatched: mism.slice(0, 6) }
  }, [populatedSystems])

  return (
    <div className="crystal-settings crystal-settings-tabs" data-theme={theme} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs bar – L/R cycle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexShrink: 0,
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
        background: isDark ? 'rgba(12,16,24,0.56)' : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, marginRight: 8 }}>
          <span>[L/R] TAB</span>
        </div>
        {TABS.map(t => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              data-settings-tab={t.id}
              data-settings-control
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: `1px solid ${active ? (isDark ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.24)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: active ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.12)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                color: active ? (isDark ? '#7df9ff' : '#295fdc') : isDark ? '#eef7ff' : '#16213e',
                fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: active ? 800 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: active ? (isDark ? '0 0 0 1px rgba(125,249,255,0.08) inset' : 'none') : 'none',
              }}
            >
              {t.label.toUpperCase()} <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: 6, fontSize: 9 }}>{t.hint}</span>
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          data-settings-control
          onClick={onClose}
          style={{
            padding: '8px 14px', borderRadius: 999,
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.86)',
            fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          [B] CLOSE
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} data-settings-content style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 28px', display: 'flex', flexDirection: 'column', gap: 14, scrollBehavior: 'smooth' }}>

        {activeTab === 'general' && (
          <div data-settings-tab-content="general" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px 16px', borderRadius: 14, background: isDark ? 'linear-gradient(180deg, rgba(22,26,42,0.78), rgba(16,20,32,0.72))' : 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(251,253,255,0.84))', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>SYSTEM • ENVIRONMENT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.6 }}>Theme</span>
                  <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{theme}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.6 }}>Crystal</span>
                  <span>v{CURRENT_VERSION} • {COMMIT_SHA.slice(0,7)} • graphite / silver / cyan acrylic</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.6 }}>Safe Mode</span>
                  <span style={{ color: safeMode ? '#ff8a8a' : isDark ? '#7df9ff' : '#295fdc', fontWeight: 700 }}>{safeMode ? 'ACTIVE – launch blocked' : 'Normal – ROG ready'}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button data-settings-control onClick={onToggleTheme} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.82)', fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>⇄ Toggle {theme === 'dark' ? 'Light' : 'Dark'}</button>
                <button data-settings-control onClick={onToggleGuides} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer' }}>{showGuides ? 'Hide guides' : 'Guides'}</button>
                {onToggleDevMode && (
                  <button data-settings-control onClick={onToggleDevMode} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: devMode ? (isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)') : 'transparent', fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer' }}>DEV {devMode ? 'ON' : 'OFF'}</button>
                )}
              </div>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? (crtMode ? 'rgba(125,249,255,0.10)' : 'rgba(255,255,255,0.04)') : (crtMode ? 'rgba(70,130,255,0.08)' : 'rgba(255,255,255,0.74)'), border: `1px solid ${crtMode ? (isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.16)') : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, letterSpacing: '0.08em', textTransform: 'uppercase' }}>V3.1 • VISUAL & AUDIO</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  data-settings-control
                  onClick={() => setCrtMode(v => !v)}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 999,
                    border: `1px solid ${crtMode ? (isDark ? 'rgba(125,249,255,0.28)' : 'rgba(70,130,255,0.24)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                    background: crtMode ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.12)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)'),
                    color: crtMode ? (isDark ? '#c8fcff' : '#1e3a8a') : undefined,
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: crtMode ? `0 0 0 1px ${isDark ? 'rgba(125,249,255,0.10)' : 'rgba(70,130,255,0.10)'} inset` : 'none',
                  }}
                >
                  [C] CRT {crtMode ? 'ON – scanline + curvature' : 'OFF – Library detail CRT (toggle C / R-stick)'} 
                </button>
                <button
                  data-settings-control
                  onClick={() => {
                    const next = !soundsEnabledLocal
                    setSoundsEnabledLocal(next)
                    // test tick when turning on
                    if (next) {
                      try {
                        import('../lib/sound').then(m => m.playConfirm?.()).catch(() => {})
                      } catch {}
                    }
                  }}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 999,
                    border: `1px solid ${soundsEnabledLocal ? (isDark ? 'rgba(255,214,90,0.24)' : 'rgba(255,180,0,0.22)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                    background: soundsEnabledLocal ? (isDark ? 'rgba(255,214,90,0.14)' : 'rgba(255,200,60,0.16)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)'),
                    color: soundsEnabledLocal ? (isDark ? '#fff1b8' : '#6b4a00') : undefined,
                    fontFamily: 'var(--crystal-mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔊 SOUNDS {soundsEnabledLocal ? 'ON – tick 880Hz/440Hz + haptic 20ms' : 'OFF – WebAudio 0.12 vol muted pref'} 
                </button>
              </div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.62, lineHeight: 1.45 }}>
                CRT Preview Mode adds <code style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', padding: '1px 5px', borderRadius: 5 }}>.crystal-crt-mode</code> scanline repeating-linear-gradient + curvature perspective(800px) scale(1.02) border-radius 3%/2% on Library gameplay (toggle C / gamepad R-stick click via <code style={{ padding:'1px 4px', borderRadius:4, background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' }}>crystal_crt_mode</code>). Sounds default off, persisted <code style={{ padding:'1px 4px', borderRadius:4, background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' }}>crystal_sounds_enabled</code> – WebAudio tick 880Hz 60ms confirm / 440Hz 80ms back, volume 0.12, respects mute pref + window muted. Haptic dual-rumble 20ms where actuator present. D-pad still authoritative.
              </div>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.14)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>CRYSTAL TIPS • CONTROLLER FIRST</div>
              <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 11.5, lineHeight: 1.5, opacity: 0.86 }}>
                <div>[A] PLAY / ENTER • [B] BACK • [X] MEDIA CYCLE • [Y] FAVORITE • [VIEW] QUICK FILTER • [MENU] QUICK SETTINGS</div>
                <div style={{ marginTop: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66 }}>L+R hold + View = diagnostics debug overlay (physical Ally controls require human confirmation; browser automation cannot actuate embedded controller).</div>
              </div>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, letterSpacing: '0.08em', marginBottom: 6 }}>SAFE MODE • WRITE GUARD</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, lineHeight: 1.5, opacity: 0.78 }}>
                Crystal keeps app data under <span style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', padding: '1px 6px', borderRadius: 6 }}>%LOCALAPPDATA%\\CrystalFrontend\\</span> and writes game imports only to the selected EmuDeck ROM folder. ES-DE configuration and BIOS files remain untouched. {safeMode ? 'SAFE MODE active — launch blocked.' : 'Normal operation — ROG ready.'}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 14, background: isDark ? 'rgba(70,18,26,0.34)' : 'rgba(255,244,246,0.90)', border: `1px solid ${isDark ? 'rgba(255,118,138,0.20)' : 'rgba(176,38,62,0.16)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, fontWeight: 720 }}>Exit Crystal</div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.66, marginTop: 5 }}>Close the frontend and return to Windows.</div>
              </div>
              <button
                data-settings-control
                onClick={() => { invokeBackend<void>('exit_crystal').catch(() => window.close()) }}
                style={{ padding: '10px 16px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,118,138,0.28)' : 'rgba(176,38,62,0.22)'}`, background: isDark ? 'rgba(255,92,118,0.14)' : 'rgba(176,38,62,0.10)', color: isDark ? '#ff9bad' : '#a7223d', fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
              >
                [A] EXIT CRYSTAL
              </button>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div data-settings-tab-content="library" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px 16px', borderRadius: 14, background: isDark ? 'rgba(26,30,46,0.72)' : 'rgba(255,255,255,0.86)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>LIBRARY • ROOTS • TRUTH</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.6 }}>
                <div><span style={{ opacity: 0.6 }}>ROM root</span><br/><strong style={{ wordBreak: 'break-all' }}>{romRoot}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Media root</span><br/><strong style={{ wordBreak: 'break-all' }}>{mediaRoot}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Gamelist root</span><br/><strong style={{ wordBreak: 'break-all' }}>{(config?.roots?.gamelists as any) || 'C:\\Users\\%USER%\\AppData\\Roaming\\EmuDeck\\ES-DE\\gamelists'}</strong></div>
                <div><span style={{ opacity: 0.6 }}>Writable root (D preferred)</span><br/><strong>D:\\CrystalFrontend\\</strong> fallback %LOCALAPPDATA%\\CrystalFrontend\\</div>
              </div>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>19 SYSTEMS SUMMARY • READ-ONLY</span>
                <button data-settings-control onClick={() => setDedupToast(v => !v)} style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: dedupToast ? (isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)') : 'transparent', fontFamily: 'var(--crystal-mono)', fontSize: 10, cursor: 'pointer' }}>
                  DEDUP TOAST {dedupToast ? 'ON' : 'OFF'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontFamily: 'var(--crystal-mono)', fontSize: 10.5 }}>
                {(populatedSystems || systems.map(s => ({ id: s.id, fullName: s.fullName } as any))).slice(0, 22).map((sys: any) => (
                  <div key={sys.id} style={{ padding: '8px 10px', borderRadius: 10, background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(18,26,44,0.03)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.04)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>{sys.id?.toUpperCase?.() || sys.id}</span>
                    <span style={{ opacity: 0.66 }}>{sys.fullName || sys.id} • {sys.matchingRomFileCount ?? sys.romCount ?? '--'} ROMs</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: mediaConsistency.mismatched.length ? (isDark ? 'rgba(255,200,80,0.08)' : 'rgba(255,200,60,0.12)') : isDark ? 'rgba(92,220,170,0.08)' : 'rgba(92,220,170,0.10)', border: `1px solid ${mediaConsistency.mismatched.length ? (isDark ? 'rgba(255,200,80,0.18)' : 'rgba(255,180,0,0.18)') : 'rgba(92,220,170,0.18)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase' }}>MEDIA STORAGE CONSISTENCY • D VS C</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.5 }}>
                D:\\ entries: <strong>{mediaConsistency.dCount}</strong> • C:\\ entries: <strong>{mediaConsistency.cCount}</strong> • The machine manifest declares a D: media root while several per-system media directories still point to C: – this reflects current ES-DE data and should be migrated deliberately, not silently by Crystal (per V2 audit).
              </div>
              {mediaConsistency.mismatched.length > 0 && (
                <div style={{ marginTop: 8, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.78 }}>
                  Examples (first {mediaConsistency.mismatched.length}):
                  {mediaConsistency.mismatched.map((m: any, i: number) => (
                    <div key={i} style={{ marginTop: 2 }}>• {m.systemId}/{m.mediaType}: {String(m.dir).slice(0, 88)}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, marginBottom: 6 }}>DEDUPLICATION • LIBRARY LOGIC</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.78, lineHeight: 1.5 }}>
                Crystal uses <span style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', padding: '1px 6px', borderRadius: 6 }}>src/lib/dedupeLibraryGames.ts</span> to remove duplicate logical entries caused by stale archives, repeated metadata or multiple equivalent paths. {dedupToast ? 'Toast notifications ON.' : 'Toast OFF.'} ES-DE gamelist.xml remains authoritative for metadata; Crystal never fabricates game rows.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'downloads' && (
          <div data-settings-tab-content="downloads" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(26,30,46,0.72)' : 'rgba(255,255,255,0.86)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase' }}>DOWNLOADS • INBOX SETTINGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  data-settings-control
                  onClick={() => setWatchDownloads(v => !v)}
                  style={{
                    padding: '8px 14px', borderRadius: 999,
                    border: `1px solid ${watchDownloads ? (isDark ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.24)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                    background: watchDownloads ? (isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)') : 'transparent',
                    fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  WATCH DOWNLOADS FOLDER {watchDownloads ? 'ON' : 'OFF'} – Windows Known Folder
                </button>
                <button
                  data-settings-control
                  onClick={() => setKeepSource(v => !v)}
                  style={{
                    padding: '8px 14px', borderRadius: 999,
                    border: `1px solid ${keepSource ? (isDark ? 'rgba(255,214,90,0.22)' : 'rgba(255,180,0,0.22)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                    background: keepSource ? (isDark ? 'rgba(255,214,90,0.14)' : 'rgba(255,200,60,0.18)') : 'transparent',
                    fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  KEEP SOURCE {keepSource ? 'ON (default OFF) – keep .zip after install' : 'OFF (default) – delete after verified INSTALLED'}
                </button>
                <button
                  data-settings-control
                  onClick={() => setAutoClassify(v => !v)}
                  style={{
                    padding: '8px 14px', borderRadius: 999,
                    border: `1px solid ${autoClassify ? (isDark ? 'rgba(92,220,170,0.20)' : 'rgba(92,220,170,0.22)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                    background: autoClassify ? (isDark ? 'rgba(92,220,170,0.14)' : 'rgba(92,220,170,0.14)') : 'transparent',
                    fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  AUTO-CLASSIFY {autoClassify ? 'ON – high-confidence console auto-select' : 'OFF – manual console choice'}
                </button>
              </div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, lineHeight: 1.45 }}>
                Supported: loose ROMs, ZIP, 7z. Inspect archive contents without trusting outer filename. Crystal extracts into staging <span style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', padding: '1px 6px', borderRadius: 6 }}>D:\\CrystalFrontend\\cache\\imports\\</span> then moves valid game files into selected EmuDeck ROM folder. Never delete source before destination verification.
              </div>
            </div>

            <DownloadResolverPanel
              theme={theme}
              systems={systems.map(s => ({ id: s.id, fullName: s.fullName }))}
              initialSystemId={activeSystemId}
              onLibraryChanged={onLibraryChanged}
            />
          </div>
        )}

        {activeTab === 'updates' && (
          <div data-settings-tab-content="updates" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px 16px', borderRadius: 14, background: isDark ? 'rgba(26,30,46,0.72)' : 'rgba(255,255,255,0.86)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>UPDATES • SIGNED • GRACEFUL UNKNOWN</div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.6 }}>
                Current: v{CURRENT_VERSION} • commit {COMMIT_SHA}. Remote endpoint may be unavailable (unknown remote version) – panel must show “unknown → Check for updates” button, not broken UI.
              </div>
            </div>
            <SettingsUpdaterPanel theme={theme} />
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div data-settings-tab-content="diagnostics" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(26,30,46,0.72)' : 'rgba(255,255,255,0.86)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>DIAGNOSTICS • LOGS & SENTINEL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Logs path</span><strong>{logsPathInfo}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Sentinel</span><span>tools/sentinel.mjs – shared folder watcher + stale lock guard</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Current system</span><span>{activeSystemId.toUpperCase()} – {currentConfig?.fullName || activeSystemId} • presentation {currentConfig?.presentationType || 'tv'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.6 }}>Safe inset (uiSafe)</span><span>top {currentConfig?.uiSafe?.top ?? 6}% bottom {currentConfig?.uiSafe?.bottom ?? 14}% left {currentConfig?.uiSafe?.left ?? 0}% right {currentConfig?.uiSafe?.right ?? 0}%</span></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                data-settings-control
                onClick={onDebugOverlayToggle}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${debugOverlayVisible ? (isDark ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.24)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  background: debugOverlayVisible ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.12)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)',
                  fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                }}
              >
                DEBUG OVERLAY {debugOverlayVisible ? 'ON – L+R+View toggled' : 'OFF – press L+R+View (4+5+8)'} • foregroundZ {currentConfig?.foregroundZIndex ?? 4} mediaZ {currentConfig?.mediaZIndex ?? 2}
              </button>

              <button
                data-settings-control
                onClick={() => setSafeInsetDebug(v => !v)}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${safeInsetDebug ? (isDark ? 'rgba(255,214,90,0.22)' : 'rgba(255,180,0,0.22)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  background: safeInsetDebug ? (isDark ? 'rgba(255,214,90,0.12)' : 'rgba(255,200,60,0.14)') : 'transparent',
                  fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                }}
              >
                SAFE INSET DEBUG VISUAL {safeInsetDebug ? 'ON' : 'OFF'} – show uiSafe top/bottom/left/right % overlay per system
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                data-settings-control
                onClick={() => setSoakTest(v => !v)}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${soakTest ? (isDark ? 'rgba(255,120,120,0.22)' : 'rgba(255,90,90,0.22)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  background: soakTest ? (isDark ? 'rgba(255,120,120,0.12)' : 'rgba(255,90,90,0.10)') : 'transparent',
                  fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                }}
              >
                SOAK-TEST HIDDEN MODE {soakTest ? 'ON – rapid nav / provider timeouts / multi-GB import' : 'OFF – hidden • long-duration validation'}
              </button>

              <button
                data-settings-control
                onClick={() => setReducedMotion(v => !v)}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${reducedMotion ? (isDark ? 'rgba(92,220,170,0.20)' : 'rgba(92,220,170,0.20)') : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  background: reducedMotion ? (isDark ? 'rgba(92,220,170,0.12)' : 'rgba(92,220,170,0.12)') : 'transparent',
                  fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                }}
              >
                REDUCED MOTION {reducedMotion ? 'ON – prefers-reduced-motion + no large blur' : 'OFF – transform/opacity only'}
              </button>
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>CRASH DIAGNOSTICS • LISTING</span>
                <button
                  data-settings-control
                  onClick={async () => {
                    try {
                      const inv = await getTauriInvoker()
                      if (inv) await inv('clear_crash_logs' as any).catch(() => {})
                      setCrashList([])
                    } catch {}
                  }}
                  style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,120,120,0.22)' : 'rgba(176,38,62,0.18)'}`, background: 'transparent', fontFamily: 'var(--crystal-mono)', fontSize: 10, cursor: 'pointer' }}
                >
                  CLEAR CRASH LOGS
                </button>
              </div>
              {crashList.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10.5 }}>
                  {crashList.map((c, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: isDark ? 'rgba(255,100,120,0.08)' : 'rgba(255,100,120,0.08)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.name}</span>
                      <span style={{ opacity: 0.6 }}>{c.time || ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.6 }}>No crash logs – UI recovery boundary prevents blank screen (per V2 audit). Structured crash report persists beside Rust log when frontend recovery triggers.</div>
              )}
            </div>

            <div style={{ padding: '14px 14px', borderRadius: 12, background: isDark ? 'rgba(125,249,255,0.06)' : 'rgba(70,130,255,0.06)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)'}` }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase' }}>RESTORE STATE • CLEAR</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  data-settings-control
                  disabled={restoreClearing}
                  onClick={async () => {
                    setRestoreClearing(true)
                    try {
                      await clearRestoreState()
                      // also try native clear via backend direct
                      try {
                        const inv = await getTauriInvoker()
                        if (inv) await inv('clear_launch_restore_state' as any)
                      } catch {}
                    } finally {
                      setRestoreClearing(false)
                    }
                  }}
                  style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.06)' : '#fff', fontFamily: 'var(--crystal-mono)', fontSize: 11, cursor: restoreClearing ? 'wait' : 'pointer', opacity: restoreClearing ? 0.6 : 1 }}
                >
                  {restoreClearing ? 'CLEARING…' : 'CLEAR RESTORE STATE – bounded & timestamp validated'}
                </button>
                <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6 }}>Prevents stale restore loop after handoff (maxAge 300s). Non-destructive to ROMs/media/saves.</span>
              </div>
            </div>

            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.54, lineHeight: 1.45 }}>
              Physical Ally controls still require human confirmation; browser automation cannot actuate embedded controller – note. Diagnostics shows: safe insets per system (uiSafe top/bottom/left/right % from stage config), foregroundZIndex, mediaZIndex, gameplayRegions, physicalMedia placement. Toggle via L+R+View chord or Diagnostics panel.
            </div>
          </div>
        )}

      </div>

      <style>{`
        .crystal-settings-tabs button:focus-visible {
          outline: 2px solid ${isDark ? '#7df9ff' : '#4a86ff'};
          outline-offset: 3px;
          box-shadow: 0 0 0 5px ${isDark ? 'rgba(125,249,255,0.13)' : 'rgba(74,134,255,0.13)'};
        }
      `}</style>
    </div>
  )
}
