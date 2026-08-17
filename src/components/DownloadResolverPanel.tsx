import { useCallback, useEffect, useMemo, useState } from 'react'
import { invokeBackend, listGames } from '../runtime/backend'
import type { ImportResult } from '../lib/importService'

type Candidate = {
  path: string; fileName: string; size: number; modifiedAt: number
  possibleSystemIds: string[]; installedSystemIds: string[]; archive: boolean
  detectedExtensions: string[]; suggestedSystemId?: string; suggestionReason: string
}
type ImportActivity = { active: boolean; system_id: string; source_name: string; extracted_bytes: number; started_at: number }
type ResultNotice = { kind: 'success' | 'error'; title: string; detail: string }
const formatSize = (bytes: number) => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} MB`

export function DownloadResolverPanel({ theme, systems, initialSystemId: _initialSystemId, onLibraryChanged }: {
  theme: string; systems: Array<{ id: string; fullName?: string }>; initialSystemId: string
  onLibraryChanged: (systemId: string) => Promise<void> | void
}) {
  const [items, setItems] = useState<Candidate[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('Reading your Downloads folder…')
  const [activity, setActivity] = useState<ImportActivity | null>(null)
  const [resultNotice, setResultNotice] = useState<ResultNotice | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const chooseDefault = useCallback((item: Candidate, previous?: string) => {
    if (previous && item.possibleSystemIds.includes(previous)) return previous
    if (item.suggestedSystemId && item.possibleSystemIds.includes(item.suggestedSystemId)) return item.suggestedSystemId
    if (item.installedSystemIds.length === 1) return item.installedSystemIds[0]
    if (item.possibleSystemIds.length === 1) return item.possibleSystemIds[0]
    return ''
  }, [])
  const scan = useCallback(async (quiet = false) => {
    if (!quiet) setBusy('scan')
    try {
      const found = await invokeBackend<Candidate[]>('scan_downloaded_games')
      setItems(found)
      setChoices(old => Object.fromEntries(found.map(item => [item.path, chooseDefault(item, old[item.path])])))
      const bytes = found.reduce((sum, item) => sum + item.size, 0)
      setMessage(found.length ? `${found.length} game package${found.length === 1 ? '' : 's'} • ${formatSize(bytes)} waiting in Downloads` : 'Downloads inbox is clear — no supported game packages found.')
    } catch (error) { setMessage(`Could not read Downloads: ${String(error)}`) }
    finally { if (!quiet) setBusy(null) }
  }, [chooseDefault])
  useEffect(() => {
    void scan(); const timer = window.setInterval(() => { if (!busy) void scan(true) }, 5000)
    return () => window.clearInterval(timer)
  }, [scan, busy])
  useEffect(() => {
    let cancelled = false
    const poll = async () => { try { const next = await invokeBackend<ImportActivity>('get_import_activity'); if (!cancelled) setActivity(next) } catch {} }
    void poll(); const timer = window.setInterval(() => void poll(), 700)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!busy || busy === 'scan') { setElapsed(0); return }
    const started = Date.now(); setElapsed(0)
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])
  const counts = useMemo(() => ({ install: items.filter(i => !i.installedSystemIds.length).length, installed: items.filter(i => i.installedSystemIds.length).length }), [items])
  const cycleSystem = (item: Candidate) => {
    const ids = item.possibleSystemIds; if (!ids.length) return
    const current = choices[item.path] || ''
    setChoices(c => ({ ...c, [item.path]: ids[current ? (ids.indexOf(current) + 1) % ids.length : 0] }))
  }
  const install = async (item: Candidate) => {
    const systemId = choices[item.path]
    if (!systemId) { setMessage(`${item.fileName}: choose the destination console first.`); return }
    const systemName = systems.find(s => s.id === systemId)?.fullName || systemId
    setResultNotice(null); setBusy(item.path); setMessage(`Installing ${item.fileName} to ${systemName}…`)
    try {
      const result = await invokeBackend<ImportResult>('resolve_downloaded_game', { request: { systemId, sourcePath: item.path } })
      if (result.status === 'INSTALLED' || result.status === 'ALREADY_INSTALLED') {
        await listGames(systemId); await onLibraryChanged(systemId); setItems(old => old.filter(x => x.path !== item.path))
        const detail = `Installed to ${systemName}, verified, and the original download was removed.`
        setMessage(`${item.fileName}: ${detail}`); setResultNotice({ kind: 'success', title: 'Game installed', detail: `${item.fileName}\n${detail}` })
      } else {
        const detail = result.message || result.errorCode || result.status
        setMessage(`${item.fileName}: ${detail}`); setResultNotice({ kind: 'error', title: 'Install did not complete', detail })
      }
    } catch (error) {
      const detail = String(error); setMessage(`${item.fileName}: ${detail}`)
      setResultNotice({ kind: 'error', title: 'Install failed', detail: `${item.fileName}\n${detail}` })
    }
    finally { setBusy(null); void scan(true) }
  }
  const clearDownload = async (item: Candidate, systemId: string) => {
    setBusy(item.path); setMessage(`Verifying the installed copy of ${item.fileName}…`)
    try {
      await invokeBackend<string>('clear_verified_download', { request: { systemId, sourcePath: item.path } })
      setItems(old => old.filter(x => x.path !== item.path)); setMessage(`${item.fileName}: installed copy verified; download cleared.`)
    } catch (error) { setMessage(`${item.fileName}: ${String(error)}`) }
    finally { setBusy(null); void scan(true) }
  }
  const dark = theme === 'dark'
  const activeItem = busy && busy !== 'scan' ? items.find(item => item.path === busy) : undefined
  const activeSystemId = activeItem ? choices[activeItem.path] : ''
  const activeSystemName = systems.find(system => system.id === activeSystemId)?.fullName || activeSystemId
  return <section data-testid="downloads-inbox" style={{ padding: 16, borderRadius: 16, background: dark ? 'rgba(12,17,28,.82)' : 'rgba(255,255,255,.9)', border: `1px solid ${dark ? 'rgba(125,249,255,.16)' : 'rgba(70,130,255,.16)'}` }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
      <div><div style={{ fontFamily: 'var(--crystal-display)', fontWeight: 850, fontSize: 18 }}>Downloads inbox</div><div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: .66, marginTop: 4 }}>Install game packages to the correct EmuDeck library, or clear downloads already installed.</div></div>
      <button data-settings-control onClick={() => void scan()} disabled={busy !== null} style={{ padding: '10px 15px', borderRadius: 999, border: '1px solid rgba(125,249,255,.24)', background: 'rgba(125,249,255,.11)', color: 'inherit', fontWeight: 850 }}>[A] REFRESH</button>
    </header>
    <div style={{ display: 'flex', gap: 8, marginTop: 12, fontFamily: 'var(--crystal-mono)', fontSize: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(82,161,255,.12)' }}>{counts.install} TO INSTALL</span><span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(92,220,170,.12)' }}>{counts.installed} ALREADY INSTALLED</span><span style={{ padding: '6px 9px', opacity: .72 }}>{message}</span>
    </div>
    {activity?.active && <div style={{ marginTop: 12, padding: 12, borderRadius: 11, background: dark ? 'rgba(125,249,255,.07)' : 'rgba(70,130,255,.07)', border: '1px solid rgba(125,249,255,.18)' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--crystal-mono)', fontSize: 10 }}><b>INSTALLING • {activity.source_name}</b><span>{formatSize(activity.extracted_bytes)} extracted</span></div><div style={{ height: 7, marginTop: 9, overflow: 'hidden', borderRadius: 999, background: 'rgba(127,127,127,.14)' }}><div className="crystal-import-progress" style={{ width: '38%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#57dce5,#7ba6ff)' }} /></div></div>}
    <div style={{ display: 'grid', gap: 10, marginTop: 12, maxHeight: 430, overflowY: 'auto', paddingRight: 4 }}>
      {items.map(item => {
        const systemId = choices[item.path] || ''
        const label = systemId ? (systems.find(s => s.id === systemId)?.fullName || systemId) : 'Console needs review'
        const installedId = item.installedSystemIds.includes(systemId) ? systemId : (item.installedSystemIds.length === 1 ? item.installedSystemIds[0] : '')
        const isInstalled = !!installedId; const ambiguous = item.possibleSystemIds.length > 1
        return <article key={item.path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px 154px', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, background: dark ? 'rgba(255,255,255,.045)' : 'rgba(20,30,55,.045)', border: `1px solid ${isInstalled ? 'rgba(92,220,170,.20)' : 'rgba(125,249,255,.08)'}` }}>
          <div style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 800 }}>{item.fileName}</div><div style={{ display: 'flex', gap: 7, marginTop: 5, fontFamily: 'var(--crystal-mono)', fontSize: 9, opacity: .68, flexWrap: 'wrap' }}><span>{formatSize(item.size)}</span><span>{item.archive ? 'ARCHIVE' : 'ROM'}</span><span>{item.detectedExtensions.map(x => `.${x}`).join(' / ')}</span><span style={{ color: isInstalled ? '#5cdca9' : '#7df9ff' }}>{isInstalled ? 'INSTALLED' : 'NOT INSTALLED'}</span></div></div>
          <button data-settings-control onClick={() => cycleSystem(item)} title={item.suggestedSystemId ? item.suggestionReason : 'Change destination console'} style={{ minHeight: 42, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(125,249,255,.15)', background: 'transparent', color: 'inherit', textAlign: 'left', fontSize: 10, fontWeight: 750 }}><span style={{ opacity: .55 }}>{item.suggestedSystemId ? 'AUTO-DETECTED' : ambiguous ? 'REVIEW CONSOLE • CHANGE' : 'CONSOLE'}</span><br />{label} {!item.suggestedSystemId && ambiguous ? '↻' : ''}</button>
          <button data-settings-control onClick={() => isInstalled ? void clearDownload(item, installedId) : void install(item)} disabled={busy !== null || (!isInstalled && !systemId)} style={{ minHeight: 42, padding: '9px 12px', borderRadius: 10, border: 0, opacity: (isInstalled || systemId) ? 1 : .42, background: isInstalled ? 'rgba(92,220,170,.18)' : (dark ? '#7df9ff' : '#4a86ff'), color: isInstalled ? 'inherit' : (dark ? '#071015' : '#fff'), fontWeight: 900 }}>{busy === item.path ? 'WORKING…' : isInstalled ? 'CLEAR DOWNLOAD' : systemId ? 'INSTALL' : 'CHOOSE CONSOLE'}</button>
        </article>
      })}
      {!items.length && busy !== 'scan' && <div style={{ padding: 22, textAlign: 'center', opacity: .62, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}>No supported game downloads are waiting.</div>}
    </div>
    {activeItem && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(2,5,12,.82)', backdropFilter: 'blur(12px)' }}>
      <div style={{ width: 'min(620px,92vw)', padding: 28, borderRadius: 22, background: dark ? '#101827' : '#fff', border: '1px solid rgba(125,249,255,.35)', boxShadow: '0 28px 90px rgba(0,0,0,.48)' }}>
        <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, color: '#7df9ff', letterSpacing: '.12em' }}>INSTALL IN PROGRESS</div>
        <h2 style={{ margin: '10px 0 5px', fontSize: 24 }}>Installing {activeItem.fileName}</h2>
        <div style={{ opacity: .7, fontSize: 13 }}>Destination: {activeSystemName}</div>
        <div style={{ height: 12, marginTop: 24, overflow: 'hidden', borderRadius: 999, background: 'rgba(127,127,127,.18)' }}><div className="crystal-import-progress" style={{ width: '38%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#57dce5,#7ba6ff)' }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 12, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}><b>{activity?.active ? 'EXTRACTING AND VERIFYING' : 'INSPECTING PACKAGE'}</b><span>{activity?.active ? `${formatSize(activity.extracted_bytes)} extracted • ` : ''}{elapsed}s</span></div>
        <p style={{ margin: '20px 0 0', opacity: .72, fontSize: 12 }}>Crystal is working. Please wait—controls are temporarily locked to prevent duplicate installs.</p>
      </div>
    </div>}
    {resultNotice && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1001, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(2,5,12,.82)', backdropFilter: 'blur(12px)' }}>
      <div style={{ width: 'min(560px,92vw)', padding: 28, borderRadius: 22, textAlign: 'center', background: dark ? '#101827' : '#fff', border: `1px solid ${resultNotice.kind === 'success' ? 'rgba(92,220,170,.5)' : 'rgba(255,100,120,.5)'}`, boxShadow: '0 28px 90px rgba(0,0,0,.48)' }}>
        <div style={{ margin: '0 auto 14px', width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: '50%', fontSize: 28, background: resultNotice.kind === 'success' ? 'rgba(92,220,170,.18)' : 'rgba(255,100,120,.16)' }}>{resultNotice.kind === 'success' ? '✓' : '!'}</div>
        <h2 style={{ margin: 0, fontSize: 25 }}>{resultNotice.title}</h2><p style={{ whiteSpace: 'pre-line', lineHeight: 1.55, opacity: .76 }}>{resultNotice.detail}</p>
        <button autoFocus data-settings-control onClick={() => setResultNotice(null)} style={{ minWidth: 180, padding: '13px 20px', border: 0, borderRadius: 999, background: dark ? '#7df9ff' : '#4a86ff', color: dark ? '#071015' : '#fff', fontWeight: 900 }}>[A] DONE</button>
      </div>
    </div>}
    <style>{`@keyframes crystalImportSweep{0%{transform:translateX(-115%)}100%{transform:translateX(290%)}}.crystal-import-progress{animation:crystalImportSweep 1.35s ease-in-out infinite}`}</style>
  </section>
}
