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
        padding: '12px 12px',
        borderRadius: 12,
        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.66)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', opacity: 0.9 }}>Updates</div>
        <div style={{ fontSize: 10, opacity: 0.55, fontFamily: 'var(--crystal-mono, monospace)' }}>
          Crystal v{CURRENT_VERSION} • {COMMIT_SHA}
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={doCheck}
          disabled={state === 'checking' || downloading}
          style={{
            padding: '7px 13px',
            borderRadius: 999,
            border: `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(60,90,200,0.14)'}`,
            background: state === 'checking' ? (isDark ? 'rgba(255,255,255,0.06)' : '#f0f5ff') : isDark ? 'rgba(20,28,44,0.64)' : 'rgba(255,255,255,0.92)',
            color: isDark ? '#dbe8ff' : '#28365e',
            fontSize: 11,
            cursor: state === 'checking' ? 'wait' : 'pointer',
            opacity: downloading ? 0.6 : 1,
          }}
        >
          {state === 'checking' ? 'CHECKING…' : 'CHECK FOR UPDATES'}
        </button>

        {state === 'uptodate' && <span style={{ fontSize: 11, opacity: 0.7 }}>You're up to date.</span>}
        {state === 'error' && !err?.includes('installed') ? <span style={{ fontSize: 11, color: '#ff8b8b' }}>Check failed – you're on latest</span> : null}
        {state === 'available' && info && <span style={{ fontSize: 11, opacity: 0.8 }}>Crystal v{info.version} available</span>}
      </div>

      {err && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: isDark ? '#ff9f9f' : '#a03a3a', opacity: 0.92, lineHeight: 1.4 }}>
          {err}
          {downloading ? '' : ' – kept current version'}
        </div>
      )}

      {state === 'available' && info && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={doUpdate}
            disabled={downloading}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: isDark ? 'linear-gradient(180deg, #7af3ff1e, #6e8bff2a)' : 'linear-gradient(180deg, #f0f5ff, #dbe7ff)',
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.22)' : 'rgba(60,90,200,0.16)'}`,
              color: isDark ? '#e8fbff' : '#273464',
              fontSize: 11,
              fontWeight: 600,
              cursor: downloading ? 'wait' : 'pointer',
              flex: 1,
            }}
          >
            {downloading ? `DOWNLOADING ${pct}%` : `UPDATE TO v${info.version}`}
          </button>
        </div>
      )}

      {downloading && (
        <div style={{ marginTop: 8, height: 2, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,60,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(4, pct)}%`, background: isDark ? 'linear-gradient(90deg, #7df9ff, #a78bfa)' : 'linear-gradient(90deg, #60a5fa, #7c3aed)', transition: 'width 180ms' }} />
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, opacity: 0.58, fontFamily: 'var(--crystal-mono)' }}>
        <span style={{ wordBreak: 'break-all' }}>endpoint: {UPDATER_ENDPOINT}</span>
        {!isTauri && <span>• web-preview – installer only works in Tauri desktop build</span>}
      </div>
    </div>
  )
}
