import { useState, useCallback } from 'react'
import { isTauriEnvironment } from '../runtime/environment'
import { checkForUpdate, downloadAndInstallWithProgress } from '../updater/crystalUpdater'
import { CURRENT_VERSION, COMMIT_SHA, UPDATER_ENDPOINT } from '../runtime/buildInfo'
import type { CrystalUpdateInfo } from '../updater/crystalUpdater'

type CheckState = 'idle' | 'checking' | 'available' | 'uptodate' | 'error'

export function SettingsUpdaterPanel({ theme }: { theme: string }) {
  const [state, setState] = useState<CheckState>('idle')
  const [info, setInfo] = useState<CrystalUpdateInfo | null>(null)
  const [pct, setPct] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isDark = theme === 'dark'
  const isTauri = isTauriEnvironment()

  const doCheck = useCallback(async () => {
    if (!isTauri) {
      setErr('Updater requires installed Tauri mode (desktop). Browser dev cannot check.')
      setState('error')
      return
    }
    setState('checking')
    setErr(null)
    setInfo(null)
    try {
      const res = await checkForUpdate()
      if (!res) {
        setState('uptodate')
        setInfo(null)
      } else {
        setInfo(res)
        setState('available')
      }
    } catch (e: any) {
      setErr(e?.message || String(e))
      setState('error')
    }
  }, [isTauri])

  const doUpdate = useCallback(async () => {
    if (!info) return
    setDownloading(true)
    setErr(null)
    try {
      const result = await downloadAndInstallWithProgress((p) => {
        setPct(p)
      }, null) // we pass null – service re-checks internally to get full Update obj
      setDownloading(false)
      if (!result.ok) {
        setErr(result.error || 'update failed – kept current version')
        // keep available so user can retry
      }
    } catch (e: any) {
      setErr(e?.message || String(e))
      setDownloading(false)
    }
  }, [info])

  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 16px 14px',
        borderRadius: 16,
        background: isDark ? 'linear-gradient(180deg, rgba(18,22,36,0.86), rgba(12,16,28,0.76))' : 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,255,0.84))',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
        backdropFilter: 'blur(18px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.08)',
        boxShadow: isDark ? '0 12px 28px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.04)' : '0 10px 24px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.92)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', background: isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.12)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`, color: isDark ? '#7df9ff' : '#3a6ee8', fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 800 }}>↻</span>
          <span style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', opacity: 0.92 }}>Crystal Updates</span>
          <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`, opacity: 0.68 }}>signed • Tauri v2</span>
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, fontFamily: 'var(--crystal-mono, monospace)' }}>
          v{CURRENT_VERSION} • {COMMIT_SHA.slice(0,7)}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={doCheck}
          disabled={state === 'checking' || downloading}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: `1px solid ${isDark ? 'rgba(125,249,255,0.20)' : 'rgba(70,130,255,0.20)'}`,
            background: state === 'checking' ? (isDark ? 'rgba(255,255,255,0.06)' : '#f0f5ff') : isDark ? 'linear-gradient(100deg, rgba(125,249,255,0.14), rgba(125,249,255,0.06))' : 'linear-gradient(100deg, rgba(70,130,255,0.12), rgba(255,255,255,0.92))',
            color: isDark ? '#dbe8ff' : '#28365e',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: state === 'checking' ? 'wait' : 'pointer',
            opacity: downloading ? 0.6 : 1,
            boxShadow: isDark ? '0 6px 14px rgba(0,0,0,0.22)' : '0 4px 12px rgba(18,26,44,0.06)',
          }}
        >
          {state === 'checking' ? 'CHECKING…' : state === 'uptodate' ? 'CHECK FOR UPDATES' : 'CHECK FOR UPDATES'}
        </button>

        {state === 'uptodate' && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.7 }}>{info ? `You're up to date (v${info.version})` : `You're on v${CURRENT_VERSION} – remote unknown or up to date – CHECK FOR UPDATES again if endpoint was unavailable.`}</span>}
        {state === 'error' && !err?.includes('installed') ? <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, color: isDark ? '#ff9f9f' : '#a03a3a' }}>Check failed – kept current version – click CHECK FOR UPDATES to retry</span> : null}
        {state === 'available' && info && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.84, padding: '4px 10px', borderRadius: 999, background: isDark ? 'rgba(125,249,255,0.10)' : 'rgba(70,130,255,0.10)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.14)'}` }}>v{info.version} available • signed GitHub Release</span>}
      </div>

      {err && (
        <div style={{ marginTop: 10, fontFamily: 'var(--crystal-mono)', fontSize: 10.5, color: isDark ? '#ff9f9f' : '#a03a3a', opacity: 0.92, lineHeight: 1.45, padding: '8px 10px', borderRadius: 10, background: isDark ? 'rgba(255,80,80,0.08)' : 'rgba(255,220,220,0.56)', border: `1px solid ${isDark ? 'rgba(255,120,120,0.14)' : 'rgba(255,120,120,0.18)'}` }}>
          {err}
          {downloading ? '' : ' – kept current version'}
        </div>
      )}

      {state === 'available' && info && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button
            onClick={doUpdate}
            disabled={downloading}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              background: isDark ? 'linear-gradient(100deg, #7df9ff 0%, #a9f4ff 100%)' : 'linear-gradient(100deg, #4a86ff 0%, #7aa8ff 100%)',
              border: 'none',
              color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)',
              fontSize: 11.5,
              fontWeight: 800,
              cursor: downloading ? 'wait' : 'pointer',
              flex: 1,
              boxShadow: isDark ? '0 8px 18px rgba(125,249,255,0.22)' : '0 8px 16px rgba(70,130,255,0.18)',
            }}
          >
            {downloading ? `DOWNLOADING ${pct}%` : `UPDATE TO v${info.version}`}
          </button>
        </div>
      )}

      {downloading && (
        <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,60,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(4, pct)}%`, background: isDark ? 'linear-gradient(90deg, #7df9ff, #a78bfa)' : 'linear-gradient(90deg, #60a5fa, #7c3aed)', transition: 'width 180ms' }} />
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.58 }}>
        <span style={{ wordBreak: 'break-all', padding: '4px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.04)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}` }}>endpoint: {UPDATER_ENDPOINT}</span>
        {!isTauri && <span style={{ padding: '4px 8px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.66)' }}>• web-preview – installer only in Tauri desktop</span>}
      </div>
    </div>
  )
}
