import React from 'react'
import { writeCrashReport, setCrashContext } from '../lib/crashReporter'

type Props = { children: React.ReactNode }
type State = { hasError: boolean; error: Error | null }

export class CrystalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    setCrashContext('error-boundary', null)
    void writeCrashReport({
      message: error.message,
      stack: error.stack,
      reactStack: info.componentStack || undefined,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        style={{
          width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
          background: '#0A0A0F', color: '#E6E8EF', fontFamily: 'var(--crystal-sans, system-ui)',
          overflow: 'hidden'
        }}
      >
        <div style={{
          padding: '28px 28px', borderRadius: 18, maxWidth: 520,
          background: 'rgba(21,24,33,0.86)', border: '1px solid rgba(230,235,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.55)', backdropFilter: 'blur(22px)'
        }}>
          <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
            Crystal hit a snag
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.76, lineHeight: 1.6, fontFamily: 'var(--crystal-mono)', marginBottom: 16 }}>
            {this.state.error?.message?.slice(0, 320) || 'Unexpected render error'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              autoFocus
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(125,249,255,0.22)',
                background: 'linear-gradient(100deg, rgba(125,249,255,0.18), rgba(125,249,255,0.06))',
                color: '#E6E8EF', fontFamily: 'var(--crystal-mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              A – Restart
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                try { window.history.pushState(null, '', '/'); window.location.hash = '' } catch {}
                window.location.href = window.location.origin + window.location.pathname
              }}
              style={{
                padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)',
                background: 'transparent', color: '#9AA0B2', fontFamily: 'var(--crystal-mono)', fontSize: 12, cursor: 'pointer',
              }}
            >
              B – Go Home
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 10, opacity: 0.5, fontFamily: 'var(--crystal-mono)' }}>
            Crash logged to D:\CrystalFrontend\logs\crystal-frontend-crash-*.json (basename only, &lt;4KB)
          </div>
        </div>
      </div>
    )
  }
}
