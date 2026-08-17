/**
 * Crystal Discovery – V3 Discovery Native
 * Graphite / silver / acrylic glass / cool electric cyan – premium gaming OS bar
 * Vimm primary 24h cache (managed by discovery.rs), ROMsFun backup, local cover priority
 * Cards: local cover → provider thumb → system art (backgroundUrl)
 * Queue multi Y to queue 3-4, provider health pill emerald/amber/red
 * Resilience: parser fail fallback to cached + amber/red
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { GameEntry } from '../runtime/backend'
import discoveryService, { type DiscoveryResult } from '../lib/discoveryService'
import { isInLibrary, normalizeTitle } from '../lib/discoveryMatching'
import { toAssetUrl } from '../runtime/mediaUrl'
import SystemLogo from './SystemLogo'

export type BeginAcquisitionRequest = {
  systemId: string
  expectedTitle: string
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
  // V3 queue lift
  discoveryQueue?: DiscoveryResult[]
  onDiscoveryQueueChange?: (q: DiscoveryResult[]) => void
}

const PROVIDER_NAVIGATION_TITLES = new Set([
  'atari 2600', 'atari 5200', 'atari 7800', 'nintendo', 'super nintendo',
  'nintendo 64', 'nintendo ds', 'nintendo 3ds', 'game boy', 'game boy color',
  'game boy advance', 'gamecube', 'wii', 'wii u', 'sega 32x', 'master system',
  'genesis', 'dreamcast', 'playstation', 'playstation 2', 'playstation 3',
  'playstation portable', 'xbox', 'xbox 360', 'the vault', 'emulation lair',
])

function removeProviderNavigationRows(items: any[]): any[] {
  return items.filter(item => !PROVIDER_NAVIGATION_TITLES.has(normalizeTitle(String(item?.title || ''))))
}

type ProviderHealth = { status: 'live' | 'cached' | 'slow'; lastSuccessMs?: number; lastFailReason?: string; lastParseCount?: number }

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
  discoveryQueue: externalQueue,
  onDiscoveryQueueChange,
}: DiscoverProps) {
  const isDark = theme === 'dark'
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridColumns = useCallback(() => {
    const width = containerRef.current?.clientWidth || 0
    return Math.max(1, Math.floor((width + 12) / 257))
  }, [])

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
  const [browseLetter, setBrowseLetter] = useState('FEATURED')
  const [results, setResults] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [offline, setOffline] = useState(false)
  const [schemaChanged, setSchemaChanged] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [focusedIdx, setFocusedIdx] = useState(0)
  const browseOptions = useMemo(() => ['FEATURED', ...'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')], [])
  const [focusZone, setFocusZone] = useState<'search' | 'browse' | 'grid'>('grid')
  const [focusedBrowseIdx, setFocusedBrowseIdx] = useState(0)
  const [selectedDetail, setSelectedDetail] = useState<DiscoveryResult | null>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)

  const [detailResolving, setDetailResolving] = useState(false)
  const [detailFull, setDetailFull] = useState<any>(null)
  const [localCoverUrls, setLocalCoverUrls] = useState<Record<string, string>>({})

  // V3 additions
  const [providerHealth, setProviderHealth] = useState<ProviderHealth>({ status: 'cached' })
  const [cacheInfo, setCacheInfo] = useState<{ source: 'cache' | 'live' | null; timestamp: number | null; fresh: boolean }>({ source: null, timestamp: null, fresh: false })
  const [internalQueue, setInternalQueue] = useState<DiscoveryResult[]>([])
  const effectiveQueue = externalQueue ?? internalQueue
  const setEffectiveQueue = useCallback((next: DiscoveryResult[]) => {
    if (onDiscoveryQueueChange) {
      onDiscoveryQueueChange(next)
    } else {
      setInternalQueue(next)
    }
  }, [onDiscoveryQueueChange])

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200) as any
  }, [])

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (prefill && prefill !== query) {
      setQuery(prefill)
      setDebounced(prefill)
    }
  }, [prefill])

  const activateBrowse = useCallback((index: number) => {
    const next = browseOptions[Math.max(0, Math.min(browseOptions.length - 1, index))]
    setQuery('')
    setBrowseLetter(next)
    setFocusedBrowseIdx(index)
    setFocusedIdx(0)
    setFocusZone('grid')
  }, [browseOptions])

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 340)
    return () => clearTimeout(h)
  }, [query])

  useEffect(() => {
    setFocusedIdx(0)
  }, [debounced, results.length])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pairs = await Promise.all((libraryGames || []).filter(game => game.cover_path).map(async game => {
        const url = await toAssetUrl(game.cover_path)
        return [normalizeTitle(game.name), url] as const
      }))
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [key, url] of pairs) if (key && url) next[key] = url
      setLocalCoverUrls(next)
    })()
    return () => { cancelled = true }
  }, [libraryGames])

  // Focused thumbnail resolve
  useEffect(() => {
    if (focusZone !== 'grid') return
    const focused = results[focusedIdx]
    if (!focused || focused.thumbnailUrl || focused.thumbUrl) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const detail = await discoveryService.detail(String(focused.id || focused.providerId), systemId)
        const thumbnailUrl = (detail as any)?.thumbnailUrl
        if (cancelled || !thumbnailUrl) return
        setResults(current => current.map((item, index) => index === focusedIdx ? { ...item, thumbnailUrl } : item))
      } catch {}
    }, 420)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [focusZone, focusedIdx, results, systemId])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window as any).__crystal_discover_detail_open = showDetailPanel
      }
    } catch {}
  }, [showDetailPanel])

  // Cover hierarchy resolver: local → provider thumb → system art
  const resolveCoverUrl = useCallback((r: any): string | null => {
    const normalized = normalizeTitle(String(r?.title || ''))
    if (normalized && localCoverUrls[normalized]) return localCoverUrls[normalized]
    if (r?.thumbnailUrl) return r.thumbnailUrl
    if (r?.thumbUrl) return r.thumbUrl
    if (backgroundUrl) return backgroundUrl
    return null
  }, [localCoverUrls, backgroundUrl])

  // search effect with cache-first, forceRefresh support, resilience fallback
  const performSearch = useCallback(async (forceRefresh = false) => {
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
      let metaRes: any
      try {
        // Try searchWithMeta for cache awareness
        if ((discoveryService as any).searchWithMeta) {
          const sw = await (discoveryService as any).searchWithMeta({
            systemId,
            query: debounced,
            browseLetter: debounced ? undefined : browseLetter,
            limit: 48,
            signal: ac.signal,
            forceRefresh,
          })
          metaRes = sw
        } else {
          const basic = await discoveryService.search({
            systemId,
            query: debounced,
            browseLetter: debounced ? undefined : browseLetter,
            limit: 48,
            signal: ac.signal,
            forceRefresh: forceRefresh ? true as any : false,
          } as any)
          metaRes = { results: basic, source: forceRefresh ? 'live' : 'live', timestamp: Date.now(), fresh: true, providerHealth: { status: forceRefresh ? 'live' : 'cached' } }
        }
      } catch (e: any) {
        // Resilience path – e may have providerHealth in its wrapper
        if (e?.providerHealth) {
          setProviderHealth(e.providerHealth)
        }
        // Try cached fallback via discoveryService.search that may itself fallback, else empty
        const maybe = e?.error?.message || e?.message
        if (/parse|selector/i.test(String(maybe))) {
          try {
            const fallback = await discoveryService.search({
              systemId,
              query: debounced,
              browseLetter: debounced ? undefined : browseLetter,
              limit: 48,
            } as any)
            metaRes = { results: fallback, source: 'cache', timestamp: Date.now(), fresh: false, providerHealth: { status: 'slow', lastFailReason: String(maybe).slice(0,120) } }
          } catch {
            throw e?.error || e
          }
        } else {
          throw e?.error || e
        }
      }

      if (ac.signal.aborted) return
      const list = metaRes.results || metaRes
      if (Array.isArray(list)) {
        const clean = removeProviderNavigationRows(list)
        setResults(clean)
        setTotal(clean.length)
        setCacheInfo({ source: (metaRes as any).source || null, timestamp: (metaRes as any).timestamp || null, fresh: (metaRes as any).fresh ?? true })
        if ((metaRes as any).providerHealth) setProviderHealth((metaRes as any).providerHealth)
        else {
          // infer from source
          const healthSrc = (metaRes as any).source
          if (healthSrc === 'cache') setProviderHealth(h => ({ ...h, status: 'cached' }))
          else if (healthSrc === 'live') setProviderHealth({ status: 'live', lastSuccessMs: Date.now(), lastParseCount: clean.length })
        }
        setOffline(false)
        setSchemaChanged(false)
        return
      }

      if (Array.isArray((metaRes as any).results)) {
        const clean = removeProviderNavigationRows((metaRes as any).results)
        setResults(clean)
        setTotal(clean.length)
        setCacheInfo({ source: (metaRes as any).source || null, timestamp: (metaRes as any).timestamp || null, fresh: (metaRes as any).fresh ?? false })
        if ((metaRes as any).providerHealth) setProviderHealth((metaRes as any).providerHealth)
        return
      }

      // legacy shape { offline, schemaChanged, error }
      const resObj = metaRes as any
      const clean = removeProviderNavigationRows(resObj.results || [])
      setResults(clean)
      setTotal(clean.length)
      setOffline(!!resObj.offline)
      setSchemaChanged(!!resObj.schemaChanged)
      if (resObj.error && !resObj.offline && !resObj.schemaChanged) setErrorMsg(resObj.error)
      setCacheInfo({ source: resObj.source || null, timestamp: resObj.timestamp || null, fresh: true })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      const msg = e?.message || String(e)
      if (/offline|network/i.test(msg)) {
        setOffline(true)
        setProviderHealth(h => ({ ...h, status: 'slow', lastFailReason: 'offline/network' }))
      } else if (/schema/i.test(msg)) setSchemaChanged(true)
      else setErrorMsg(msg)
    } finally {
      if (abortRef.current === ac) setSearching(false)
    }
  }, [debounced, browseLetter, systemId])

  useEffect(() => {
    performSearch(false)
    return () => { try { abortRef.current?.abort() } catch {} }
  }, [performSearch])

  // Refresh bypass – exposed for X key / button
  const refreshBypass = useCallback(() => {
    performSearch(true)
    showToast('Refreshing…')
  }, [performSearch, showToast])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current.querySelector(`[data-result-idx="${focusedIdx}"]`) as HTMLElement | null
    if (el) {
      try { el.scrollIntoView({ block: 'nearest', behavior: 'auto' }) } catch {}
    }
  }, [focusedIdx, focusZone])

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

  const startInFlightRef = useRef(false)

  const currentAvailability = (detailFull as any)?.availability ?? selectedDetail?.availability ?? null
  const currentDetailTitle = (detailFull as any)?.title ?? selectedDetail?.title ?? ''
  const alreadyInLibraryForDetail = useMemo(() => {
    const t = String(currentDetailTitle || '').trim()
    if (!t) return false
    return inLibraryCheck(t)
  }, [currentDetailTitle, inLibraryCheck])

  const canGetGame = useMemo(() => {
    return currentAvailability === 'available' && !alreadyInLibraryForDetail
  }, [currentAvailability, alreadyInLibraryForDetail])

  useEffect(() => {
    if (!acquisitionActive) {
      startInFlightRef.current = false
    }
  }, [acquisitionActive, showDetailPanel])

  const handleGetGame = useCallback((provider: 'vimm' | 'romsfun' = 'vimm') => {
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
    const openExternalPage = () => discoveryService.open(idStr)
    const openRomsFunBackupPage = () => discoveryService.openRomsFunBackup(systemId, expectedTitle)

    startInFlightRef.current = true
    try {
      onBeginAcquisition({
        systemId,
        expectedTitle,
        openExternalPage: provider === 'vimm' ? openExternalPage : openRomsFunBackupPage,
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

  // Queue logic – Y queues selected
  const queueSelected = useCallback((r?: DiscoveryResult) => {
    const candidate = r ?? (focusZone === 'grid' ? results[focusedIdx] : selectedDetail) as any
    if (!candidate) return
    const current = effectiveQueue
    if (current.some(x => String(x.id) === String(candidate.id))) {
      showToast(`Already queued • ${current.length}/4`)
      return
    }
    if (current.length >= 4) {
      showToast('Queue full • 4/4 max')
      return
    }
    const next = [...current, candidate]
    setEffectiveQueue(next)
    showToast(`Queued ${next.length}/4`)
  }, [results, focusedIdx, focusZone, selectedDetail, effectiveQueue, setEffectiveQueue, showToast])

  // When acquisition completes, pop queue sequentially (frontend sequential, backend OnceLock single)
  useEffect(() => {
    if (!acquisitionActive && effectiveQueue.length > 0 && onBeginAcquisition) {
      // Small delay to allow watcher cleanup, then start next if user hasn't interacted detail?
      // We do NOT auto-start without user GET GAME in detail? Spec wants Inbox shows progress, backend sequential
      // For V3 we expose queue but manual GET triggers queue start; if auto-start desired, hook here
    }
  }, [acquisitionActive, effectiveQueue, onBeginAcquisition])

  // Controller / keyboard handling updated to repurpose Y as queue in Discover
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return
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
          if (canGetGame) handleGetGame()
          return
        }
        if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'f') {
          e.preventDefault()
          queueSelected(selectedDetail as any)
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
          if (focusZone === 'grid' && focusedIdx < gridColumns() && !debounced) setFocusZone('browse')
          else if (focusZone === 'grid') setFocusedIdx(i => Math.max(0, i - gridColumns()))
          else if (focusZone === 'browse') { setFocusZone('search'); searchInputRef.current?.focus() }
          return
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'j') {
          e.preventDefault()
          if (focusZone !== 'grid') { searchInputRef.current?.blur(); setFocusZone(debounced ? 'grid' : focusZone === 'search' ? 'browse' : 'grid') }
          else setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + gridColumns()))
          return
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && focusZone === 'browse') {
          e.preventDefault()
          setFocusedBrowseIdx(i => Math.max(0, Math.min(browseOptions.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1))))
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (focusZone === 'browse') activateBrowse(focusedBrowseIdx)
          else { const r = results[focusedIdx]; if (r) openDetail(r) }
          return
        }
        if (e.key === 'x' || e.key === 'X') {
          // V3: X refresh bypasses cache
          e.preventDefault()
          refreshBypass()
          return
        }
        if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'f') {
          e.preventDefault()
          queueSelected()
          return
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault()
          refreshBypass()
          return
        }
      }
    }

    const onDiscoverNav = (ev: any) => {
      if (acquisitionActive) {
        // C2/App is controller authority – Discover locked while acquisition active (mirrored for discover nav)
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
          if (canGetGame) handleGetGame()
          return
        }
        if (action === 'favorite' || action === 'queue') {
          queueSelected(selectedDetail as any)
          return
        }
        if (action === 'media' || action === 'refresh') {
          refreshBypass()
          return
        }
        return
      } else {
        if (action === 'up') {
          if (focusZone === 'grid' && focusedIdx < gridColumns() && !debounced) setFocusZone('browse')
          else if (focusZone === 'grid') setFocusedIdx(i => Math.max(0, i - gridColumns()))
          else if (focusZone === 'browse') { setFocusZone('search'); searchInputRef.current?.focus() }
        }
        else if (action === 'down') {
          if (focusZone !== 'grid') { searchInputRef.current?.blur(); setFocusZone(debounced ? 'grid' : focusZone === 'search' ? 'browse' : 'grid') }
          else setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + gridColumns()))
        }
        else if (action === 'left') {
          if (focusZone === 'browse') setFocusedBrowseIdx(i => Math.max(0, i - 1))
          else setFocusedIdx(i => Math.max(0, i - 1))
        }
        else if (action === 'right') {
          if (focusZone === 'browse') setFocusedBrowseIdx(i => Math.min(browseOptions.length - 1, i + 1))
          else setFocusedIdx(i => Math.min(Math.max(results.length - 1, 0), i + 1))
        }
        else if (action === 'confirm') {
          if (focusZone === 'browse') activateBrowse(focusedBrowseIdx)
          else if (focusZone === 'search') searchInputRef.current?.focus()
          else { const r = results[focusedIdx]; if (r) openDetail(r) }
        } else if (action === 'search') {
          setFocusZone('search'); try { searchInputRef.current?.focus() } catch {}
        } else if (action === 'back' || action === 'menu') {
          onBack()
        } else if (action === 'favorite' || action === 'queue') {
          queueSelected()
        } else if (action === 'media' || action === 'refresh') {
          refreshBypass()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-discover-nav' as any, onDiscoverNav)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('crystal-discover-nav' as any, onDiscoverNav)
    }
  }, [results, focusedIdx, focusedBrowseIdx, focusZone, browseOptions.length, debounced, showDetailPanel, onBack, selectedDetail, detailFull, handleGetGame, canGetGame, acquisitionActive, gridColumns, activateBrowse, queueSelected, refreshBypass])

  const resultCountLabel = useMemo(() => {
    if (searching) return 'searching…'
    if (!debounced) return `${results.length} games • ${browseLetter}`
    return `${total || results.length} results`
  }, [searching, debounced, browseLetter, total, results.length])

  // Provider pill – emerald / amber / red
  const providerPillStyle = useMemo(() => {
    const status = providerHealth.status
    if (status === 'live') {
      return { bg: 'rgba(71,255,150,0.16)', border: 'rgba(71,255,150,0.28)', fg: isDark ? '#b9ffcf' : '#0d6a2a', label: '● LIVE' }
    }
    if (status === 'cached') {
      return { bg: 'rgba(255,214,90,0.14)', border: 'rgba(255,214,90,0.24)', fg: isDark ? '#ffd85a' : '#8a5a00', label: '◑ CACHED' }
    }
    // slow
    return { bg: 'rgba(255,120,120,0.14)', border: 'rgba(255,120,120,0.22)', fg: isDark ? '#ff9a9a' : '#8a2e2e', label: '◎ SLOW' }
  }, [providerHealth, isDark])

  const showCachedBadge = cacheInfo.source === 'cache' && cacheInfo.fresh && cacheInfo.timestamp && (Date.now() - cacheInfo.timestamp < 24*3600*1000)

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
        <div style={{
          position: 'absolute', inset: 0,
          background: isDark
            ? 'linear-gradient(180deg, rgba(10,12,18,0.34), rgba(10,12,18,0.52)), radial-gradient(84% 68% at 50% 18%, transparent 8%, rgba(6,9,14,0.42) 72%)'
            : 'linear-gradient(180deg, rgba(250,252,255,0.64), rgba(240,244,255,0.72)), radial-gradient(84% 66% at 50% 22%, transparent 10%, rgba(234,238,248,0.42) 70%)',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.18) 100%)', opacity: isDark ? 0.55 : 0.22 }} />
      </div>

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
                background: providerPillStyle.bg,
                border: `1px solid ${providerPillStyle.border}`,
                color: providerPillStyle.fg,
                fontWeight: 700,
              }} title={providerHealth.lastFailReason || (providerHealth.lastSuccessMs ? `ok ${Math.round((Date.now()-providerHealth.lastSuccessMs)/1000)}s ago` : '')}>{providerPillStyle.label}{providerHealth.lastParseCount ? ` • ${providerHealth.lastParseCount}` : ''}</span>
              {showCachedBadge && (
                <span style={{
                  fontFamily: 'var(--crystal-mono)', fontSize: 9, letterSpacing: '0.08em',
                  padding: '3px 7px', borderRadius: 999,
                  background: 'rgba(120,180,255,0.12)', border: '1px solid rgba(120,180,255,0.18)',
                  color: isDark ? '#a9d2ff' : '#345daa',
                }}>CACHED</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isDark ? 0.92 : 0.90 }}>
          {logoUrl && (
            <SystemLogo systemId={systemId} logoUrl={logoUrl} fallbackName={systemFullName} isSelected theme={theme} style={{ minWidth: 140, maxWidth: 220, minHeight: 32 }} />
          )}
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.54, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
            {resultCountLabel}
          </div>
          {effectiveQueue.length > 0 && (
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '4px 8px', borderRadius: 999, background: isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`, color: isDark ? '#c7feff' : '#2a4d9e' }}>
              QUEUE {effectiveQueue.length}/4
            </div>
          )}
        </div>
      </div>

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
          border: `1px solid ${focusZone === 'search' ? (isDark ? 'rgba(125,249,255,0.72)' : 'rgba(70,130,255,0.64)') : (isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)')}`,
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
            onFocus={() => setFocusZone('search')}
            onKeyDown={e => { if (e.key === 'Escape') { if (query) { setQuery(''); e.preventDefault() } else onBack() } }}
            placeholder="Search any part of a title…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: isDark ? '#eef7ff' : '#16213e',
              fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 500,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✕</button>
          )}
          <button onClick={refreshBypass} title="Refresh bypass cache (X / R)" style={{ background: 'transparent', border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`, borderRadius: 8, padding: '4px 8px', fontFamily: 'var(--crystal-mono)', fontSize: 10, cursor: 'pointer', color: isDark ? '#7df9ff' : '#3a6ae0' }}>⟳ X</button>
          {searching && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.42)'}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'crystal-spin 0.8s linear infinite' }} />
          )}
        </div>
        <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.54, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[View] SEARCH</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[A] OPEN</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[Y] QUEUE</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[X] REFRESH</span>
          <span style={{ padding: '4px 8px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)' }}>[B] BACK</span>
        </div>
      </div>

      {!query && (
        <div style={{ zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px 11px', overflowX: 'auto', scrollbarWidth: 'none', background: isDark ? 'rgba(8,10,16,0.30)' : 'rgba(255,255,255,0.42)', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(18,26,44,0.06)'}` }}>
          <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.5, marginRight: 5, whiteSpace: 'nowrap' }}>BROWSE</span>
          {browseOptions.map((letter, browseIdx) => {
            const active = browseLetter === letter
            const focused = focusZone === 'browse' && focusedBrowseIdx === browseIdx
            return <button key={letter} onClick={() => activateBrowse(browseIdx)} onFocus={() => { setFocusZone('browse'); setFocusedBrowseIdx(browseIdx) }} style={{ width: letter === 'FEATURED' ? 76 : 30, height: 30, flex: `0 0 ${letter === 'FEATURED' ? 76 : 30}px`, borderRadius: 9, cursor: 'pointer', outline: focused ? `2px solid ${isDark ? '#fff' : '#173c91'}` : 'none', outlineOffset: 2, transform: focused ? 'translateY(-2px)' : 'none', border: `1px solid ${active ? (isDark ? 'rgba(125,249,255,.65)' : 'rgba(70,130,255,.58)') : (isDark ? 'rgba(255,255,255,.08)' : 'rgba(18,26,44,.08)')}`, background: active ? (isDark ? '#7df9ff' : '#4a86ff') : (isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.62)'), color: active ? (isDark ? '#041018' : '#fff') : 'inherit', fontFamily: 'var(--crystal-mono)', fontSize: 10, fontWeight: 800 }}>{letter}</button>
          })}
        </div>
      )}

      {effectiveQueue.length > 0 && (
        <div style={{ zIndex: 2, flexShrink: 0, display: 'flex', gap: 8, padding: '10px 22px', overflowX: 'auto', background: isDark ? 'rgba(125,249,255,0.04)' : 'rgba(70,130,255,0.04)', borderBottom: `1px solid ${isDark ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)'}` }}>
          <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.5, whiteSpace: 'nowrap', flexShrink: 0 }}>QUEUE {effectiveQueue.length}/4</span>
          {effectiveQueue.map((q, i) => (
            <span key={`${q.id}-${i}`} style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '4px 9px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`, display: 'flex', alignItems: 'center', gap: 6 }}>
              {i+1}. {String(q.title).slice(0,22)}
              <button onClick={() => setEffectiveQueue(effectiveQueue.filter((_, idx) => idx !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✕</button>
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', zIndex: 1, padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', alignContent: 'start', gap: 12 }}>
        {offline && (
          <div style={{
            padding: '18px 16px', borderRadius: 12,
            background: isDark ? 'rgba(20,16,12,0.52)' : 'rgba(255,244,230,0.82)',
            border: `1px solid ${isDark ? 'rgba(255,180,120,0.18)' : 'rgba(180,120,20,0.18)'}`,
            fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontFamily: 'var(--crystal-display)', fontSize: 13 }}>VIMM'S LAIR UNAVAILABLE</div>
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Network offline or provider slow – showing cached results where available. {providerHealth.lastFailReason && <span style={{ opacity: 0.9 }}>{providerHealth.lastFailReason.slice(0,80)}</span>}</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN VIMM'S LAIR</button>
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
            <div style={{ opacity: 0.72, marginBottom: 10 }}>Crystal's catalogue parser no longer matches Vimm's Lair. Using cached catalog where available.</div>
            <button onClick={handleOpenVaultRoot} style={{
              padding: '8px 14px', borderRadius: 999, border: 'none',
              background: isDark ? '#7df9ff' : '#4a86ff', color: isDark ? '#041018' : '#fff',
              fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>OPEN VIMM'S LAIR</button>
          </div>
        )}
        {!offline && !schemaChanged && !searching && debounced && results.length === 0 && (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.5, padding: '24px 4px' }}>
            No catalog entries for “{debounced}” on {systemFullName}. Try broader title. {errorMsg && <span style={{ color: '#ff7b7b' }}> {errorMsg}</span>}
          </div>
        )}
        {!offline && !schemaChanged && !searching && !debounced && results.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.52, padding: '24px 4px' }}>
            No {browseLetter} titles found for {systemFullName}. Choose another letter or search any part of a title.
          </div>
        )}
        {!offline && !schemaChanged && results.map((r, idx) => {
          const focused = focusZone === 'grid' && idx === focusedIdx
          const inLib = inLibraryCheck(r.title)
          const visualUrl = resolveCoverUrl(r)
          const isQueued = effectiveQueue.some(q => String(q.id) === String(r.id))
          return (
            <div
              key={`${r.id}-${idx}`}
              data-result-idx={idx}
              onClick={() => { setFocusZone('grid'); setFocusedIdx(idx); openDetail(r) }}
              tabIndex={0}
              onFocus={() => { setFocusZone('grid'); setFocusedIdx(idx) }}
              style={{
                display: 'flex', minHeight: 112,
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
                position: 'relative',
              }}
            >
              {visualUrl ? (
                <img src={visualUrl} alt="" style={{ width: 68, height: 84, objectFit: 'cover', objectPosition: 'center', borderRadius: 9, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.08)'}`, flexShrink: 0, background: '#fff' }} />
              ) : (
                <div style={{ width: 68, height: 84, borderRadius: 9, background: isDark ? 'linear-gradient(145deg, rgba(125,249,255,.10), rgba(255,255,255,.025))' : 'linear-gradient(145deg, rgba(70,130,255,.12), rgba(255,255,255,.72))', border: `1px solid ${isDark ? 'rgba(125,249,255,.12)' : 'rgba(70,130,255,.12)'}`, display: 'grid', placeItems: 'center', fontFamily: 'var(--crystal-mono)', fontSize: 17, fontWeight: 800, letterSpacing: '.06em', color: isDark ? 'rgba(125,249,255,.68)' : 'rgba(50,95,190,.68)', flexShrink: 0 }}>{String(r.title || '?').slice(0, 2).toUpperCase()}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 14.5, fontWeight: 680, lineHeight: 1.18, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{r.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.62 }}>
                  {r.region && <span style={{ padding: '2px 7px', borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'} ` }}>{r.region}</span>}
                  {r.year && <span>{r.year}</span>}
                  {r.developer && <span style={{ opacity: 0.7 }}>• {r.developer.slice(0, 18)}</span>}
                  {r.version && <span style={{ opacity: 0.62 }}>• {r.version}</span>}
                  {r.languages && <span style={{ opacity: 0.62 }}>• {Array.isArray(r.languages) ? r.languages.join('/') : r.languages}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999,
                    background: r.availability === 'available' ? (isDark ? 'rgba(125,249,255,0.14)' : 'rgba(90,180,120,0.14)') : r.availability === 'takedown' || r.availability === 'unavailable' ? (isDark ? 'rgba(255,120,120,0.12)' : 'rgba(255,120,120,0.16)') : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${r.availability === 'available' ? 'rgba(125,249,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
                  }}>{r.availability === 'available' ? 'AVAILABLE' : r.availability === 'takedown' ? 'DOWNLOAD UNAVAILABLE' : (r.availability || 'AVAILABLE').toUpperCase()}</span>
                  <span style={{
                    fontFamily: 'var(--crystal-mono)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999,
                    background: inLib ? (isDark ? 'rgba(255,214,90,0.16)' : 'rgba(255,200,60,0.18)') : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(18,26,44,0.05)',
                    border: `1px solid ${inLib ? (isDark ? 'rgba(255,214,90,0.24)' : 'rgba(255,180,0,0.24)') : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                    color: inLib ? (isDark ? '#ffd85a' : '#8a5a00') : undefined,
                  }}>{inLib ? '★ OWNED' : 'NEW'}</span>
                  {isQueued && <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, padding: '3px 8px', borderRadius: 999, background: 'rgba(125,249,255,0.12)', border: '1px solid rgba(125,249,255,0.18)', color: '#7df9ff' }}>QUEUED</span>}
                  {(r as any).rating != null && String((r as any).rating) !== 'none' && (
                    <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.6 }}>★ {String((r as any).rating)}</span>
                  )}
                </div>
              </div>
              <div style={{ alignSelf: 'center', opacity: focused ? 0.9 : 0.32, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>↗</span>
                {focused && (
                  <button onClick={(e) => { e.stopPropagation(); queueSelected(r) }} style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, padding: '3px 6px', borderRadius: 6, border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`, background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)', cursor: 'pointer' }} title="Y to queue">+Q</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {toast && (
        <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 20, padding: '10px 16px', borderRadius: 999, background: isDark ? 'rgba(18,22,36,0.92)' : 'rgba(255,255,255,0.92)', border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`, backdropFilter: 'blur(18px)', fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, boxShadow: '0 12px 24px rgba(0,0,0,0.18)' }}>
          {toast}
        </div>
      )}

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
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{(selectedDetail.system || systemFullName).toUpperCase()} • {selectedDetail.region || '--'} • {selectedDetail.year || '--'} {showCachedBadge ? '• CACHED' : ''}</div>
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
                  <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 999, background: providerPillStyle.bg, border: `1px solid ${providerPillStyle.border}`, color: providerPillStyle.fg }}>{providerPillStyle.label} • VIMM {cacheInfo.source === 'cache' ? 'CACHED' : 'LIVE'}</span>
                </div>

                {(detailFull?.verification || selectedDetail.verification) && (
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.7 }}>
                    Verification: {detailFull?.verification || selectedDetail.verification} • {detailFull?.mediaType || 'ISO'} • Rating {detailFull?.rating || selectedDetail.rating || '--'}
                  </div>
                )}

                {(detailFull?.description || detailFull?.title) && (
                  <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, lineHeight: 1.5, opacity: 0.82, maxWidth: '56ch' }}>
                    {detailFull?.description || 'Catalog entry. GET GAME opens provider page while Crystal watches Downloads.'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {canGetGame && onBeginAcquisition ? (
                    <button
                      onClick={() => {
                        if (acquisitionActive) return
                        if (startInFlightRef.current) return
                        handleGetGame('vimm')
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
                  <button
                    onClick={() => queueSelected(selectedDetail as any)}
                    style={{
                      appearance: 'none', padding: '10px 16px', borderRadius: 999,
                      border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
                      background: isDark ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)',
                      fontFamily: 'var(--crystal-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      color: isDark ? '#7df9ff' : '#3a6ae0',
                    }}
                  >
                    Y QUEUE {effectiveQueue.length}/4
                  </button>
                  {canGetGame && onBeginAcquisition && systemId !== 'steam' ? (
                    <button
                      onClick={() => {
                        if (acquisitionActive || startInFlightRef.current) return
                        handleGetGame('romsfun')
                      }}
                      disabled={detailResolving || !!acquisitionActive}
                      data-testid="get-game-vimm-backup"
                      style={{
                        appearance: 'none', padding: '10px 16px', borderRadius: 999,
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`,
                        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)',
                        color: isDark ? '#eef7ff' : '#16213e', fontFamily: 'var(--crystal-mono)',
                        fontSize: 11, fontWeight: 700, cursor: acquisitionActive ? 'not-allowed' : 'pointer',
                        opacity: acquisitionActive ? 0.5 : 1,
                      }}
                    >
                      ROMSFUN BACKUP
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
                </div>
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
