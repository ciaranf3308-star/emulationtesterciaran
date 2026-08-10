/**
 * Crystal Discovery – ROMsFun catalog reference
 * Premium gaming OS: graphite / silver / acrylic glass / cool electric cyan accent
 * Controller-first, collectible hardware culture presentation – NOT boutique-hotel hospitality
 *
 * Props allow empty prefill (System Landing) and selected game context (Library)
 * V8.4.1 HARDENING: empty query returns empty locally (no network), additive controller mapping,
 * detail/controller deterministic (A open, B close detail -> results, B from results -> origin)
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { GameEntry } from '../runtime/backend'
import discoveryService, { type DiscoveryResult, canonicalVaultUrl } from '../lib/discoveryService'
import { isInLibrary } from '../lib/discoveryMatching'
import SystemLogo from './SystemLogo'

export type BeginAcquisitionRequest = {
  systemId: string
  expectedTitle: string
  providerId?: string
  initialUrl?: string
  openExternalPage: () => Promise<void>
}

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
  onBeginAcquisition?: (request: BeginAcquisitionRequest) => unknown
  acquisitionActive?: boolean
  acquisitionPhase?: string | null
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
  onBeginAcquisition,
  acquisitionActive,
}: DiscoverProps) {
  const isDark = theme === 'dark'
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const prefill = useMemo(() => {
    if (selectedLocalGame?.name) return selectedLocalGame.name
    try {
      if (typeof window !== 'undefined') {
        const w = window as any
        if (w.__crystal_discover_prefill_q) return String(w.__crystal_discover_prefill_q)
        const sp = new URLSearchParams(window.location.search)
        const q = sp.get('q')
        if (q) return q
      }
    } catch {}
    return ''
  }, [selectedLocalGame])

  const [query, setQuery] = useState(prefill)
  const [debounced, setDebounced] = useState(prefill)
  const [results, setResults] = useState<any[]>([])
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

  // V8.5: when prefill comes from URL ?q= after mount (fixture effect), sync into query once
  useEffect(() => {
    if (prefill && prefill !== query) {
      setQuery(prefill)
      setDebounced(prefill)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

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

  // Track detail open state globally for App→Discover coordination (prevents double-back)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window as any).__crystal_discover_detail_open = showDetailPanel
      }
    } catch {}
  }, [showDetailPanel])

  // search effect – V8.4.1: empty query returns empty locally, no network (live audit ?p=list&system=PS2 without q 404)
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
        const res: any = await discoveryService.search({ systemId, query: debounced, limit: 24, signal: ac.signal })
        if (cancelled || ac.signal.aborted) return
        if (Array.isArray(res)) {
          setResults(res)
          setTotal(res.length)
          setOffline(false)
          setSchemaChanged(false)
        } else {
          setResults(res.results)
          setTotal(res.total)
          setOffline(!!res.offline)
          setSchemaChanged(!!res.schemaChanged)
          if (res.error && !res.offline && !res.schemaChanged) setErrorMsg(res.error)
        }
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
    return () => {
      cancelled = true
      try { abortRef.current?.abort() } catch {}
    }
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

  // C3.1 – reentry guard (sync) and eligibility derivation
  const startInFlightRef = useRef(false)

  // Derive current availability / title for eligibility – uses detailFull fallback selectedDetail
  const currentAvailability = (detailFull as any)?.availability ?? selectedDetail?.availability ?? null
  const currentDetailTitle = (detailFull as any)?.title ?? selectedDetail?.title ?? ''
  const alreadyInLibraryForDetail = useMemo(() => {
    const t = String(currentDetailTitle || '').trim()
    if (!t) return false
    return inLibraryCheck(t)
  }, [currentDetailTitle, inLibraryCheck])

  const canGetGame = useMemo(() => {
    // GET GAME eligible ONLY when available AND not already in local library
    return currentAvailability === 'available' && !alreadyInLibraryForDetail
  }, [currentAvailability, alreadyInLibraryForDetail])

  // Clear in-flight guard when acquisition becomes inactive / detail closed
  useEffect(() => {
    if (!acquisitionActive) {
      startInFlightRef.current = false
    }
  }, [acquisitionActive, showDetailPanel])

  // V8.6D1 – PLAN C – in-app provider surface – ROMsFun slug + legacy numeric (Vimm dormant)
  // New flow: A GET GAME → Crystal opens provider surface INSIDE existing fullscreen window
  const handleGetGame = useCallback(() => {
    if (acquisitionActive) return
    if (startInFlightRef.current) return
    if (!onBeginAcquisition) return
    if (!canGetGame) return
    const rawProviderId = detailFull?.providerId ?? (detailFull as any)?.id ?? selectedDetail?.providerId ?? selectedDetail?.id
    if (rawProviderId == null) {
      setErrorMsg('Missing provider id – cannot start acquisition')
      return
    }
    const idStr = String(rawProviderId).trim()
    // V8.6D1 ROMsFun slugs look like roms/<system>/title-slug or system/id-slug – allow slash but no protocol/traversal/UNC
    const isRomsFunSlug = idStr.includes('/') && !idStr.includes('://') && !idStr.includes('..') && !idStr.startsWith('/') && !idStr.startsWith('\\')
    if (!isRomsFunSlug && !/^\d+$/.test(idStr)) {
      setErrorMsg(`Provider id must be romsfun slug or numeric – got '${idStr.slice(0, 48)}'`)
      return
    }
    const titleRaw = detailFull?.title ?? selectedDetail?.title ?? ''
    const expectedTitle = String(titleRaw).trim()
    if (!expectedTitle) {
      setErrorMsg('Could not determine game title for acquisition')
      return
    }
    // Build lazy external-page callback – MUST NOT open Edge eagerly; primary ROMsFun flow uses in-app surface instead
    const openExternalPage = () => discoveryService.open(idStr)

    startInFlightRef.current = true
    try {
      onBeginAcquisition({
        systemId,
        expectedTitle,
        providerId: idStr,
        initialUrl: idStr.includes('/') ? `https://romsfun.com/roms/${idStr.replace(/^roms\//,'')}` : undefined,
        openExternalPage,
      })
      setShowDetailPanel(false)
      setSelectedDetail(null)
      setDetailFull(null)
    } catch (e: any) {
      startInFlightRef.current = false
      const code = e?.code || e?.message
      if (code === 'EXTERNAL_ACQUISITION_ALREADY_ACTIVE' || code === 'PROVIDER_SURFACE_ALREADY_ACTIVE') {
        setErrorMsg('Acquisition already active – one at a time')
      } else {
        setErrorMsg(code ? String(code).slice(0, 140) : 'Could not start acquisition')
      }
    }
  }, [acquisitionActive, canGetGame, detailFull, selectedDetail, systemId, onBeginAcquisition, alreadyInLibraryForDetail, currentAvailability])

  // V8.4.1 deterministic controller + keyboard – C3.1 updated: acquisitionActive input lock, A only eligible canGetGame
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (acquisitionActive) {
        // C2/App is controller authority – Discover locked while acquisition active
        e.preventDefault()
        return
      }
      if (showDetailPanel) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault()
          setShowDetailPanel(false)
          setSelectedDetail(null)
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          // C3.1: A GET GAME only when eligible – no fallthrough to external-open for blocked cases
          if (canGetGame) {
            handleGetGame()
          }
          return
        }
      } else {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault()
          onBack()
          return
        }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'k') {
          e.preventDefault()
          setFocusedIdx(i => Math.max(0, i - 1))
          return
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'j') {
          e.preventDefault()
          setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const r = results[focusedIdx]
          if (r) openDetail(r)
          return
        }
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault()
          searchInputRef.current?.focus()
          return
        }
      }
    }

    const onDiscoverNav = (ev: any) => {
      if (acquisitionActive) {
        return
      }
      const action = ev?.detail as string
      if (!action) return
      if (showDetailPanel) {
        if (action === 'back' || action === 'menu') {
          setShowDetailPanel(false)
          setSelectedDetail(null)
          return
        }
        if (action === 'confirm') {
          if (canGetGame) {
            handleGetGame()
          }
          return
        }
        // while detail open, ignore navigation arrows for detail close behavior
        return
      } else {
        // results list mode
        if (action === 'up') setFocusedIdx(i => Math.max(0, i - 1))
        else if (action === 'down') setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        else if (action === 'left') setFocusedIdx(i => Math.max(0, i - 1))
        else if (action === 'right') setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        else if (action === 'confirm') {
          const r = results[focusedIdx]
          if (r) openDetail(r)
        } else if (action === 'search') {
          try { searchInputRef.current?.focus() } catch {}
        } else if (action === 'back' || action === 'menu') {
          // results B -> return to origin (library/system) via onBack – single exit, no double-back
          onBack()
        }
        // favorite/media do NOT trigger discover here – App preserves those, we ignore to stay additive
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-discover-nav' as any, onDiscoverNav)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('crystal-discover-nav' as any, onDiscoverNav)
    }
  }, [results, focusedIdx, showDetailPanel, onBack, selectedDetail, detailFull, handleGetGame, canGetGame, acquisitionActive])

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
      {/* Heavily blurred bg layer – graphite premium gaming OS, NOT boutique hotel */}
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
        {/* premium vignette – cool electric cyan hardware glow */}
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
              }}>ROMSFUN • IN-APP PROVIDER</span>
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
            {systemFullName.toUpperCase()} — Search ROMsFun
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
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[View] SEARCH</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[A] OPEN</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[B] BACK</span>
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
            <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'var(--crystal-display)', fontSize: 13 }}>ROMSFUN UNAVAILABLE</div>
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Network offline or ROMsFun is currently unreachable.</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN ROMSFUN</button>
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
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Crystal's catalog parser no longer matches ROMsFun. Please update Crystal or open the provider page.</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN ROMSFUN</button>
          </div>
        )}
        {!offline && !schemaChanged && !searching && debounced && results.length === 0 && (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.5, padding: '24px 4px' }}>
            No catalog entries for “{debounced}” on {systemFullName}. Try broader title. {errorMsg && <span style={{ color: '#ff7b7b' }}> {errorMsg}</span>}
          </div>
        )}
        {!offline && !schemaChanged && !searching && !debounced && (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.42, padding: '24px 4px' }}>
            Type to search {systemFullName} on ROMsFun. Enter a title to begin.
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
              {r.thumbUrl || r.thumbnailUrl ? (
                <img src={r.thumbUrl || r.thumbnailUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.08)'}`, flexShrink: 0, background: '#fff' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)', display: 'grid', placeItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.5, flexShrink: 0 }}>◐</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.62 }}>
                  {r.region && <span style={{ padding: '2px 7px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'} ` }}>{r.region}</span>}
                  {r.year && <span>{r.year}</span>}
                  {r.developer && <span style={{ opacity: 0.7 }}>• {r.developer.slice(0, 18)}</span>}
                  {r.version && <span style={{ opacity: 0.62 }}>• {r.version}</span>}
                  {r.languages && <span style={{ opacity: 0.62 }}>• {Array.isArray(r.languages) ? r.languages.join('/') : r.languages}</span>}
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
                  {(r as any).rating != null && String((r as any).rating) !== 'none' && (
                    <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.6 }}>★ {String((r as any).rating)}</span>
                  )}
                </div>
              </div>
              <div style={{ alignSelf: 'center', opacity: focused ? 0.9 : 0.32, fontSize: 12 }}>↗</div>
            </div>
          )
        })}
      </div>

      {/* Detail overlay/panel – deterministic A=open B=close */}
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
                  {(detailFull?.players || selectedDetail.players) && <span style={{ padding: '4px 9px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}` }}>{detailFull?.players || selectedDetail.players}P</span>}
                  {selectedDetail.discCount && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>{selectedDetail.discCount} DISC</span>}
                  {(detailFull as any)?.version && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>VER {(detailFull as any).version}</span>}
                  {(detailFull as any)?.serial && <span style={{ padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)' }}>S/N {(detailFull as any).serial}</span>}
                  {(detailFull as any)?.graphicsRating != null && <span>G {String((detailFull as any).graphicsRating)}</span>}
                  {(detailFull as any)?.overallRating != null && <span>Overall {String((detailFull as any).overallRating)} {(detailFull as any).overallVotes ? `(${String((detailFull as any).overallVotes)})` : ''}</span>}
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
                    {(detailFull as any)?.crc ? ` • CRC ${(detailFull as any).crc}` : ''}
                    {(detailFull as any)?.verificationDate ? ` • Verified ${(detailFull as any).verificationDate}` : ''}
                  </div>
                )}

                {(detailFull?.description || detailFull?.title) && (
                  <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, lineHeight: 1.5, opacity: 0.82, maxWidth: '56ch' }}>
                    {detailFull?.description || 'ROMsFun catalog entry. GET GAME opens the provider page securely inside Crystal.'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {canGetGame && onBeginAcquisition ? (
                    <button
                      onClick={() => {
                        if (acquisitionActive) return
                        if (startInFlightRef.current) return
                        handleGetGame()
                      }}
                      autoFocus
                      disabled={detailResolving || !!acquisitionActive}
                      data-testid="get-game"
                      style={{
                        appearance: 'none',
                        padding: '11px 18px',
                        borderRadius: 999,
                        border: 'none',
                        background: isDark ? '#7df9ff' : '#4a86ff',
                        color: isDark ? '#041018' : '#fff',
                        fontFamily: 'var(--crystal-mono)', fontSize: 11.5, fontWeight: 800,
                        cursor: detailResolving || acquisitionActive ? 'wait' : 'pointer',
                        opacity: detailResolving || acquisitionActive ? 0.72 : 1,
                        boxShadow: isDark ? '0 8px 20px rgba(125,249,255,0.22)' : '0 8px 18px rgba(70,130,255,0.22)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', display: 'grid', placeItems: 'center', fontSize: 11 }}>A</span>
                      GET GAME
                    </button>
                  ) : null}
                  {!canGetGame && alreadyInLibraryForDetail ? (
                    <span data-testid="in-your-library" style={{
                      fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 800,
                      padding: '11px 16px', borderRadius: 999,
                      background: isDark ? 'rgba(255,214,90,0.16)' : 'rgba(255,200,60,0.18)',
                      border: `1px solid ${isDark ? 'rgba(255,214,90,0.22)' : 'rgba(255,180,0,0.24)'}`,
                      color: isDark ? '#ffd85a' : '#8a5a00',
                    }}>IN YOUR LIBRARY</span>
                  ) : !canGetGame && (currentAvailability === 'unavailable' || currentAvailability === 'takedown') ? (
                    <span data-testid="download-unavailable" style={{
                      fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 800,
                      padding: '11px 16px', borderRadius: 999,
                      background: isDark ? 'rgba(255,120,120,0.14)' : 'rgba(255,120,120,0.16)',
                      border: `1px solid ${isDark ? 'rgba(255,120,120,0.18)' : 'rgba(255,120,120,0.22)'}`,
                      color: isDark ? '#ff9a9a' : '#8a2e2e',
                    }}>DOWNLOAD UNAVAILABLE</span>
                  ) : null}
                  <button
                    onClick={() => {
                      if (acquisitionActive) return
                      handleOpenVault(selectedDetail.id)
                    }}
                    autoFocus={canGetGame ? undefined : true as any}
                    disabled={!!acquisitionActive}
                    data-testid="open-vimm"
                    style={{
                      appearance: 'none',
                      padding: canGetGame ? '10px 16px' : '11px 18px',
                      borderRadius: 999,
                      border: canGetGame ? `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}` : 'none',
                      background: canGetGame ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)'),
                      color: canGetGame ? (isDark ? '#eef7ff' : '#16213e') : (isDark ? '#eef7ff' : '#16213e'),
                      fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: canGetGame ? 600 : 700,
                      cursor: acquisitionActive ? 'not-allowed' : 'pointer',
                      opacity: acquisitionActive ? 0.5 : 1,
                      boxShadow: 'none',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    OPEN ON ROMSFUN
                  </button>
                  <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.52, maxWidth: 220 }}>
                    {canonicalVaultUrl(selectedDetail.id)}
                  </span>
                  <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.44 }}>{canGetGame ? '[A] GET • [B] CLOSE DETAIL • [B again] BACK TO LIBRARY' : '[B] CLOSE DETAIL – [B again] BACK TO LIBRARY'}</span>
                </div>

                {(detailFull?.availability === 'unavailable' || detailFull?.availability === 'takedown' || selectedDetail.availability === 'unavailable' || selectedDetail.availability === 'takedown') && (
                  <div style={{
                    marginTop: 6,
                    padding: '10px 12px', borderRadius: 10,
                    background: isDark ? 'rgba(255,120,120,0.10)' : 'rgba(255,240,240,0.84)',
                    border: `1px solid ${isDark ? 'rgba(255,120,120,0.18)' : 'rgba(255,120,120,0.22)'}`,
                    fontFamily: 'var(--crystal-mono)', fontSize: 10.5,
                  }}>
                    CATALOG ENTRY AVAILABLE • DOWNLOAD AVAILABILITY UNAVAILABLE — preserved for reference. Open ROMsFun to review the provider notice.
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
