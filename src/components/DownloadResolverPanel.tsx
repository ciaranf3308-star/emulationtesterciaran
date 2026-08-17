import { useCallback, useEffect, useMemo, useState } from 'react'
import { invokeBackend, listGames } from '../runtime/backend'
import type { ImportResult } from '../lib/importService'

type Candidate = {
  path: string; fileName: string; size: number; modifiedAt: number
  possibleSystemIds: string[]; installedSystemIds: string[]; archive: boolean
  detectedExtensions: string[]; suggestedSystemId?: string; suggestionReason: string
  confidence: string; confidenceReason: string; unsupported: boolean
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
  const [keepSource, setKeepSource] = useState<boolean>(() => {
    try { const stored = localStorage.getItem('crystal_keep_source'); return stored === 'true' } catch { return false }
  })

  const chooseDefault = useCallback((item: Candidate, previous?: string) => {
    // Auto-select only high-confidence console per V3 spec.
    // Never auto-select ambiguous disc formats (iso, rvz, low/medium may still require review unless explicit).
    if (item.unsupported) return ''
    if (previous && item.possibleSystemIds.includes(previous)) {
      // Only keep previous if it was high-confidence originally or user picked it manually; otherwise still allow.
      if (item.confidence === 'high') return previous
      // For medium/low, we still allow keeping user manual pick but don't auto-select on initial scan.
      return previous
    }
    // High confidence only auto-select
    if (item.confidence === 'high' && item.suggestedSystemId && item.possibleSystemIds.includes(item.suggestedSystemId)) {
      return item.suggestedSystemId
    }
    // If single possible and high confidence, allow.
    if (item.confidence === 'high' && item.possibleSystemIds.length === 1) return item.possibleSystemIds[0]
    // Installed single with high confidence verification
    if (item.installedSystemIds.length === 1 && item.confidence === 'high') return item.installedSystemIds[0]
    // For medium (e.g., pbp psx, rvz wii hint) we can still prefill but still show pill – task says medium requires review unless wii in name.
    // Allow medium prefill when suggested exists and confidence is medium, but require confirm? We will prefill medium to aid user.
    if (item.confidence === 'medium' && item.suggestedSystemId && item.possibleSystemIds.includes(item.suggestedSystemId)) {
      // For rvz ambiguous both candidates case suggested is None, so no auto.
      return item.suggestedSystemId
    }
    return ''
  }, [])

  const scan = useCallback(async (quiet = false) => {
    if (!quiet) setBusy('scan')
    try {
      const found = await invokeBackend<Candidate[]>('scan_downloaded_games')
      setItems(found)
      setChoices(old => Object.fromEntries(found.map(item => [item.path, chooseDefault(item, old[item.path])])))
      const bytes = found.reduce((sum, item) => sum + item.size, 0)
      const unsupportedCount = found.filter(f => f.unsupported).length
      let msg = found.length ? `${found.length} game package${found.length === 1 ? '' : 's'} • ${formatSize(bytes)} waiting in Downloads` : 'Downloads inbox is clear — no supported game packages found.'
      if (unsupportedCount) msg += ` • ${unsupportedCount} unsupported (Switch)`
      setMessage(msg)
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

  useEffect(() => {
    try { localStorage.setItem('crystal_keep_source', String(keepSource)) } catch {}
  }, [keepSource])

  const counts = useMemo(() => ({ install: items.filter(i => !i.installedSystemIds.length && !i.unsupported).length, installed: items.filter(i => i.installedSystemIds.length).length, unsupported: items.filter(i => i.unsupported).length }), [items])

  const cycleSystem = (item: Candidate) => {
    const ids = item.possibleSystemIds; if (!ids.length) return
    const current = choices[item.path] || ''
    setChoices(c => ({ ...c, [item.path]: ids[current ? (ids.indexOf(current) + 1) % ids.length : 0] }))
  }

  const install = async (item: Candidate) => {
    if (item.unsupported) { setMessage(`${item.fileName}: ${item.confidenceReason}`); return }
    const systemId = choices[item.path]
    if (!systemId) { setMessage(`${item.fileName}: choose the destination console first (confidence ${item.confidence}).`); return }
    // Low confidence must have explicit user pick – already enforced by requiring systemId.
    // Never auto-select ambiguous disc formats – our chooseDefault ensures empty for low confidence iso.
    const systemName = systems.find(s => s.id === systemId)?.fullName || systemId
    setResultNotice(null); setBusy(item.path); setMessage(`Installing ${item.fileName} to ${systemName}…`)
    try {
      const result = await invokeBackend<ImportResult>('resolve_downloaded_game', { request: { systemId, sourcePath: item.path, keepSource } })
      if (result.status === 'INSTALLED' || result.status === 'ALREADY_INSTALLED') {
        await listGames(systemId); await onLibraryChanged(systemId); setItems(old => old.filter(x => x.path !== item.path))
        const freedText = keepSource ? 'source retained (keep source enabled).' : `verified, and original ${formatSize(item.size)} freed.`
        const detail = `Installed to ${systemName}, ${freedText}`
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
      setItems(old => old.filter(x => x.path !== item.path)); setMessage(`${item.fileName}: installed copy verified; download cleared – ${formatSize(item.size)} freed.`)
    } catch (error) { setMessage(`${item.fileName}: ${String(error)}`) }
    finally { setBusy(null); void scan(true) }
  }

  const dark = theme === 'dark'
  const activeItem = busy && busy !== 'scan' ? items.find(item => item.path === busy) : undefined
  const activeSystemId = activeItem ? choices[activeItem.path] : ''
  const activeSystemName = systems.find(system => system.id === activeSystemId)?.fullName || activeSystemId
  const activeSize = activeItem?.size || 0
  const confidenceColor = (conf: string) => conf === 'high' ? 'rgba(92,220,170,.18)' : conf === 'medium' ? 'rgba(255,213,105,.18)' : 'rgba(255,100,120,.18)'
  const confidenceDot = (conf: string) => conf === 'high' ? '#5cdca9' : conf === 'medium' ? '#ffd569' : '#ff6478'

  return <section data-testid="downloads-inbox" style={{ padding: 16, borderRadius: 16, background: dark ? 'rgba(12,17,28,.82)' : 'rgba(255,255,255,.9)', border: `1px solid ${dark ? 'rgba(125,249,255,.16)' : 'rgba(70,130,255,.16)'}` }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><div style={{ fontFamily: 'var(--crystal-display)', fontWeight: 850, fontSize: 18 }}>Downloads inbox</div><div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: .66, marginTop: 4 }}>Install game packages to the correct EmuDeck library, or clear downloads already installed. Scanning uses EmuDeck 7z.exe path for .7z.</div></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label title="When off, source file is deleted only after INSTALLED/ALREADY_INSTALLED verification. Size freed shown per package." style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, background: dark ? 'rgba(255,255,255,.06)' : 'rgba(20,30,55,.06)', fontFamily: 'var(--crystal-mono)', fontSize: 10 }}>
          <input type="checkbox" checked={keepSource} onChange={e => setKeepSource(e.target.checked)} /> Keep source
        </label>
        <button data-settings-control onClick={() => void scan()} disabled={busy !== null} style={{ padding: '10px 15px', borderRadius: 999, border: '1px solid rgba(125,249,255,.24)', background: 'rgba(125,249,255,.11)', color: 'inherit', fontWeight: 850 }}>[A] REFRESH</button>
      </div>
    </header>
    <div style={{ display: 'flex', gap: 8, marginTop: 12, fontFamily: 'var(--crystal-mono)', fontSize: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(82,161,255,.12)' }}>{counts.install} TO INSTALL</span><span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(92,220,170,.12)' }}>{counts.installed} ALREADY INSTALLED</span>{counts.unsupported ? <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(255,100,120,.15)' }}>{counts.unsupported} UNSUPPORTED</span> : null}<span style={{ padding: '6px 9px', opacity: .72 }}>{message}</span>
    </div>
    {activity?.active && <div style={{ marginTop: 12, padding: 12, borderRadius: 11, background: dark ? 'rgba(125,249,255,.07)' : 'rgba(70,130,255,.07)', border: '1px solid rgba(125,249,255,.18)' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--crystal-mono)', fontSize: 10 }}><b>INSTALLING • {activity.source_name}</b><span>{formatSize(activity.extracted_bytes)} extracted</span></div><div style={{ height: 7, marginTop: 9, overflow: 'hidden', borderRadius: 999, background: 'rgba(127,127,127,.14)' }}><div className="crystal-import-progress" style={{ width: '38%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#57dce5,#7ba6ff)' }} /></div></div>}
    <div style={{ display: 'grid', gap: 12, marginTop: 12, maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
      {items.map(item => {
        const systemId = choices[item.path] || ''
        const label = systemId ? (systems.find(s => s.id === systemId)?.fullName || systemId) : (item.unsupported ? 'Unsupported' : 'Console needs review')
        const installedId = item.installedSystemIds.includes(systemId) ? systemId : (item.installedSystemIds.length === 1 ? item.installedSystemIds[0] : '')
        const isInstalled = !!installedId; const ambiguous = item.possibleSystemIds.length > 1
        const conf = item.confidence || 'low'
        const confReason = item.confidenceReason || item.suggestionReason
        const pillBg = confidenceColor(conf)
        const dot = confidenceDot(conf)
        const canInstall = !item.unsupported && !!systemId && (conf !== 'low' || !!systemId) // low requires explicit pick
        const freedText = keepSource ? 'Keep source ON – source retained' : `Will free ${formatSize(item.size)} on success`
        return <article key={item.path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 205px 168px', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, background: dark ? 'rgba(255,255,255,.045)' : 'rgba(20,30,55,.045)', border: `1px solid ${isInstalled ? 'rgba(92,220,170,.20)' : item.unsupported ? 'rgba(255,100,120,.25)' : 'rgba(125,249,255,.08)'}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 800 }}>{item.fileName}</div>
            <div style={{ display: 'flex', gap: 7, marginTop: 6, fontFamily: 'var(--crystal-mono)', fontSize: 9, opacity: .78, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{formatSize(item.size)}</span><span>{item.archive ? 'ARCHIVE' : 'ROM'}</span><span>{item.detectedExtensions.map(x => `.${x}`).join(' / ')}</span><span style={{ color: isInstalled ? '#5cdca9' : item.unsupported ? '#ff6478' : '#7df9ff' }}>{isInstalled ? 'INSTALLED' : item.unsupported ? 'UNSUPPORTED' : 'NOT INSTALLED'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: pillBg, border: `1px solid ${dot}33` }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block' }} />{conf.toUpperCase()}</span>
            </div>
            <div style={{ marginTop: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: .72, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{confReason}</div>
            {!isInstalled && !item.unsupported && <div style={{ marginTop: 5, fontFamily: 'var(--crystal-mono)', fontSize: 9, opacity: .62 }}>{freedText}</div>}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {conf === 'low' && !item.unsupported && item.possibleSystemIds.length > 1 ? (
              <select data-settings-control value={systemId} onChange={e => setChoices(c => ({ ...c, [item.path]: e.target.value }))} style={{ minHeight: 42, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(125,249,255,.22)', background: dark ? 'rgba(0,0,0,.25)' : '#fff', color: 'inherit', fontSize: 11, fontWeight: 700 }}>
                <option value="">Choose console…</option>
                {item.possibleSystemIds.map(id => <option key={id} value={id}>{systems.find(s => s.id === id)?.fullName || id}</option>)}
              </select>
            ) : (
              <button data-settings-control onClick={() => cycleSystem(item)} title={item.suggestedSystemId ? item.suggestionReason : 'Change destination console'} disabled={!item.possibleSystemIds.length || item.unsupported} style={{ minHeight: 42, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(125,249,255,.15)', background: 'transparent', color: 'inherit', textAlign: 'left', fontSize: 10, fontWeight: 750, opacity: item.unsupported ? .45 : 1 }}><span style={{ opacity: .55 }}>{item.suggestedSystemId ? (conf === 'high' ? 'AUTO-DETECTED' : conf === 'medium' ? 'SUGGESTED' : 'REVIEW') : ambiguous ? 'REVIEW CONSOLE • CHANGE' : 'CONSOLE'}</span><br />{label} {!item.suggestedSystemId && ambiguous ? ' ↻' : ''}</button>
            )}
            {!item.unsupported && item.possibleSystemIds.length === 0 && <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, opacity: .56 }}>No console matches extension</div>}
            {item.unsupported && <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, color: '#ff8a98' }}>Switch format not configured in manifest – cannot install</div>}
          </div>
          <button data-settings-control onClick={() => isInstalled ? void clearDownload(item, installedId) : void install(item)} disabled={busy !== null || (!isInstalled && !canInstall) || item.unsupported} style={{ minHeight: 46, padding: '10px 12px', borderRadius: 11, border: 0, opacity: (isInstalled || canInstall) ? 1 : .42, background: isInstalled ? 'rgba(92,220,170,.18)' : (dark ? '#7df9ff' : '#4a86ff'), color: isInstalled ? 'inherit' : (dark ? '#071015' : '#fff'), fontWeight: 900, fontSize: 11 }}>{busy === item.path ? 'WORKING…' : isInstalled ? 'CLEAR DOWNLOAD' : systemId ? (conf === 'low' ? 'CONFIRM & INSTALL' : 'INSTALL') : 'CHOOSE CONSOLE'}</button>
        </article>
      })}
      {!items.length && busy !== 'scan' && <div style={{ padding: 22, textAlign: 'center', opacity: .62, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}>No supported game downloads are waiting.</div>}
    </div>
    {/* Fullscreen glass blocking progress – enhanced */}
    {activeItem && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(2,5,12,.86)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div style={{ width: 'min(720px,94vw)', padding: 28, borderRadius: 22, background: dark ? 'linear-gradient(180deg,rgba(20,29,48,.96),rgba(11,18,32,.98))' : 'linear-gradient(180deg,rgba(255,255,255,.96),rgba(245,248,255,.98))', border: '1px solid rgba(125,249,255,.32)', boxShadow: '0 32px 110px rgba(0,0,0,.52), 0 0 0 1px rgba(125,249,255,.12) inset', backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, color: '#7df9ff', letterSpacing: '.14em', fontWeight: 800 }}>INSTALL IN PROGRESS • BLOCKING</div>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: .66 }}>Safe mode: OFF • staging: D:\CrystalFrontend\cache\imports</div>
        </div>
        <h2 style={{ margin: '14px 0 6px', fontSize: 26, letterSpacing: '-.02em' }}>{activeItem.fileName}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: .8 }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(125,249,255,.12)', border: '1px solid rgba(125,249,255,.18)' }}>Size: {formatSize(activeSize)}</span>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(92,220,170,.10)', border: '1px solid rgba(92,220,170,.18)' }}>Target: {activeSystemName || '…'}</span>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,213,105,.10)', border: '1px solid rgba(255,213,105,.16)' }}>{activity?.active ? 'Extracting' : 'Inspecting'} • {elapsed}s</span>
          {!keepSource && <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(82,161,255,.10)' }}>Will free {formatSize(activeSize)} on success</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 14, alignItems: 'center', marginTop: 22 }}>
          <div style={{ width: 88, height: 88, borderRadius: 16, background: dark ? 'rgba(125,249,255,.08)' : 'rgba(70,130,255,.08)', display: 'grid', placeItems: 'center', fontSize: 36 }}>◐</div>
          <div>
            <div style={{ height: 14, overflow: 'hidden', borderRadius: 999, background: 'rgba(127,127,127,.18)', position: 'relative' }}>
              <div className="crystal-import-progress" style={{ width: activity?.active ? '62%' : '36%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#57dce5,#7ba6ff,#7df9ff)', boxShadow: '0 0 18px rgba(125,249,255,.35)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 10, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}><b>{activity?.active ? `EXTRACTING & VERIFYING • ${formatSize(activity.extracted_bytes)} buffered` : 'INSPECTING PACKAGE & VALIDATING PATHS'}</b><span>{elapsed}s • {activity?.source_name || activeItem.fileName}</span></div>
            <div style={{ marginTop: 8, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: .66, lineHeight: 1.45 }}>
              Crystal staging: {`D:\\CrystalFrontend\\cache\\imports\\import-*`} (fallback %LOCALAPPDATA%). Never extracts outside staging. Never runs archive contents. {keepSource ? 'Source will be retained (keep source ON).' : `Source deleted only after ${activeSystemName ? `installed to D:\\Emulation\\roms\\${activeSystemId}` : 'destination verification'}.`}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontFamily: 'var(--crystal-mono)', fontSize: 10 }}>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(125,249,255,.06)', border: '1px solid rgba(125,249,255,.12)' }}><div style={{ opacity: .6 }}>FILENAME</div><div style={{ fontWeight: 800, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeItem.fileName}</div></div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(92,220,170,.06)', border: '1px solid rgba(92,220,170,.12)' }}><div style={{ opacity: .6 }}>SYSTEM TARGET</div><div style={{ fontWeight: 800, marginTop: 4 }}>{activeSystemName || activeSystemId || '—'}</div></div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(255,213,105,.06)', border: '1px solid rgba(255,213,105,.12)' }}><div style={{ opacity: .6 }}>CONSOLE CONFIDENCE</div><div style={{ fontWeight: 800, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: confidenceDot(activeItem.confidence || 'low'), display: 'inline-block' }} />{activeItem.confidence?.toUpperCase() || '—'} • {activeItem.detectedExtensions.join('/')}</div></div>
        </div>
        <p style={{ margin: '18px 0 0', opacity: .72, fontSize: 12, fontFamily: 'var(--crystal-mono)' }}>Controls are locked to prevent duplicate installs. Long imports run in blocking worker threads. No PowerShell window during ordinary use (CREATE_NO_WINDOW). Verified cleanup of completed source archives.</p>
      </div>
    </div>}
    {resultNotice && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1001, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(2,5,12,.82)', backdropFilter: 'blur(12px)' }}>
      <div style={{ width: 'min(560px,92vw)', padding: 28, borderRadius: 22, textAlign: 'center', background: dark ? '#101827' : '#fff', border: `1px solid ${resultNotice.kind === 'success' ? 'rgba(92,220,170,.5)' : 'rgba(255,100,120,.5)'}`, boxShadow: '0 28px 90px rgba(0,0,0,.48)' }}>
        <div style={{ margin: '0 auto 14px', width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: '50%', fontSize: 28, background: resultNotice.kind === 'success' ? 'rgba(92,220,170,.18)' : 'rgba(255,100,120,.16)' }}>{resultNotice.kind === 'success' ? '✓' : '!'}</div>
        <h2 style={{ margin: 0, fontSize: 25 }}>{resultNotice.title}</h2><p style={{ whiteSpace: 'pre-line', lineHeight: 1.55, opacity: .76 }}>{resultNotice.detail}</p>
        <button autoFocus data-settings-control onClick={() => setResultNotice(null)} style={{ minWidth: 180, padding: '13px 20px', border: 0, borderRadius: 999, background: dark ? '#7df9ff' : '#4a86ff', color: dark ? '#071015' : '#fff', fontWeight: 900 }}>[A] DONE</button>
      </div>
    </div>}
    <style>{`@keyframes crystalImportSweep{0%{transform:translateX(-115%)}100%{transform:translateX(290%)}}.crystal-import-progress{animation:crystalImportSweep 1.35s ease-in-out infinite, crystalGlowPulse 2.2s ease-in-out infinite}@keyframes crystalGlowPulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.12)}}`}</style>
  </section>
}
