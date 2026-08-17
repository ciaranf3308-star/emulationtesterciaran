/**
 * NewsPulseRow – Emulation Pulse bottom row
 * Premium gaming OS: graphite / silver / acrylic / cool electric cyan
 * Shows 5 latest titles “EmuDeck 2.7 → Wii fixes” style
 * Tap A opens via safe_url_open (https only host whitelist, external browser never inline webview)
 * Transform/opacity perf, respects 1152x654 no clipped
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { invokeBackend } from '../runtime/backend'
import { isTauriEnvironment } from '../runtime/environment'

export type NewsItem = {
  title: string
  url: string
  source: string
  published_at: string
  summary: string
}

type Props = {
  theme: 'light' | 'dark'
}

const MAX_VISIBLE = 5

function trimTitleForPulse(title: string): string {
  // "EmuDeck 2.7 → Wii fixes" style – keep source prefix already in title? We create short
  const t = title.trim()
  if (t.length <= 72) return t
  return t.slice(0, 69).trimEnd() + '…'
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.parse(iso)
    if (isNaN(ms)) return ''
    const diff = Date.now() - ms
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return '1d ago'
    if (days < 7) return `${days}d ago`
    return new Date(ms).toLocaleDateString()
  } catch {
    return ''
  }
}

export default function NewsPulseRow({ theme }: Props) {
  const isDark = theme === 'dark'
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (forceRefresh = false) => {
    if (!isTauriEnvironment()) {
      setLoading(false)
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (forceRefresh) {
        const refreshed = await invokeBackend<NewsItem[]>('refresh_news', {})
        setItems(refreshed.slice(0, MAX_VISIBLE))
      } else {
        const cached = await invokeBackend<NewsItem[]>('get_cached_news', {})
        if (cached && cached.length > 0) {
          setItems(cached.slice(0, MAX_VISIBLE))
          // check freshness – if stale, background refresh
          try {
            const fresh = await invokeBackend<boolean>('get_news_freshness', {})
            if (!fresh) {
              invokeBackend<NewsItem[]>('refresh_news', {}).then(r => {
                if (r && r.length) setItems(r.slice(0, MAX_VISIBLE))
              }).catch(() => {})
            }
          } catch {}
        } else {
          // no cache – fetch
          const refreshed = await invokeBackend<NewsItem[]>('refresh_news', {})
          setItems(refreshed.slice(0, MAX_VISIBLE))
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (/NEWS_FETCH_ALL_FAILED/.test(msg)) {
        // keep empty but show hint
        setError('offline')
      } else {
        setError(msg.slice(0, 120))
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const openUrl = useCallback(async (url: string) => {
    if (!url) return
    if (!isTauriEnvironment()) {
      try { window.open(url, '_blank', 'noopener') } catch {}
      return
    }
    try {
      await invokeBackend<void>('safe_url_open', { url })
    } catch (e: any) {
      setError(e?.message?.slice(0, 100) || 'open failed')
    }
  }, [])

  // keyboard/gamepad navigation – left/right cycle, A/Enter open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedIdx(i => Math.min(Math.max(items.length - 1, 0), i + 1))
      } else if (e.key === 'Enter' || e.key === ' ') {
        // only when focus is within pulse row – we detect via data attr
        const active = document.activeElement?.getAttribute('data-news-focus')
        if (active != null || containerRef.current?.contains(document.activeElement)) {
          e.preventDefault()
          const it = items[focusedIdx]
          if (it) openUrl(it.url)
        }
      } else if (e.key.toLowerCase() === 'r' && e.ctrlKey) {
        // Ctrl+R refresh bypass
        e.preventDefault()
        load(true)
      }
    }
    const onNav = (ev: any) => {
      const action = ev?.detail as string
      if (!action) return
      if (action === 'left') setFocusedIdx(i => Math.max(0, i - 1))
      else if (action === 'right') setFocusedIdx(i => Math.min(Math.max(items.length - 1, 0), i + 1))
      else if (action === 'confirm') {
        const it = items[focusedIdx]
        if (it) openUrl(it.url)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-discover-nav' as any, onNav)
    window.addEventListener('crystal-news-nav' as any, onNav)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('crystal-discover-nav' as any, onNav)
      window.removeEventListener('crystal-news-nav' as any, onNav)
    }
  }, [items, focusedIdx, openUrl, load])

  const visible = useMemo(() => items.slice(0, MAX_VISIBLE), [items])

  if (!isTauriEnvironment() && visible.length === 0 && !loading) {
    // no Tauri – don't show in web preview to avoid clutter, but still allow minimal
    return null
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Emulation Pulse News"
      style={{
        width: '100%',
        flexShrink: 0,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 22px 14px',
        background: isDark ? 'rgba(8,10,16,0.38)' : 'rgba(255,255,255,0.48)',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
        backdropFilter: 'blur(14px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
        // perf: only transform/opacity
        willChange: 'transform',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            opacity: 0.58,
          }}>EMULATION PULSE</span>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: loading ? '#ffd85a' : '#7df9ff',
            boxShadow: loading ? '0 0 8px rgba(255,216,90,0.6)' : '0 0 8px rgba(125,249,255,0.6)',
            display: 'inline-block',
            // perf only opacity/transform, no layout thrash
            animation: loading ? 'crystal-pulse-dot 1.2s ease-in-out infinite' : undefined,
          }} />
          {loading && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.45 }}>loading…</span>}
          {error && error !== 'offline' && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.5, color: '#ff9a9a' }}>{error}</span>}
          {error === 'offline' && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.5 }}>offline • cached</span>}
        </div>
        <button
          onClick={() => load(true)}
          title="Refresh news (bypass cache)"
          style={{
            appearance: 'none',
            background: 'transparent',
            border: `1px solid ${isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.14)'}`,
            borderRadius: 8,
            padding: '3px 8px',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10,
            cursor: 'pointer',
            color: isDark ? '#7df9ff' : '#3a6ae0',
            opacity: 0.9,
          }}
        >⟳ REFRESH</button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          // respect 1152x654 no clipped
          maxWidth: '100%',
          paddingBottom: 2,
        }}
      >
        {visible.length === 0 && !loading && (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.45, padding: '8px 4px' }}>
            No pulse yet — {isTauriEnvironment() ? 'pulling emulation news…' : 'Tauri required for live pulse'}
          </div>
        )}
        {visible.map((it, idx) => {
          const focused = idx === focusedIdx
          const rel = formatRelative(it.published_at)
          return (
            <button
              key={`${it.source}-${idx}-${it.url}`}
              data-news-focus={idx}
              onClick={() => openUrl(it.url)}
              onFocus={() => setFocusedIdx(idx)}
              tabIndex={0}
              style={{
                flex: '0 0 230px',
                minWidth: 230,
                maxWidth: 230,
                minHeight: 72,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '10px 11px',
                borderRadius: 11,
                cursor: 'pointer',
                background: focused
                  ? isDark ? 'linear-gradient(100deg, rgba(125,249,255,0.14), rgba(125,249,255,0.06) 64%, rgba(255,255,255,0.03))' : 'linear-gradient(100deg, rgba(70,130,255,0.12), rgba(90,160,255,0.06) 64%, rgba(255,255,255,0.74))'
                  : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.64)',
                border: `1px solid ${focused ? (isDark ? 'rgba(125,249,255,0.32)' : 'rgba(70,130,255,0.26)') : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)'}`,
                boxShadow: focused ? (isDark ? '0 6px 18px rgba(0,0,0,0.24), 0 0 0 1px rgba(125,249,255,0.08) inset' : '0 6px 16px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.9)') : 'none',
                transform: focused ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background 160ms, border-color 160ms, box-shadow 160ms',
                willChange: 'transform',
                outline: focused ? `2px solid ${isDark ? '#7df9ff' : '#4a86ff'}` : 'none',
                outlineOffset: 1,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)',
                  border: `1px solid ${isDark ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.14)'}`,
                  color: isDark ? '#7df9ff' : '#2a5fdc',
                  flexShrink: 0,
                }}>{it.source}</span>
                {rel && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, opacity: 0.48 }}>{rel}</span>}
              </div>
              <div style={{
                fontFamily: 'var(--crystal-display)',
                fontSize: 12.5,
                fontWeight: 600,
                lineHeight: 1.28,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                color: isDark ? '#eaf8ff' : '#16213e',
                minHeight: 32,
              }}>{trimTitleForPulse(it.title)}</div>
              {/* subtle arrow hint */}
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: focused ? 0.72 : 0.38, marginTop: 2 }}>↗ OPEN • A</div>
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes crystal-pulse-dot { 0%,100% { opacity: 0.9; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.9); } }
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
