/**
 * V8.4 DISCOVER — Boutique-hotel premium Discovery view
 * Crystal-native, 1920x1080 / 1140x648 safe, heavy defocus bg, no shop/cart/price
 *
 * Props allow empty prefill (System Landing) and selected game context (Library)
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { GameEntry } from '../runtime/backend'
import discoveryService, { type DiscoveryResult, canonicalVaultUrl } from '../lib/discoveryService'
import { isInLibrary } from '../lib/discoveryMatching'
import SystemLogo from './SystemLogo'

type DiscoverProps = {
  systemId: string
  systemFullName: string
  theme: 'light' | 'dark'
  backgroundUrl?: string | null
  logoUrl?: string | null
  onBack: () => void
  selectedLocalGame?: GameEntry | null
  libraryGames?: GameEntry[] | null
  onOpenDiscoverGame?: (id: string) => void
}

export function DiscoverView({
  systemId,
  systemFullName,
  theme,
  backgroundUrl,
  logoUrl,
  onBack,
  selectedLocalGame,
  libraryGames,
}: DiscoverProps) {
  const isDark = theme === 'dark'
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const prefill = useMemo(() => {
    if (selectedLocalGame?.name) return selectedLocalGame.name
    return ''
  }, [selectedLocalGame])

  const [query, setQuery] = useState(prefill)
  const [debounced, setDebounced] = useState(prefill)
  const [results, setResults] = useState<DiscoveryResult[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [offline, setOffline] = useState(false)
  const [schemaChanged, setSchemaChanged] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [focusedIdx, setFocusedIdx] = useState(0)
  const [selectedDetail, setSelectedDetail] = useState<DiscoveryResult | null>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)

  // Detail resolved for panel with extra metadata
  const [detailResolving, setDetailResolving] = useState(false)
  const [detailFull, setDetailFull] = useState<any>(null)

  // Abort controller for stale searches
  const abortRef = useRef<AbortController | null>(null)

  // autoFocus desktop
  useEffect(() => {
    const t = setTimeout(() => {
      try { searchInputRef.current?.focus() } catch {}
    }, 120)
    return () => clearTimeout(t)
  }, [])

  // debounce 340ms
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 340)
    return () => clearTimeout(h)
  }, [query])

  useEffect(() => {
    setFocusedIdx(0)
  }, [debounced, results.length])

  // search effect
  useEffect(() => {
    let cancelled = false
    async function doSearch() {
      if (!debounced || debounced.length < 1) {
        setResults([])
        setTotal(0)
        setSearching(false)
        setOffline(false)
        setSchemaChanged(false)
        setErrorMsg(null)
        return
      }
      if (abortRef.current) {
        try { abortRef.current.abort() } catch {}
      }
      const ac = new AbortController()
      abortRef.current = ac
      setSearching(true)
      setOffline(false)
      setSchemaChanged(false)
      setErrorMsg(null)
      try {
        const res = await discoveryService.search({ systemId, query: debounced, limit: 24, signal: ac.signal })
        if (cancelled || ac.signal.aborted) return
        setResults(res.results)
        setTotal(res.total)
        setOffline(!!res.offline)
        setSchemaChanged(!!res.schemaChanged)
        if (res.error && !res.offline && !res.schemaChanged) setErrorMsg(res.error)
      } catch (e: any) {
        if (cancelled) return
        if (e?.name === 'AbortError') return
        const msg = e?.message || String(e)
        if (/offline|network/i.test(msg)) setOffline(true)
        else if (/schema/i.test(msg)) setSchemaChanged(true)
        else setErrorMsg(msg)
      } finally {
        if (!cancelled && abortRef.current === ac) setSearching(false)
      }
    }
    doSearch()
    return () => { cancelled = true }
  }, [debounced, systemId])

  // focus follow scroll
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current.querySelector(`[data-result-idx="${focusedIdx}"]`) as HTMLElement | null
    if (el) {
      try { el.scrollIntoView({ block: 'nearest', behavior: 'auto' }) } catch {}
    }
  }, [focusedIdx])

  const inLibraryCheck = useCallback((title: string) => {
    if (!libraryGames) return false
    return isInLibrary(title, systemId, libraryGames as any)
  }, [libraryGames, systemId])

  const handleOpenVault = useCallback(async (id: string) => {
    try {
      await discoveryService.open(id)
    } catch {}
  }, [])

  const handleOpenVaultRoot = useCallback(async () => {
    try {
      await (discoveryService as any).openRoot?.()
    } catch {
      // fallback direct
      try { window.open('https://vimm.net/vault', '_blank') } catch {}
    }
  }, [])

  // controller bindings exposed via dataset and window event? Parent App.tsx will call onNav-> we support imperative key handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showDetailPanel) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault()
          setShowDetailPanel(false)
          setSelectedDetail(null)
        }
      } else {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault()
          onBack()
        }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'k') {
          e.preventDefault()
          setFocusedIdx(i => Math.max(0, i - 1))
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'j') {
          e.preventDefault()
          setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const r = results[focusedIdx]
          if (r) openDetail(r)
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault()
          searchInputRef.current?.focus()
        }
      }
    }
    const onDiscoverNav = (ev: any) => {
      const action = ev?.detail as string
      if (!action) return
      if (showDetailPanel) {
        if (action === 'back' || action === 'menu' || action === 'confirm') {
          // back closes detail, confirm would be open-on-vimm inside detail? For now close handled via button
          if (action === 'back') {
            setShowDetailPanel(false)
            setSelectedDetail(null)
          }
          return
        }
      } else {
        if (action === 'up') setFocusedIdx(i => Math.max(0, i - 1))
        else if (action === 'down') setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        else if (action === 'left') setFocusedIdx(i => Math.max(0, i - 1))
        else if (action === 'right') setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        else if (action === 'confirm') {
          const r = results[focusedIdx]
          if (r) openDetail(r)
        } else if (action === 'media' || action === 'search' || action === 'favorite') {
          try { searchInputRef.current?.focus() } catch {}
        } else if (action === 'back') {
          // let App's onBack handle origin restore – still close discover view via our onBack
          onBack()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-discover-nav' as any, onDiscoverNav)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('crystal-discover-nav' as any, onDiscoverNav)
    }
  }, [results, focusedIdx, showDetailPanel, onBack])

  async function openDetail(r: DiscoveryResult) {
    setSelectedDetail(r)
    setShowDetailPanel(true)
    setDetailFull(null)
    setDetailResolving(true)
    try {
      const d = await discoveryService.detail(r.id, systemId)
      setDetailFull(d)
    } catch {
      setDetailFull(null)
    } finally {
      setDetailResolving(false)
    }
  }

  const resultCountLabel = useMemo(() => {
    if (searching) return 'searching…'
    if (!debounced) return 'type to search catalog'
    return `${total || results.length} results`
  }, [searching, debounced, total, results.length])

  return (
    <div
      className="discover-view"
      data-theme={theme}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: isDark ? '#0a0a0f' : '#f6f8fd',
        color: isDark ? '#eef7ff' : '#16213e',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 7,
      }}
    >
      {/* Heavily blurred bg layer */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: '-6%',
              width: '112%',
              height: '112%',
              objectFit: 'cover',
              filter: 'blur(30px) saturate(0.82) brightness(0.68)',
              transform: 'scale(1.06)',
              opacity: isDark ? 0.86 : 0.58,
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: isDark ? '#12131a' : '#eceef8' }} />
        )}
        {/* overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: isDark
            ? 'linear-gradient(180deg, rgba(10,12,18,0.34), rgba(10,12,18,0.52)), radial-gradient(84% 68% at 50% 18%, transparent 8%, rgba(6,9,14,0.42) 72%)'
            : 'linear-gradient(180deg, rgba(250,252,255,0.64), rgba(240,244,255,0.72)), radial-gradient(84% 66% at 50% 22%, transparent 10%, rgba(234,238,248,0.42) 70%)',
        }} />
        {/* premium vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.18) 100%)', opacity: isDark ? 0.55 : 0.22 }} />
      </div>

      {/* Top chrome ~84px */}
      <div style={{
        height: 84,
        minHeight: 84,
        flexShrink: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
        backdropFilter: 'blur(22px) saturate(1.12)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
        background: isDark ? 'rgba(10,12,18,0.32)' : 'rgba(255,255,255,0.54)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              appearance: 'none',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.82)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
              borderRadius: 999,
              width: 34, height: 34,
              display: 'grid', placeItems: 'center',
              cursor: 'pointer',
              color: isDark ? '#eef7ff' : '#16213e',
            }}
          >←</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.12em', opacity: 0.6, textTransform: 'uppercase' as const }}>{systemFullName}</div>
            <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              DISCOVER
              <span style={{
                fontFamily: 'var(--crystal-mono)', fontSize: 9.5, letterSpacing: '0.08em',
                padding: '3px 8px', borderRadius: 999,
                background: isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.10)',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
                color: isDark ? 'rgba(230,244,255,0.88)' : 'rgba(18,26,44,0.78)',
                fontWeight: 700,
              }}>VIMM'S LAIR • CATALOG ONLY</span>
            </div>
          </div>
        </div>

        {/* large Canvas console identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isDark ? 0.92 : 0.90 }}>
          {logoUrl && (
            <SystemLogo systemId={systemId} logoUrl={logoUrl} fallbackName={systemFullName} isSelected theme={theme} style={{ minWidth: 140, maxWidth: 220, minHeight: 32 }} />
          )}
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.54, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
            {resultCountLabel}
          </div>
        </div>
      </div>

      {/* Search ~60px */}
      <div style={{
        height: 60, minHeight: 60, flexShrink: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 22px',
        background: isDark ? 'rgba(10,12,18,0.18)' : 'rgba(255,255,255,0.36)',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.05)'}`,
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 10,
          background: isDark ? 'rgba(18,22,36,0.72)' : 'rgba(255,255,255,0.84)',
          border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
          borderRadius: 12,
          padding: '0 12px',
          height: 42,
          boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 6px 16px rgba(18,26,44,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}>
          <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.56, whiteSpace: 'nowrap' }}>
            {systemFullName.toUpperCase()} — Search Vimm's Lair
          </span>
          <input
            ref={searchInputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { if (query) { setQuery(''); e.preventDefault() } else onBack() } }}
            placeholder={selectedLocalGame ? `“${selectedLocalGame.name}”` : 'title, no shop terms…'}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: isDark ? '#eef7ff' : '#16213e',
              fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 500,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✕</button>
          )}
          {searching && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.42)'}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'crystal-spin 0.8s linear infinite' }} />
          )}
        </div>
        <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.54, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[X] EDIT</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[A] OPEN</span>
        </div>
      </div>

      {/* Results scrollable */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', zIndex: 1, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {offline && (
          <div style={{
            padding: '18px 16px', borderRadius: 12,
            background: isDark ? 'rgba(20,16,12,0.52)' : 'rgba(255,244,230,0.82)',
            border: `1px solid ${isDark ? 'rgba(255,180,120,0.18)' : 'rgba(180,120,20,0.18)'}`,
            fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'var(--crystal-display)', fontSize: 13 }}>VIMM'S LAIR UNAVAILABLE</div>
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Network offline or Vimm's Lair unreachable. You can still open the vault in your browser.</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN VIMM'S LAIR IN BROWSER</button>
          </div>
        )}
        {schemaChanged && (
          <div style={{
            padding: '18px 16px', borderRadius: 12,
            background: isDark ? 'rgba(16,14,24,0.52)' : 'rgba(238,236,255,0.84)',
            border: `1px solid ${isDark ? 'rgba(160,140,255,0.18)' : 'rgba(100,80,180,0.18)'}`,
            fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'var(--crystal-display)', fontSize: 13 }}>CATALOG FORMAT CHANGED</div>
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Crystal's catalog parser no longer matches Vimm's layout. Please update Crystal or open externally.</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN VIMM'S LAIR IN BROWSER</button>
          </div>
        )}
        {!offline && !schemaChanged && !searching && debounced && results.length === 0 && (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.5, padding: '24px 4px' }}>
            No catalog entries for “{debounced}” on {systemFullName}. Try broader title. {errorMsg && <span style={{ color: '#ff7b7b' }}> {errorMsg}</span>}
          </div>
        )}
        {!offline && !schemaChanged && results.map((r, idx) => {
          const focused = idx === focusedIdx
          const inLib = inLibraryCheck(r.title)
          return (
            <div
              key={`${r.id}-${idx}`}
              data-result-idx={idx}
              onClick={() => { setFocusedIdx(idx); openDetail(r) }}
              tabIndex={0}
              onFocus={() => setFocusedIdx(idx)}
              style={{
                display: 'flex',
                gap: 12,
                padding: '12px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                background: focused
                  ? isDark ? 'linear-gradient(100deg, rgba(125,249,255,0.13), rgba(125,249,255,0.06) 62%, rgba(255,255,255,0.03))' : 'linear-gradient(100deg, rgba(70,130,255,0.12), rgba(90,160,255,0.06) 62%, rgba(255,255,255,0.72))'
                  : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.42)',
                border: `1px solid ${focused ? (isDark ? 'rgba(125,249,255,0.32)' : 'rgba(70,130,255,0.28)') : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)'}`,
                boxShadow: focused ? (isDark ? '0 8px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(125,249,255,0.08) inset, 0 0 16px rgba(125,249,255,0.14)' : '0 8px 18px rgba(18,26,44,0.10), inset 0 1px 0 rgba(255,255,255,0.9)') : 'none',
                transform: focused ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              {r.thumbUrl ? (
                <img src={r.thumbUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.08)'}`, flexShrink: 0, background: '#fff' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)', display: 'grid', placeItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.5, flexShrink: 0 }}>◐</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.62 }}>
                  {r.region && <span style={{ padding: '2px 7px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'} ` }}>{r.region}</span>}
                  {r.year && <span>{r.year}</span>}
                  {r.developer && <span style={{ opacity: 0.7 }}>• {r.developer.slice(0, 18)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999,
                    background: r.availability === 'available' ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(90,180,120,0.14)') : r.availability === 'takedown' || r.availability === 'unavailable' ? (isDark ? 'rgba(255,120,120,0.12)' : 'rgba(255,120,120,0.16)') : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${r.availability === 'available' ? 'rgba(125,249,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
                  }}>{r.availability === 'available' ? 'AVAILABLE' : r.availability === 'takedown' ? 'DOWNLOAD UNAVAILABLE' : r.availability.toUpperCase()}</span>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999,
                    background: inLib ? (isDark ? 'rgba(255,214,90,0.16)' : 'rgba(255,200,60,0.18)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.05)',
                    border: `1px solid ${inLib ? (isDark ? 'rgba(255,214,90,0.24)' : 'rgba(255,180,0,0.24)') : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                    color: inLib ? (isDark ? '#ffd85a' : '#8a5a00') : undefined,
                  }}>{inLib ? '★ IN YOUR LIBRARY' : 'NOT IN YOUR LIBRARY'}</span>
                </div>
              </div>
              <div style={{ alignSelf: 'center', opacity: focused ? 0.9 : 0.32, fontSize: 12 }}>↗</div>
            </div>
          )
        })}
      </div>

      {/* Detail overlay/panel */}
      {showDetailPanel && selectedDetail && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: isDark ? 'rgba(8,11,18,0.56)' : 'rgba(244,247,255,0.46)',
          backdropFilter: 'blur(16px) saturate(1.1)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.1)',
          display: 'grid', placeItems: 'center',
          padding: '22px',
        }} onClick={() => { setShowDetailPanel(false); setSelectedDetail(null) }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(640px, 92vw)', maxHeight: '86vh', overflowY: 'auto',
            background: isDark ? 'linear-gradient(180deg, rgba(18,22,36,0.96), rgba(12,16,26,0.94))' : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,255,0.94))',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
            borderRadius: 16,
            boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.56), 0 0 0 1px rgba(125,249,255,0.08) inset' : '0 24px 64px rgba(18,26,44,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
            padding: '20px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{(selectedDetail.system || systemFullName).toUpperCase()} • {selectedDetail.region || '--'} • {selectedDetail.year || '--'}</div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 20, fontWeight: 780, marginTop: 4, letterSpacing: '-0.02em' }}>{detailFull?.title || selectedDetail.title}</div>
              </div>
              <button onClick={() => { setShowDetailPanel(false); setSelectedDetail(null) }} style={{
                width: 32, height: 32, borderRadius: '50%', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: isDark ? 'rgba(255,255,255,0.06)' : '#fff', cursor: 'pointer',
              }}>✕</button>
            </div>

            {detailResolving && (
              <div style={{ marginTop: 12, fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.6 }}>Resolving detail…</div>
            )}

            {(detailFull || selectedDetail) && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--crystal-mono)', fontSize: 10.5 }}>
                  {(detailFull?.developer || selectedDetail.developer) && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>DEV {(detailFull?.developer || selectedDetail.developer)}</span>}
                  {(detailFull?.publisher || selectedDetail.publisher) && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>PUB {(detailFull?.publisher || selectedDetail.publisher)}</span>}
                  {(detailFull?.players || selectedDetail.players) && <span style={{ padding: '4px 9px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}` } }>{detailFull?.players || selectedDetail.players}P</span>}
                  {selectedDetail.discCount && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>{selectedDetail.discCount} DISC</span>}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 999,
                    background: (() => {
                      const av = detailFull?.availability || selectedDetail.availability
                      return av === 'available' ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(90,180,120,0.14)') : (isDark ? 'rgba(255,120,120,0.16)' : 'rgba(255,120,120,0.16)')
                    })(),
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  }}>{(() => {
                    const av = detailFull?.availability || selectedDetail.availability
                    if (av === 'takedown' || av === 'unavailable') return 'CATALOG ENTRY • DOWNLOAD UNAVAILABLE'
                    return `DOWNLOAD • ${String(av).toUpperCase()}`
                  })()}</span>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 999,
                    background: inLibraryCheck((detailFull?.title || selectedDetail.title)) ? (isDark ? 'rgba(255,214,90,0.16)' : 'rgba(255,200,60,0.18)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.06)',
                    border: `1px solid ${inLibraryCheck((detailFull?.title || selectedDetail.title)) ? 'rgba(255,214,90,0.22)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                  }}>{inLibraryCheck((detailFull?.title || selectedDetail.title)) ? '★ IN YOUR LIBRARY' : 'NOT IN YOUR LIBRARY'}</span>
                </div>

                {(detailFull?.verification || selectedDetail.verification) && (
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.7 }}>
                    Verification: {detailFull?.verification || selectedDetail.verification} • {detailFull?.mediaType || 'ISO'} • Rating {detailFull?.rating || selectedDetail.rating || '--'}
                  </div>
                )}

                {(detailFull?.description || detailFull?.title) && (
                  <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, lineHeight: 1.5, opacity: 0.82, maxWidth: '56ch' }}>
                    {detailFull?.description || 'Catalog entry from Vimm\'s Lair – reference metadata preserved. Crystal remains catalog-only, no file fetch.'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleOpenVault(selectedDetail.id)}
                    style={{
                      appearance: 'none',
                      padding: '11px 18px',
                      borderRadius: 999,
                      border: 'none',
                      background: isDark ? '#7df9ff' : '#4a86ff',
                      color: isDark ? '#041018' : '#fff',
                      fontFamily: 'var(--crystal-mono)', fontSize: 11.5, fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: isDark ? '0 8px 20px rgba(125,249,255,0.22)' : '0 8px 18px rgba(70,130,255,0.22)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', display: 'grid', placeItems: 'center', fontSize: 11 }}>A</span>
                    OPEN ON VIMM'S LAIR
                  </button>
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.52, alignSelf: 'center', maxWidth: 220 }}>
                    {canonicalVaultUrl(selectedDetail.id)}
                  </div>
                </div>

                {(detailFull?.availability === 'unavailable' || detailFull?.availability === 'takedown' || selectedDetail.availability === 'unavailable' || selectedDetail.availability === 'takedown') && (
                  <div style={{
                    marginTop: 6,
                    padding: '10px 12px', borderRadius: 10,
                    background: isDark ? 'rgba(255,120,120,0.10)' : 'rgba(255,240,240,0.84)',
                    border: `1px solid ${isDark ? 'rgba(255,120,120,0.18)' : 'rgba(255,120,120,0.22)'}`,
                    fontFamily: 'var(--crystal-mono)', fontSize: 10.5,
                  }}>
                    CATALOG ENTRY AVAILABLE • DOWNLOAD AVAILABILITY UNAVAILABLE — preserved for reference. Open externally to see Vimm's note.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
        .discover-view input::placeholder { opacity: 0.42; }
      `}</style>
    </div>
  )
}

export default DiscoverView
