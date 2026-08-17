import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class CrystalErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Crystal fatal UI error]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080b12', color: '#edf7ff', padding: 28, fontFamily: 'system-ui' }}>
      <section style={{ width: 'min(620px, 92vw)', padding: 24, borderRadius: 18, background: 'rgba(18,24,38,.94)', border: '1px solid rgba(125,249,255,.2)' }}>
        <div style={{ color: '#7df9ff', fontWeight: 800, letterSpacing: '.12em', fontSize: 12 }}>CRYSTAL RECOVERY</div>
        <h1 style={{ margin: '10px 0 8px', fontSize: 25 }}>The interface hit an error</h1>
        <p style={{ opacity: .72, lineHeight: 1.5 }}>Your ROMs and emulator configuration were not changed. Reload Crystal to recover the frontend.</p>
        <pre style={{ whiteSpace: 'pre-wrap', opacity: .62, fontSize: 11, maxHeight: 120, overflow: 'auto' }}>{this.state.error}</pre>
        <button autoFocus onClick={() => window.location.reload()} style={{ marginTop: 14, padding: '11px 18px', border: 0, borderRadius: 999, background: '#7df9ff', color: '#061018', fontWeight: 850 }}>[A] RELOAD CRYSTAL</button>
      </section>
    </main>
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrystalErrorBoundary><App /></CrystalErrorBoundary>
  </StrictMode>,
)
