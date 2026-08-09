/**
 * Crystal updater restrained UI – small boutique card, NOT full-screen block
 * Shown when update available. Also elegant progress + confirmation dialog.
 * Must not alter Golden Screens.
 */
import React from 'react'
import type { CrystalUpdateInfo } from '../updater/crystalUpdater'

type Props = {
  update: CrystalUpdateInfo | null
  downloading: boolean
  progressPct: number
  error: string | null
  onSkip: () => void
  onStartUpdate: () => void
  onConfirmInstall: () => void
  pendingConfirm: boolean
  onCancelConfirm: () => void
  theme: string
}

export function UpdaterBanner({ update, downloading, progressPct, error, onSkip, onStartUpdate, onConfirmInstall, pendingConfirm, onCancelConfirm, theme }: Props) {
  if (!update) return null

  const isDark = theme === 'dark'

  // elegant glass card 340px bottom-right above safe area, centered on small vp
  const card: React.CSSProperties = {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 'min(360px, calc(100vw - 36px))',
    zIndex: 40,
    pointerEvents: 'auto',
    background: isDark ? 'rgba(12,16,24,0.78)' : 'rgba(250,252,255,0.86)',
    backdropFilter: 'blur(18px) saturate(1.08)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.08)',
    border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(20,30,60,0.10)'}`,
    borderRadius: 14,
    boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.42), 0 0 0 0.5px rgba(125,249,255,0.08) inset' : '0 12px 32px rgba(10,18,40,0.14), 0 0 0 0.5px rgba(0,0,0,0.04) inset',
    padding: '14px 14px 12px',
    fontFamily: 'var(--crystal-mono, ui-monospace)',
    color: isDark ? '#e8f4ff' : '#16203a',
  }

  const tiny: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' as const, opacity: 0.68 }
  const title: React.CSSProperties = { fontSize: 13.5, fontWeight: 700 as any, letterSpacing: '-0.01em', marginTop: 6, fontFamily: 'system-ui, var(--crystal-display)' }

  if (pendingConfirm) {
    return (
      <div style={card} role="dialog" aria-label="Confirm install">
        <div style={tiny}>Crystal update downloaded</div>
        <div style={title}>Install Crystal v{update.version} now?</div>
        <div style={{ fontSize: 11, opacity: 0.74, marginTop: 8, lineHeight: 1.45 }}>App will restart to complete installation. Current games stay untouched – only Crystal binaries/assets replaced.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={onConfirmInstall}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 999,
              background: isDark ? 'linear-gradient(180deg, #7df9ff22, #60a5fa33)' : 'linear-gradient(180deg, #e8f0ff, #d6e4ff)',
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.26)' : 'rgba(60,90,200,0.18)'}`,
              color: isDark ? '#eaf8ff' : '#1e2a5a',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            INSTALL NOW
          </button>
          <button
            onClick={onCancelConfirm}
            style={{
              padding: '9px 12px',
              borderRadius: 999,
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(20,30,60,0.10)'}`,
              color: isDark ? '#d8e8ff' : '#3a4666',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={card} role="status" aria-live="polite">
      <div style={tiny}>Update available</div>
      <div style={title}>Crystal v{update.version} available</div>
      {update.body && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6, lineHeight: 1.45, maxHeight: 56, overflow: 'hidden', textOverflow: 'ellipsis' }}>{update.body.slice(0, 180)}</div>}
      {!downloading && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={onStartUpdate}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 999,
              background: isDark ? 'linear-gradient(180deg, #7af3ff1e, #6e8bff2a)' : 'linear-gradient(180deg, #f0f5ff, #dbe7ff)',
              border: `1px solid ${isDark ? 'rgba(125,249,255,0.22)' : 'rgba(60,90,200,0.16)'}`,
              color: isDark ? '#e8fbff' : '#273464',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            UPDATE
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(20,30,60,0.08)'}`,
              color: isDark ? '#cfe0ff' : '#4a5878',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            LATER
          </button>
        </div>
      )}
      {downloading && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 2, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,60,0.08)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(4, progressPct)}%`,
                background: isDark ? 'linear-gradient(90deg, #7df9ff, #a78bfa)' : 'linear-gradient(90deg, #60a5fa, #7c3aed)',
                transition: 'width 220ms cubic-bezier(0.16,1,0.3,1)',
              }}
            />
          </div>
          <div style={{ fontSize: 10, marginTop: 6, opacity: 0.66 }}>Downloading… {progressPct}%</div>
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 10.5, color: '#ff8b8b', opacity: 0.9 }}>{error}</div>}
    </div>
  )
}
