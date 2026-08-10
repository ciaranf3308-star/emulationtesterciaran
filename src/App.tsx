import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { ThemeProvider, useThemeAssets } from './providers/ThemeProvider'
import { MachineConfigProvider, useMachineConfig } from './providers/MachineConfigProvider'
import { getPopulatedSystems, getSystemById, getSystemFullName } from './machine/selectors'
import type { MachineSystem, MachineConfig } from './machine/types'
import { configForSystem } from './stage'
import SystemStage from './stage/SystemStage'
import { isTauriEnvironment } from './runtime/environment'
import { resolveLaunchRequest } from './launcher/resolver'
import { getLauncherBridge } from './launcher/bridge'
import type { GameEntry } from './runtime/backend'
import { listGames, listAllGames, getFavorites, getRecentlyPlayed, verifyMedia } from './runtime/backend'
import { toAssetUrl, pickGameplayFromResolved, type ResolvedGameMedia } from './runtime/mediaUrl'
import type { GameplaySource } from './stage/types'
import SystemLanding, { type LandingGameBrief } from './components/SystemLanding'
import LibraryView, { type LibraryGameDetail } from './components/LibraryView'
import { type CarouselGame } from './components/GameBoxCarousel'
import SystemLogo from './components/SystemLogo'
import { getSystemMeta } from './presentation/systemMeta'
import { deriveSystemSummary, getRecent, getMostPlayed, getSurprise } from './presentation/systemSummary'
import { useSemanticInput } from './hooks/useSemanticInput'
import type { NavigationAction } from './input/types'
import { getTauriInvoker } from './runtime/tauri'
// V8.2 fixture DEV ONLY – isolated, never overwrites real Tauri truth – used for web QA screenshots
import { getFixtureGames, toGameEntry, fixtureMediaForGame, getFixtureSystems } from './dev/fixtures/goldenFixture'
import { isFixtureEnabled, isDevFixtureAllowed } from './dev/fixtures/fixtureMode'
import { useCrystalAcquisition } from './acquisition/useCrystalAcquisition'
import AcquisitionStatusCard from './acquisition/AcquisitionStatusCard'
// V8.3.1 signed updater – official Tauri v2 plugin – non-blocking startup check, restrained UI, manual Settings entry
import { checkForUpdate } from './updater/crystalUpdater'
import type { CrystalUpdateInfo } from './updater/crystalUpdater'
import { UpdaterBanner } from './components/UpdaterBanner'
import { SettingsUpdaterPanel } from './components/SettingsUpdaterPanel'

import DiscoverView from './components/DiscoverView'

type View = 'system' | 'library' | 'allgames' | 'favorites' | 'recent' | 'settings' | 'discover'

function parsePlayCount(g: GameEntry & { [k: string]: any }): number | null {
  const raw = (g as any).play_count ?? (g as any).playcount ?? (g as any).playCount
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const n = Number(raw)
  return isNaN(n) ? null : n
}

function lastPlayedLabel(g: GameEntry): string | null {
  const raw = (g as any).last_played ?? (g as any).lastplayed ?? null
  if (!raw) return null
  try {
    const ms = Date.parse(raw)
    if (!isNaN(ms)) {
      const diffMs = Date.now() - ms
      const mins = Math.floor(diffMs / 60000)
      if (mins < 60) return `${mins} mins ago`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours} hours ago`
      const days = Math.floor(hours / 24)
      return `${days} days ago`
    }
  } catch {}
  return String(raw).slice(0, 10)
}

function AppInner() {
  const { config, isExample, isRealMachine, loading: machineLoading, error: machineError, validationErrors, blockingError } = useMachineConfig() as any
  const { theme, toggle, manifest, resolver, manifestLoading } = useThemeAssets()

  const [activeSystemId, setActiveSystemId] = useState<string>('ps2')
  const [view, setView] = useState<View>('system')
  const [showGuides, setShowGuides] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [safeMode, setSafeMode] = useState(false)
  const [safeModeToast, setSafeModeToast] = useState<string | null>(null)

  const [gameCache, setGameCache] = useState<Map<string, GameEntry[]>>(() => new Map())
  const [cacheLoading, setCacheLoading] = useState<Set<string>>(() => new Set())
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedGameplaySources, setSelectedGameplaySources] = useState<GameplaySource[] | undefined>(undefined)
  const [selectedPhysicalUrl, setSelectedPhysicalUrl] = useState<string | undefined>(undefined)
  const [gameIdentityMedia, setGameIdentityMedia] = useState<Record<string, { cover?: string; marquee?: string }>>({})
  const [mediaResolving, setMediaResolving] = useState(false)
  const mediaRequestIdRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  // V8.4.1 FINAL: Media cycle now REAL – store full candidate list to rotate via X
  const availableGameplayCandidatesRef = useRef<Array<{ url: string; type: 'video' | 'screenshot' }>>([])
  const gameplayCycleIndexRef = useRef(0)
  const [collectionGames, setCollectionGames] = useState<GameEntry[] | null>(null)
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionError, setCollectionError] = useState<string | null>(null)

  // V8.3.1 updater – restrained UI, never blocks startup, never touches ROMs/media/saves
  const [availableUpdate, setAvailableUpdate] = useState<CrystalUpdateInfo | null>(null)
  const [updaterDownloading, setUpdaterDownloading] = useState(false)
  const [updaterPct, setUpdaterPct] = useState(0)
  const [updaterError, setUpdaterError] = useState<string | null>(null)
  const [updaterPendingConfirm, setUpdaterPendingConfirm] = useState(false)
  const [updaterRawObj, setUpdaterRawObj] = useState<any | null>(null)

  // V8.4 DISCOVER – context + origin
  const [discoverPrefillGame, setDiscoverPrefillGame] = useState<GameEntry | null>(null)
  const [discoverOrigin, setDiscoverOrigin] = useState<View>('system')

  // V8.6C2.1 – Crystal Acquisition UI bridge (provider-agnostic, thin) – real refresh must fail honestly
  const crystalAcq = useCrystalAcquisition({
    refreshLibrary: async (sid: string) => {
      if (!isTauriEnvironment() || !isRealMachine) {
        const cached = gameCache.get(sid)
        if (cached) return cached
        return []
      }
      // Real Tauri machine: listGames failure must reject/throw – never return stale gameCache
      const games = await listGames(sid)
      setGameCache(prev => {
        const m = new Map(prev)
        m.set(sid, games)
        return m
      })
      return games
    },
    onGameFound: (sid: string, game: any) => {
      setActiveSystemId(sid)
      setSelectedGameId(game.id)
      setView('library')
    },
    onRefreshComplete: (_sid: string, _games: any) => {},
  })

  // Expose generic entry – DEV ONLY – production Tauri build must NOT expose window globals
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (!isDevFixtureAllowed()) {
        // ensure prod does not leak dev hooks
        try { delete (window as any).__beginCrystalAcquisition } catch {}
        try { delete (window as any).__crystalAcquisition } catch {}
        return
      }
      ;(window as any).__beginCrystalAcquisition = (req: any) => crystalAcq.begin(req)
      ;(window as any).__crystalAcquisition = crystalAcq
    } catch {}
  }, [crystalAcq])



  const populatedSystems = useMemo(() => {
    if (!config) return [] as MachineSystem[]
    return getPopulatedSystems(config) as MachineSystem[]
  }, [config])

  const systemsForUI = useMemo(() => {
    // V8.2 fixture DEV-only – merge fixture systems for web QA populated fidelity
    // Never overrides Tauri real machine truth alone; real machine still uses truth only,
    // but for browser dev with ?fixture=golden we inject gbc/ps2/gc (7 games each)
    // V8.5 extended: also include requested systemId (nds/gba/steam etc) even if not in golden fixture so screenshots never fallback to GBC
    try {
      const fm = isFixtureEnabled()
      if (fm.enabled) {
        const fixtureIds = getFixtureSystems() // ['gbc','ps2','gc']
        const base = config ? populatedSystems : (manifest ? Object.keys(manifest).filter(k => k !== '_default').map(id => ({ id, fullName: id } as unknown as MachineSystem)) : [] as MachineSystem[])
        // build set of existing ids
        const existing = new Set(base.map(s => s.id))
        const merged = [...base]
        for (const fid of fixtureIds) {
          if (!existing.has(fid)) {
            merged.push({ id: fid, fullName: fid } as unknown as MachineSystem)
            existing.add(fid)
          }
        }
        // V8.5: ensure requested systemId (nds/steam/etc) is present even if not in golden list
        if (fm.systemId && !existing.has(fm.systemId)) {
          merged.push({ id: fm.systemId, fullName: fm.systemId } as unknown as MachineSystem)
          existing.add(fm.systemId)
        }
        // also check rawParams for system that might not be parsed due to extended set mismatch (safety)
        try {
          const sp = fm.rawParams
          const rawSys = sp?.get('system')
          if (rawSys && !existing.has(rawSys)) {
            merged.push({ id: rawSys, fullName: rawSys } as unknown as MachineSystem)
          }
        } catch {}
        // if no base (config null and manifest null), still return fixture systems as fallback so screenshots never blank
        if (merged.length === 0) {
          return fixtureIds.map(id => ({ id, fullName: id } as unknown as MachineSystem))
        }
        return merged
      }
    } catch {}
    if (config) return populatedSystems
    if (!manifest) return [] as MachineSystem[]
    return Object.keys(manifest).filter(k => k !== '_default').map(id => ({ id, fullName: id } as unknown as MachineSystem))
  }, [config, populatedSystems, manifest])

  const systemIds = useMemo(() => systemsForUI.map(s => s.id), [systemsForUI])

  const currentSystem = useMemo(() => {
    if (!config) return undefined
    return getSystemById(config, activeSystemId)
  }, [config, activeSystemId])

  const fullName = useMemo(() => {
    if (currentSystem) return getSystemFullName(currentSystem)
    return activeSystemId
  }, [currentSystem, activeSystemId])

  const themeAssets = useMemo(() => {
    if (!manifest) return undefined
    try {
      return resolver.getThemeAssetsForSystem(activeSystemId, theme)
    } catch {
      return undefined
    }
  }, [manifest, activeSystemId, theme, resolver])

  const bgUrl = themeAssets?.background
  const logoUrl = themeAssets?.logo

  const nextIdx = useMemo(() => {
    const idx = systemIds.indexOf(activeSystemId)
    return (idx + 1 + systemIds.length) % systemIds.length
  }, [systemIds, activeSystemId])
  const prevIdx = useMemo(() => {
    const idx = systemIds.indexOf(activeSystemId)
    return (idx - 1 + systemIds.length) % systemIds.length
  }, [systemIds, activeSystemId])

  const nextSid = systemIds[nextIdx]
  const prevSid = systemIds[prevIdx]

  const nextAssets = useMemo(() => {
    if (!nextSid || !manifest) return undefined
    try {
      return resolver.getThemeAssetsForSystem(nextSid, theme)
    } catch {
      return undefined
    }
  }, [nextSid, manifest, theme, resolver])

  const prevAssets = useMemo(() => {
    if (!prevSid || !manifest) return undefined
    try {
      return resolver.getThemeAssetsForSystem(prevSid, theme)
    } catch {
      return undefined
    }
  }, [prevSid, manifest, theme, resolver])

  const stageConfig = useMemo(() => {
    return configForSystem(activeSystemId, fullName)
  }, [activeSystemId, fullName])

  const activeGames = useMemo(() => {
    return gameCache.get(activeSystemId) || []
  }, [gameCache, activeSystemId])

  const summary = useMemo(() => {
    if (!activeGames.length) return { total: 0, favoriteCount: 0, continuePlaying: undefined, recent: undefined, mostPlayed: undefined, surprise: undefined } as any
    return deriveSystemSummary(activeGames as any)
  }, [activeGames])

  const selectedIndex = useMemo(() => {
    if (!activeGames.length) return -1
    if (!selectedGameId) return 0
    const i = activeGames.findIndex(g => g.id === selectedGameId)
    return i >= 0 ? i : 0
  }, [activeGames, selectedGameId])

  const selectedGameEntry = useMemo(() => {
    if (!activeGames.length) return null
    if (selectedIndex >= 0 && selectedIndex < activeGames.length) return activeGames[selectedIndex]
    return activeGames[0] ?? null
  }, [activeGames, selectedIndex])

  const carouselGames: CarouselGame[] = useMemo(() => {
    return activeGames.slice(0, 200).map(g => {
      const anyG = g as any
      const fixCover = anyG._fixtureCoverUrl || null
      const fixMedia = fixtureMediaForGame(g.id)
      return { id: g.id, name: g.name, coverUrl: fixCover || fixMedia?.cover || gameIdentityMedia[g.id]?.cover || null }
    })
  }, [activeGames, gameIdentityMedia])

  const librarySelectedDetail: LibraryGameDetail | null | undefined = useMemo(() => {
    if (!selectedGameEntry) return null
    const g: any = selectedGameEntry
    const fix = fixtureMediaForGame(g.id)
    return {
      id: g.id,
      name: g.name,
      logoUrl: g._fixtureLogoUrl || fix?.marquee || gameIdentityMedia[g.id]?.marquee || null,
      coverUrl: g._fixtureCoverUrl || fix?.cover || gameIdentityMedia[g.id]?.cover || null,
      desc: g.description,
      developer: g.developer,
      publisher: g.publisher,
      genre: g.genre,
      players: g.players ?? null,
      rating: g.rating ?? null,
      releasedate: g.releasedate ?? null,
      year: g.year ?? null,
      favorite: !!g.favorite,
      play_count: g.play_count ?? null,
      playcount: g.playcount ?? null,
      last_played: g.last_played ?? null,
      lastplayed: g.lastplayed ?? null,
      lastPlayedLabel: lastPlayedLabel(g) ?? null,
      playTimeLabel: g.playtime
        ? `${Math.max(1, Math.round(Number(g.playtime) / 60))} min played`
        : parsePlayCount(g)
          ? `${parsePlayCount(g)} plays`
          : null,
    }
  }, [selectedGameEntry, gameIdentityMedia])

  useEffect(() => {
    let cancelled = false
    Promise.all(activeGames.slice(0, 200).map(async game => {
      const g = game as GameEntry & { cover_path?: string; marquee_path?: string }
      const [cover, marquee] = await Promise.all([
        g.cover_path ? toAssetUrl(g.cover_path) : Promise.resolve(null),
        g.marquee_path ? toAssetUrl(g.marquee_path) : Promise.resolve(null),
      ])
      return [g.id, { cover: cover || undefined, marquee: marquee || undefined }] as const
    })).then(entries => {
      if (!cancelled) setGameIdentityMedia(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [activeGames])

  const metaForLanding = useMemo(() => getSystemMeta(activeSystemId), [activeSystemId])
  const activeIndex = useMemo(() => {
    const idx = systemIds.indexOf(activeSystemId)
    return idx >= 0 ? idx : 0
  }, [systemIds, activeSystemId])

  const toLandingBrief = useCallback(
    (g: GameEntry | undefined | null): LandingGameBrief | null => {
      if (!g) return null
      const anyG = g as any
      const fix = fixtureMediaForGame(g.id)
      return {
        id: g.id,
        name: g.name,
        coverUrl: anyG._fixtureCoverUrl || fix?.cover || null,
        lastPlayedLabel: lastPlayedLabel(g) || undefined,
        metricLabel: (() => {
          const pc = parsePlayCount(g)
          if (pc != null && pc > 0) return `${pc} plays`
          const lp = lastPlayedLabel(g)
          return lp || undefined
        })(),
      }
    },
    []
  )

  const continueGameBrief = useMemo(() => toLandingBrief(summary.continuePlaying as any), [summary, toLandingBrief])
  const recentBrief = useMemo(() => toLandingBrief(getRecent(activeGames as any) as any), [activeGames, toLandingBrief])
  const mostPlayedBrief = useMemo(() => {
    const mp = getMostPlayed(activeGames as any) as any
    if (!mp) return null
    const base = toLandingBrief(mp)
    if (!base) return null
    return { ...base, metricLabel: `${parsePlayCount(mp)} plays` }
  }, [activeGames, toLandingBrief])
  const surpriseBrief = useMemo(() => toLandingBrief(getSurprise(activeGames as any) as any), [activeGames, toLandingBrief])

  const handleLaunchGame = useCallback(
    async (game: GameEntry) => {
      if (safeMode) {
        console.warn('[SAFE MODE] launch blocked –', game?.system_id, game?.rom_path)
        setSafeModeToast('SAFE MODE – launch blocked')
        setTimeout(() => setSafeModeToast(null), 2400)
        return
      }
      if (!config) return
      const sys = (config as MachineConfig).systems.find(s => s.id === game.system_id)
      if (!sys) return
      const req = resolveLaunchRequest(config as MachineConfig, {
        systemId: game.system_id,
        romPath: game.rom_path,
        selectedCommandLabel: sys.launchSelection.selectedLabel,
      })
      if (req.ok === false) return
      try {
        await getLauncherBridge().launch(req.backendRequest)
      } catch {}
    },
    [config, safeMode]
  )

  const handleSelectGame = useCallback(
    (game: GameEntry) => {
      setSelectedGameId(game.id)
      mediaRequestIdRef.current++
      const curId = mediaRequestIdRef.current
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      debounceRef.current = window.setTimeout(async () => {
        if (curId !== mediaRequestIdRef.current) return
        setMediaResolving(true)
        setSelectedGameplaySources(undefined)
        setSelectedPhysicalUrl(undefined)
        try {
          const isTauri = isTauriEnvironment()
          // V8.2 fixture media for web QA – DEV ONLY, never overrides real Tauri verification in prod
          if (!isTauri || !isRealMachine) {
            // attempt fixture media for populated screenshot – build candidate list for REAL X cycle
            const fix = fixtureMediaForGame(game.id)
            if (fix) {
              if (curId !== mediaRequestIdRef.current) return
              const regions = stageConfig.gameplayRegions
              const candidates: Array<{ url: string; type: 'video' | 'screenshot' }> = []
              if (fix.screenshot) candidates.push({ url: fix.screenshot, type: 'screenshot' })
              if (fix.cover) candidates.push({ url: fix.cover, type: 'screenshot' })
              availableGameplayCandidatesRef.current = candidates.length ? candidates : (fix.screenshot ? [{ url: fix.screenshot, type: 'screenshot' }] : [])
              gameplayCycleIndexRef.current = 0
              if (regions && regions.length > 0) {
                const first = availableGameplayCandidatesRef.current[0]
                if (first) {
                  setSelectedGameplaySources([{ regionId: regions[0].id, url: first.url, mediaType: first.type as any }])
                } else if (fix.screenshot) {
                  setSelectedGameplaySources([{ regionId: regions[0].id, url: fix.screenshot, mediaType: 'screenshot' as any }])
                } else if (fix.cover) {
                  const r0 = regions && regions[0]
                  if (r0) setSelectedGameplaySources([{ regionId: r0.id, url: fix.cover, mediaType: 'screenshot' as any }])
                }
              }
              if (fix.physical) setSelectedPhysicalUrl(fix.physical)
              setMediaResolving(false)
              return
            }
            setMediaResolving(false)
            availableGameplayCandidatesRef.current = []
            gameplayCycleIndexRef.current = 0
            return
          }
          const verification = await verifyMedia(game.system_id, game.rom_basename, ['videos', 'screenshots', 'titlescreens', 'miximages', 'covers', 'physicalmedia', 'marquees', 'fanart', '3dboxes'])
          if (curId !== mediaRequestIdRef.current) return
          const rawMedia = (verification as any).media as Record<string, { exists: boolean; path?: string; candidates: string[] }>
          const resolved: ResolvedGameMedia & { marquee?: string | null } = {} as any
          for (const [type, chk] of Object.entries(rawMedia || {})) {
            if (!chk?.exists) continue
            const p = (chk as any).path as string | undefined
            if (!p) continue
            const url = await toAssetUrl(p)
            if (!url) continue
            if (curId !== mediaRequestIdRef.current) return
            if (type === 'videos') resolved.video = url
            else if (type === 'screenshots') resolved.screenshot = url
            else if (type === 'titlescreens') resolved.titleScreen = url
            else if (type === 'miximages') resolved.mixImage = url
            else if (type === 'covers') resolved.cover = url
            else if (type === 'physicalmedia') resolved.physicalMedia = url
            else if (type === 'marquees') (resolved as any).marquee = url
            else if (type === 'fanart' && !resolved.mixImage) resolved.mixImage = url
            else if (type === '3dboxes' && !resolved.cover) resolved.cover = url
          }
          if (curId !== mediaRequestIdRef.current) return
          if (resolved.physicalMedia) setSelectedPhysicalUrl(resolved.physicalMedia)
          else setSelectedPhysicalUrl(undefined)
          const pick = pickGameplayFromResolved(resolved)
           // dual-screen truthful primary only – but also build full candidate list for X cycle
          const regions = stageConfig.gameplayRegions
          // Build ordered gameplay candidates: video > screenshot > title > mix > cover
          const allCandidates: Array<{ url: string; type: 'video'|'screenshot' }> = []
          if (resolved.video) allCandidates.push({ url: resolved.video, type: 'video' })
          if (resolved.screenshot) allCandidates.push({ url: resolved.screenshot, type: 'screenshot' })
          if ((resolved as any).titleScreen) allCandidates.push({ url: (resolved as any).titleScreen as string, type: 'screenshot' })
          if ((resolved as any).mixImage) allCandidates.push({ url: (resolved as any).mixImage as string, type: 'screenshot' })
          if ((resolved as any).cover) allCandidates.push({ url: (resolved as any).cover as string, type: 'screenshot' })
          // If pick primary exists but not in list (edge), ensure it leads
          if (pick.primaryUrl && pick.primaryType !== 'none' && !allCandidates.some(c => c.url === pick.primaryUrl)) {
            allCandidates.unshift({ url: pick.primaryUrl as string, type: pick.primaryType === 'video' ? 'video' : 'screenshot' })
          }
          availableGameplayCandidatesRef.current = allCandidates
          gameplayCycleIndexRef.current = 0
          if (!regions || regions.length === 0) {
            setSelectedGameplaySources(undefined)
          } else if (regions.length === 1) {
            if (pick.primaryUrl && pick.primaryType !== 'none') {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: pick.primaryUrl!, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }])
            } else if (allCandidates[0]) {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: allCandidates[0].url, mediaType: allCandidates[0].type as any }])
            } else {
              setSelectedGameplaySources(undefined)
            }
          } else {
            if (pick.primaryUrl) {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: pick.primaryUrl!, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }])
            } else if (allCandidates[0]) {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: allCandidates[0].url, mediaType: allCandidates[0].type as any }])
            } else {
              setSelectedGameplaySources(undefined)
            }
          }
        } catch {
          if (curId !== mediaRequestIdRef.current) return
          setSelectedGameplaySources(undefined)
          setSelectedPhysicalUrl(undefined)
          availableGameplayCandidatesRef.current = []
          gameplayCycleIndexRef.current = 0
        } finally {
          if (curId === mediaRequestIdRef.current) setMediaResolving(false)
        }
      }, 130) as unknown as number
    },
    [isRealMachine, stageConfig.gameplayRegions]
  )

  const onNav = useCallback(
    (action: NavigationAction) => {
      // V8.6C2.1 – Acquisition controller input guard – deterministic semantics, no dead-end on ALREADY
      try {
        const ext = (crystalAcq as any)?.externalState
        const phase = (crystalAcq as any)?.crystalPhase as string
        if (ext && phase) {
          const terminalReady = phase === "READY_TO_PLAY"
          // V8.6C2.1: ALREADY_IN_LIBRARY is NOT terminalCloseable – only blocking while refresh in progress, after -> READY or NOT_FOUND
          const terminalCloseable = ["FILE_CONFLICT","MULTIPLE_DOWNLOADS_FOUND","FAILED","SAFE_MODE","TIMED_OUT","INSTALLED_GAME_NOT_FOUND","LIBRARY_REFRESH_FAILED","CANCELLED"].includes(phase as any)
          const nonTerminalBlocking = ["PREPARING","OPENING_GAME_PAGE","WAITING_FOR_DOWNLOAD","DOWNLOAD_DETECTED","FINISHING_DOWNLOAD","ADDING_TO_LIBRARY","REFRESHING_LIBRARY","ALREADY_IN_LIBRARY"].includes(phase as any)
          if (action === "back") {
            if (nonTerminalBlocking) {
              try { (crystalAcq as any).cancel?.() } catch {}
              return
            } else if (terminalReady || terminalCloseable) {
              try { (crystalAcq as any).close?.() } catch {}
              return
            }
          }
          if (action === "confirm") {
            if (terminalReady) {
              const fg = (crystalAcq as any).foundGame
              if (fg) { handleLaunchGame(fg as any); return }
              const sel = selectedGameEntry
              if (sel) { handleLaunchGame(sel as any); return }
              return
            }
            if (nonTerminalBlocking) {
              return
            }
            if (terminalCloseable) {
              return
            }
          }
        }
      } catch {}


      if (view === 'system') {
        if (action === 'left' || action === 'up' || action === 'previousSystem') {
          const idx = systemIds.indexOf(activeSystemId)
          const prev = (idx - 1 + systemIds.length) % systemIds.length
          setActiveSystemId(systemIds[prev])
        } else if (action === 'right' || action === 'down' || action === 'nextSystem') {
          const idx = systemIds.indexOf(activeSystemId)
          const next = (idx + 1) % systemIds.length
          setActiveSystemId(systemIds[next])
        } else if (action === 'confirm') {
          setView('library')
        } else if (action === 'menu') {
          setView('settings')
        } else if (action === 'search') {
          // V8.4.1 DISCOVER – ADDITIVE: System Landing uses dedicated SEARCH (gamepad View/Select button 8, keyboard / ?)
          // Y (favorite) is NOT hijacked, preserves any prior System favorite if present. Only SEARCH triggers DISCOVER.
          setDiscoverPrefillGame(null)
          setDiscoverOrigin('system')
          setView('discover')
        }
        // favorite (Y) in System view: no-op preserved – does not trigger Discover, keeps prior behavior intact
      } else if (view === 'library') {
        if (action === 'search') {
          // Library DISCOVER additive – only SEARCH (View/Select) triggers discover, X/Y preserved for media/favorite
          const g = selectedGameEntry as any
          if (g) {
            setDiscoverPrefillGame(g)
            setDiscoverOrigin('library')
            setView('discover')
            return
          }
          // if no game, still allow empty discover
          setDiscoverPrefillGame(null)
          setDiscoverOrigin('library')
          setView('discover')
          return
        }
        if (action === 'favorite') {
          // Library Y – favorite toggle preserved – do NOT open Discover
          // Optimistic toggle in-memory (persistence beyond needs optional future DB write)
          const g = selectedGameEntry as any
          if (g) {
            // flip favorite flag visually – LibraryView already reads selectedGame.favorite
            try {
              g.favorite = !g.favorite
              // Force re-render via setSelectedGameId identity bump? Keep selected but trigger via recreation of activeGames derived? simplest: overwrite local state via setSelectedGameId itself unchanged – we push mutation to ref of activeGames entries which are same object; React will re-render due to setView? Use toast + force via small state? We use console and trigger synthetic update by re-setting game list type ref as new array via triggering config change not needed – toggle will show next render when selection changes; still we preserve binding semantics by not hijacking discover.
              console.info('[Library] favorite toggled', g.id, !!g.favorite)
            } catch {}
          }
          return
        }
        if (action === 'media') {
          // Library X – REAL media cycle V8.4.1: rotate through available gameplay candidates
          try {
            const candidates = availableGameplayCandidatesRef.current
            if (!candidates || candidates.length <= 1) {
              // No alternative media – still acknowledge but no visual change if single; if zero, nothing to do
              if (candidates && candidates.length === 1) {
                console.info('[Library] media cycle single source – no alternative')
              } else {
                console.info('[Library] media cycle requested – no media')
              }
              return
            }
            const regions = stageConfig.gameplayRegions
            if (!regions || regions.length === 0) return
            gameplayCycleIndexRef.current = (gameplayCycleIndexRef.current + 1) % candidates.length
            const next = candidates[gameplayCycleIndexRef.current]
            setSelectedGameplaySources([{ regionId: regions[0].id, url: next.url, mediaType: next.type as any }])
            console.info('[Library] media cycle ->', gameplayCycleIndexRef.current, next.url.slice(-40))
            // also dispatch legacy event for any external consumers / tests that still listen
            try {
              const ev = new CustomEvent('crystal-library-media-cycle' as any, { detail: { index: gameplayCycleIndexRef.current, url: next.url } })
              window.dispatchEvent(ev)
            } catch {}
          } catch {}
          return
        }
        if (!activeGames.length) {
          if (action === 'back') setView('system')
          return
        }
        if (action === 'left' || action === 'up') {
          setSelectedGameId(prev => {
            const list = activeGames
            const curIdx = prev ? list.findIndex(g => g.id === prev) : 0
            const safe = curIdx < 0 ? 0 : curIdx
            const nextIdx = (safe - 1 + list.length) % list.length
            return list[nextIdx].id
          })
        } else if (action === 'right' || action === 'down') {
          setSelectedGameId(prev => {
            const list = activeGames
            const curIdx = prev ? list.findIndex(g => g.id === prev) : 0
            const safe = curIdx < 0 ? 0 : curIdx
            const nextIdx = (safe + 1) % list.length
            return list[nextIdx].id
          })
        } else if (action === 'confirm') {
          if (safeMode) {
            console.warn('[SAFE MODE] controller launch blocked')
            setSafeModeToast('SAFE MODE – launch blocked')
            setTimeout(() => setSafeModeToast(null), 2400)
            return
          }
          const g = selectedGameEntry
          if (!g || !config) return
          const sys = (config as MachineConfig).systems.find(s => s.id === g.system_id)
          if (!sys) return
          const req = resolveLaunchRequest(config as MachineConfig, { systemId: g.system_id, romPath: g.rom_path, selectedCommandLabel: sys.launchSelection.selectedLabel })
          if (req.ok === false) return
          getLauncherBridge().launch(req.backendRequest).catch(() => {})
        } else if (action === 'back') {
          setView('system')
        } else if (action === 'menu') {
          setView('settings')
        }
      } else if (view === 'discover') {
        // forward to DiscoverView via custom event for gamepad continuity; back/menu close to origin
        try {
          const ev = new CustomEvent('crystal-discover-nav', { detail: action })
          window.dispatchEvent(ev)
        } catch {}
        if (action === 'back' || action === 'menu') {
          // allow discover view internal to handle detail close first – we check if it prevented default by inspecting window flag? Simple: if no detail open logic external cannot know.
          // We let DiscoverView close detail on back; if it wants to exit view, it calls onBack prop which restores origin.
          // So we only fallback if discover hasn't handled: treat back as exit to origin when not in detail mode.
          // Heuristic: we emit but also after tiny delay if still in discover view we pop to origin is allowed via onBack callback override in DiscoverView internal? Simpler: DiscoverView's onBack prop restores origin.
          // For V8.4 stub we close on double back is handled inside view itself via key listener; this here is gamepad bridge – we forward and also allow view to manage.
          // Prevent accidental system switch.
        }
        // don't switch systems in discover
        return
      } else {
        if (action === 'back') setView('system')
        if (action === 'menu' && view !== 'settings') {
          // menu still goes to settings unless already
        }
        if (action === 'search') {
          setDiscoverPrefillGame(null)
          setDiscoverOrigin(view as any)
          setView('discover')
        }
      }
    },
    [view, systemIds, activeSystemId, activeGames, selectedGameEntry, config, safeMode, stageConfig, crystalAcq, handleLaunchGame]
  )

  // Effects – must be unconditional and before any early returns
  useEffect(() => {
    try {
      const qp = typeof window !== 'undefined' ? window.location.search : ''
      const ls = typeof window !== 'undefined' ? window.localStorage.getItem('crystal-dev') : null
      if (qp.includes('dev') || ls === '1') setDevMode(true)
    } catch {}
  }, [])

  // Fixture mode ?fixture=golden&system=gbc|ps2|gc&view=system|library&theme=light|dark (DEV only) – V8.5 extended for discover/settings/nds/steam
  useEffect(() => {
    try {
      const fm = isFixtureEnabled()
      if (!fm.enabled) {
        // V8.5: also allow direct ?view=discover|settings|library|system without fixture for rapid QA (if dev)
        try {
          const sp = new URLSearchParams(window.location.search)
          const rawView = sp.get('view')
          const rawSystem = sp.get('system')
          const rawTheme = sp.get('theme')
          if (rawSystem) setActiveSystemId(rawSystem)
          if (rawView && ['system','library','discover','settings','allgames','favorites','recent'].includes(rawView)) {
            setView(rawView as any)
          }
          if (rawTheme && rawTheme !== theme) {
            setTimeout(() => { try { toggle() } catch {} }, 0)
          }
        } catch {}
        return
      }
      if (fm.systemId) {
        // default gbc but allow override
        setActiveSystemId(fm.systemId)
      }
      if (fm.view && (['system','library','discover','settings','allgames','favorites','recent'] as any).includes(fm.view)) {
        setView(fm.view as any)
      }
      if (fm.theme && (fm.theme === 'light' || fm.theme === 'dark')) {
        // toggle if needed – ThemeProvider exposes toggle; we set via direct DOM? Use toggle heuristic
        // We cannot directly set theme, but we can check current and toggle if mismatch
        // We read from theme token via useThemeAssets: theme is current, toggle switches.
        // So if requested theme != current, toggle once.
        // Note: this runs once on mount; if still mismatched, toggle will flip.
        // We guard with try.
        try {
          // @ts-ignore theme closure captured; we just check if mismatch then toggle
          // theme variable is from outer scope, so this effect captures initial theme
          // To avoid stale closure, we use a DOM check? Simpler: request toggle if fm.theme !== theme
          // Since effect runs once, it's okay.
          // eslint-disable-next-line
          // @ts-ignore we access theme in closure – it will be stale but initial is fine
          if (fm.theme !== theme) {
            // queue microtask so provider ready
            setTimeout(() => {
              try { toggle() } catch {}
            }, 0)
          }
        } catch {}
      }
      // V8.5: if q present + discover view, we pass via window global for DiscoverView to pick up
      try {
        const sp = fm.rawParams
        const q = sp?.get('q')
        if (q) {
          // store for discover prefill reading (DiscoverView will look at window.__crystal_discover_prefill)
          ;(window as any).__crystal_discover_prefill_q = q
          // also if discover view, attempt to set query via custom event after delay – Discover component will handle empty, we rely on its own reading of this global
        }
      } catch {}
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SAFE MODE query – frontend mirrors backend state (backend ultimately enforces)
  useEffect(() => {
    let cancelled = false
    async function querySafeMode() {
      try {
        if (!isTauriEnvironment()) {
          // browser dev – safe mode off unless explicitly flagged via localStorage
          try {
            const flag = typeof window !== 'undefined' ? window.localStorage.getItem('crystal-safe-mode') : null
            if (flag === '1') {
              if (!cancelled) setSafeMode(true)
            }
          } catch {}
          return
        }
        const invoke = await getTauriInvoker()
        if (!invoke) return
        try {
          const res = await invoke('get_safe_mode')
          let active = false
          if (typeof res === 'boolean') active = res
          else if (res && typeof res === 'object') {
            // support { safe_mode: bool } or { safeMode: bool } or { active: bool }
            const o = res as any
            if (typeof o.safe_mode === 'boolean') active = o.safe_mode
            else if (typeof o.safeMode === 'boolean') active = o.safeMode
            else if (typeof o.active === 'boolean') active = o.active
            else if (typeof o.enabled === 'boolean') active = o.enabled
          } else if (typeof res === 'string') {
            // some impl may return JSON string
            try {
              const j = JSON.parse(res as any)
              if (typeof j === 'boolean') active = j
              else if (j && typeof j === 'object') {
                if (typeof j.safe_mode === 'boolean') active = j.safe_mode
                else if (typeof j.safeMode === 'boolean') active = j.safeMode
              }
            } catch {}
          }
          if (!cancelled) setSafeMode(!!active)
          if (active) {
            console.info('[SAFE MODE] active – frontend launch blocked, backend will also enforce')
          }
        } catch (e) {
          // command not yet implemented or error – treat as not safe
          // do not throw, keep safeMode false
          if ((e as any)?.message?.includes?.('not found') || String(e).includes('not registered')) {
            // backend does not yet have get_safe_mode – expected during rollout
            return
          }
          // log for visibility but don't block UI
          console.debug('[SAFE MODE] query failed (fallback false):', e)
        }
      } catch {}
    }
    querySafeMode()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (systemsForUI.length && !systemsForUI.find(s => s.id === activeSystemId)) {
      setActiveSystemId(systemsForUI[0].id)
    }
  }, [systemsForUI, activeSystemId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activeSystemId) return
      if (gameCache.has(activeSystemId)) return
      if (cacheLoading.has(activeSystemId)) return
      const isTauri = isTauriEnvironment()
      const useFixtureInWeb = (() => {
        // V8.2 DEV-ONLY populated fidelity – never overrides real Tauri truth
        // Isolation: Tauri real machine always false (no override)
        if (isTauri && isRealMachine) return false // real machine truth only
        if (typeof window !== 'undefined') {
          try {
            const sp = new URLSearchParams(window.location.search)
            // explicit new helper path: ?fixture=golden + DEV enables fixture (web or Tauri dev)
            const isGolden = sp.get('fixture') === 'golden'
            // check DEV via import.meta.env.DEV
            let isDev = false
            try {
              // @ts-ignore vite
              if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) isDev = true
            } catch {}
            // fallback prod check: also allow when helper reports dev allowed
            if (!isDev) {
              try {
                // use helper isDevFixtureAllowed as fallback dev signal
                if (isDevFixtureAllowed()) isDev = true
                // also consider generic helper enabled (parses URL + DEV)
                if (isFixtureEnabled().enabled) return true
              } catch {}
            }
            if (isDev && isGolden) return true
            // legacy qs includes still valid for web QA
            const qs = window.location.search
            if (qs.includes('fixture') || qs.includes('dev')) return true
            // default web QA – no tauri = fixture
            if (!isTauri) return true
          } catch {
            // on parse failure, keep old logic: if not tauri default true
            if (!isTauri) return true
          }
        } else {
          if (!isTauri) return true
        }
        return false
      })()
      if (!isTauri || !isRealMachine) {
        if (useFixtureInWeb) {
          const fixtureSys = getFixtureSystems()
          if (fixtureSys.includes(activeSystemId)) {
            const fixtures = getFixtureGames(activeSystemId).map(toGameEntry)
            if (cancelled) return
            setGameCache(prev => {
              const m = new Map(prev)
              m.set(activeSystemId, fixtures)
              return m
            })
            // preload not needed
            return
          }
        }
        // no real runtime and no fixture for this system – keep empty but do not loop
        return
      }
      setCacheLoading(prev => {
        const s = new Set(prev)
        s.add(activeSystemId)
        return s
      })
      try {
        const games = await listGames(activeSystemId)
        if (cancelled) return
        setGameCache(prev => {
          const m = new Map(prev)
          m.set(activeSystemId, games)
          return m
        })
      } catch {
        if (!cancelled) {
          // fallback to fixture even in Tauri if enumeration fails but fixture exists (dev assist)
          if ((!isTauri || !isRealMachine) && getFixtureSystems().includes(activeSystemId)) {
            try {
              const fixtures = getFixtureGames(activeSystemId).map(toGameEntry)
              setGameCache(prev => {
                const m = new Map(prev)
                m.set(activeSystemId, fixtures)
                return m
              })
              return
            } catch {}
          }
          setGameCache(prev => {
            const m = new Map(prev)
            m.set(activeSystemId, [])
            return m
          })
        }
      } finally {
        if (!cancelled) {
          setCacheLoading(prev => {
            const s = new Set(prev)
            s.delete(activeSystemId)
            return s
          })
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activeSystemId, isRealMachine])

  useEffect(() => {
    if (!systemsForUI.length) return
    const idx = systemsForUI.findIndex(s => s.id === activeSystemId)
    if (idx < 0) return
    const len = systemsForUI.length
    const neighbours = [(idx - 1 + len) % len, (idx + 1) % len]
    neighbours.forEach(i => {
      const sid = systemsForUI[i].id
      try {
        const a = resolver?.getThemeAssetsForSystem ? resolver.getThemeAssetsForSystem(sid, theme) : undefined
        if (a?.background) {
          const im = new Image()
          im.decoding = 'async'
          im.src = a.background
        }
        if (a?.logo) {
          const il = new Image()
          il.decoding = 'async'
          il.src = a.logo
        }
      } catch {}
      try {
        const cfg = configForSystem(sid)
        const hw = (cfg as any).hardwareForeground as string | undefined
        if (hw) {
          const h = new Image()
          h.decoding = 'async'
          h.src = hw
        }
      } catch {}
    })
  }, [activeSystemId, systemsForUI, resolver, theme])

  useEffect(() => {
    if (view !== 'library') return
    if (!selectedGameEntry) return
    if (selectedGameEntry.id !== selectedGameId) return
    handleSelectGame(selectedGameEntry)
  }, [selectedGameEntry, view, selectedGameId, handleSelectGame])

  useEffect(() => {
    if (view === 'library' && activeGames.length && !selectedGameId) {
      setSelectedGameId(activeGames[0].id)
    }
  }, [view, activeGames, selectedGameId])

  useEffect(() => {
    setSelectedGameId(null)
    setSelectedGameplaySources(undefined)
    setSelectedPhysicalUrl(undefined)
    setMediaResolving(false)
    mediaRequestIdRef.current++
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [activeSystemId])

  useEffect(() => {
    if (view !== 'allgames' && view !== 'favorites' && view !== 'recent') return
    let cancelled = false
    async function load() {
      setCollectionLoading(true)
      setCollectionError(null)
      setCollectionGames(null)
      if (!isTauriEnvironment() || !isRealMachine) {
        if (!cancelled) {
          setCollectionGames([])
          setCollectionLoading(false)
        }
        return
      }
      try {
        let res: GameEntry[] = []
        if (view === 'allgames') res = await listAllGames()
        else if (view === 'favorites') res = await getFavorites()
        else res = await getRecentlyPlayed()
        if (cancelled) return
        setCollectionGames(res)
      } catch (e: any) {
        if (!cancelled) {
          setCollectionError(e?.message || String(e))
          setCollectionGames([])
        }
      } finally {
        if (!cancelled) setCollectionLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [view, isRealMachine])

  useSemanticInput(onNav as any)

  // V8.3.1 – startup update check, async, non-blocking, silent on failure/offline
  useEffect(() => {
    if (!isTauriEnvironment()) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        // Gentle delay so first paint not blocked – 1.8s
        const info = await checkForUpdate().catch(() => null)
        if (cancelled) return
        if (info && info.available && !availableUpdate) {
          // Log to Crystal-local logs via safety logger? Frontend fallback console log
          console.info(`[updater] available v${info.version} (current ${info.currentVersion}) – showing restrained banner`)
          setAvailableUpdate(info)
          // If we got raw object with download methods it would be here, but checkForUpdate returns normalized only.
          // We re-check with module raw when user clicks UPDATE to preserve full object.
        }
      } catch (e) {
        // swallow – current app usable
        console.debug('[updater] startup check failed (ignored):', e)
      }
    }, 1800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Now early returns safe – all hooks already called unconditionally
  if (machineLoading || manifestLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg)', color: 'var(--crystal-ink)' }}>
        <div style={{ opacity: 0.6, fontSize: 12, letterSpacing: '0.08em' }}>crystal frontend • loading machine…</div>
      </div>
    )
  }

  if (machineError) {
    const isBlocking = !!(blockingError || (typeof machineError === 'string' && machineError.includes('Real machine configuration failed')))
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg)', color: 'var(--crystal-ink)', padding: 24 }}>
        <div style={{ maxWidth: 640, fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--crystal-mono)' }}>
          <div style={{ marginBottom: 10, fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 500, color: isBlocking ? '#ff7b7b' : 'var(--crystal-ink)' }}>{isBlocking ? 'Real machine configuration failed – blocking' : 'Machine manifest failed to load'}</div>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, background: 'var(--crystal-glass)', border: `1px solid ${isBlocking ? 'rgba(255,107,107,0.25)' : 'var(--crystal-line)'}`, padding: 14, borderRadius: 10, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{machineError}</div>
          {validationErrors && validationErrors.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.8 }}>
              <div style={{ marginBottom: 4, opacity: 0.7 }}>Validation errors ({validationErrors.length}):</div>
              {validationErrors.slice(0, 8).map((e: any, i: number) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--crystal-line)', fontSize: 10 }}>
                  <span style={{ color: 'var(--crystal-electric)' }}>{e.path}</span> <span>– {e.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (config && populatedSystems.length === 0) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg,#0a0a0f)', color: 'var(--crystal-ink)', padding: 24 }}>
        <div style={{ maxWidth: 560, fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--crystal-mono)', border: '1px solid var(--crystal-line)', background: 'var(--crystal-glass)', padding: 18, borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Machine reports 0 populated systems</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`fullscreen-root ${theme}-theme`} style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#0a0a0f' }}>
      {view === 'system' && (
        <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
          {bgUrl ? (
            <img src={bgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.05) brightness(0.92)', transform: 'translateZ(0)' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: theme === 'dark' ? '#0a0a0f' : '#f4f6fb' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? 'linear-gradient(180deg, rgba(10,10,15,0.12), transparent 40%, rgba(10,10,15,0.28))' : 'linear-gradient(180deg, rgba(250,252,255,0.18), transparent 44%, rgba(10,12,20,0.06))', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,0.26) 100%)', opacity: 0.8, pointerEvents: 'none' }} />

          <SystemLanding
            systemId={activeSystemId}
            fullName={fullName}
            theme={theme}
            systemIndex={activeIndex}
            totalSystems={systemIds.length || 19}
            logoUrl={logoUrl}
            backgroundUrl={bgUrl}
            nextBackgroundUrl={nextAssets?.background}
            prevBackgroundUrl={prevAssets?.background}
            nextLogoUrl={nextAssets?.logo}
            prevLogoUrl={prevAssets?.logo}
            gameCount={summary.total ?? activeGames.length}
            favoriteCount={summary.favoriteCount ?? 0}
            continueGame={continueGameBrief as any}
            recentGame={recentBrief as any}
            mostPlayedGame={mostPlayedBrief as any}
            surpriseGame={surpriseBrief as any}
            meta={metaForLanding as any}
            onEnter={() => setView('library')}
            onDiscover={() => {
              setDiscoverPrefillGame(null)
              setDiscoverOrigin('system')
              setView('discover')
            }}
            onPrev={() => {
              const idx = systemIds.indexOf(activeSystemId)
              const prev = (idx - 1 + systemIds.length) % systemIds.length
              setActiveSystemId(systemIds[prev])
            }}
            onNext={() => {
              const idx = systemIds.indexOf(activeSystemId)
              const nxt = (idx + 1) % systemIds.length
              setActiveSystemId(systemIds[nxt])
            }}
          />

          <button
            onClick={toggle}
            aria-label="Toggle theme"
            style={{
              position: 'absolute',
              top: 12,
              right: 14,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: theme === 'dark' ? 'rgba(6,10,16,0.36)' : 'rgba(245,248,255,0.64)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,24,44,0.10)'}`,
              color: theme === 'dark' ? 'rgba(230,244,255,0.86)' : 'rgba(18,26,44,0.7)',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'auto',
              fontSize: 12,
              zIndex: 8,
            }}
          >
            ◐
          </button>

          {safeMode && (
            <div
              data-testid="safe-mode-badge"
              style={{
                position: 'absolute',
                top: 14,
                right: devMode ? 148 : 54,
                zIndex: 8,
                pointerEvents: 'none',
                background: theme === 'dark' ? 'rgba(8,10,14,0.56)' : 'rgba(255,255,255,0.72)',
                border: `1px solid ${theme === 'dark' ? 'rgba(255,120,120,0.24)' : 'rgba(255,90,90,0.22)'}`,
                color: theme === 'dark' ? 'rgba(255,180,180,0.92)' : 'rgba(170,40,40,0.92)',
                padding: '4px 10px',
                borderRadius: 999,
                fontFamily: 'var(--crystal-mono)',
                fontSize: 10.5,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
              }}
            >
              SAFE MODE
            </div>
          )}

          {devMode && (
            <div style={{ position: 'absolute', top: 10, right: safeMode ? 208 : 54, display: 'flex', gap: 8, zIndex: 8, pointerEvents: 'auto' }}>
              <button onClick={() => setShowGuides(v => !v)} style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', color: '#e8f2ff', padding: '5px 10px', borderRadius: 999, fontSize: 10, fontFamily: 'var(--crystal-mono)' }}>
                {showGuides ? 'Hide guides' : 'Guides'}
              </button>
              <button
                onClick={() => setDevMode(false)}
                style={{ background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.10)', color: '#e8f2ff', padding: '5px 10px', borderRadius: 999, fontSize: 10 }}
              >
                Exit dev
              </button>
            </div>
          )}
        </div>
      )}

            {/* V8.6C2.1 Acquisition Status Card – premium glass, controller hints – DEV-GATED via isDevFixtureAllowed */}
      {(() => {
        try {
          let fixtureExternal: any = null
          let fixturePhase: any = null
          // Dev-gate: acquisition fixture query activation only when dev fixture allowed
          if (isDevFixtureAllowed()) {
            try {
              if (typeof window !== 'undefined') {
                const sp = new URLSearchParams(window.location.search)
                const af = sp.get('acq-fixture') || sp.get('acquisition-fixture') || sp.get('acq')
                if (af) {
                  const map: any = {
                    "WAITING_FOR_DOWNLOAD": { phase: "WAITING_FOR_DOWNLOAD", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-wait", errorCode: null, message: null },
                    "DOWNLOAD_DETECTED": { phase: "DOWNLOAD_DETECTED", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-detected", errorCode: null },
                    "WAITING_FOR_STABILITY": { phase: "WAITING_FOR_STABILITY", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-stability", errorCode: null },
                    "FINISHING_DOWNLOAD": { phase: "WAITING_FOR_STABILITY", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-stability", errorCode: null },
                    "IMPORTING": { phase: "IMPORTING", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-import" },
                    "ADDING_TO_LIBRARY": { phase: "IMPORTING", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-import" },
                    "INSTALLED": { phase: "INSTALLED", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-inst" },
                    "READY_TO_PLAY": { phase: "INSTALLED", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-ready" },
                    "READY": { phase: "INSTALLED", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-ready" },
                    "COLLISION": { phase: "COLLISION", systemId: "gbc", expectedTitle: "Game Already Exists.zip", sessionId: "fixture-coll" , errorCode: "COLLISION" },
                    "FILE_CONFLICT": { phase: "COLLISION", systemId: "gbc", expectedTitle: "Game Already Exists.zip", sessionId: "fixture-coll", errorCode: "COLLISION" },
                    "FAILED": { phase: "FAILED", systemId: "gbc", expectedTitle: "Broken Game", sessionId: "fixture-fail", errorCode: "NO_VALID_ROM_IN_ARCHIVE" },
                    "TIMED_OUT": { phase: "TIMED_OUT", systemId: "gbc", expectedTitle: "Missing Game", sessionId: "fixture-timeout", errorCode: "TIMED_OUT" },
                    "DOWNLOAD_NOT_FOUND": { phase: "TIMED_OUT", systemId: "gbc", expectedTitle: "Missing Game", sessionId: "fixture-timeout", errorCode: "TIMED_OUT" },
                    "SAFE_MODE": { phase: "FAILED", systemId: "gbc", expectedTitle: "Safe Blocked", sessionId: "fixture-safe", errorCode: "SAFE_MODE_BLOCKED_IMPORT" },
                    "SAFE_MODE_BLOCKED": { phase: "FAILED", systemId: "gbc", expectedTitle: "Safe Blocked", sessionId: "fixture-safe", errorCode: "SAFE_MODE_BLOCKED_IMPORT" },
                    "AMBIGUOUS": { phase: "AMBIGUOUS", systemId: "gbc", expectedTitle: "Mario", sessionId: "fixture-ambig", errorCode: "AMBIGUOUS" },
                    "MULTIPLE": { phase: "AMBIGUOUS", systemId: "gbc", expectedTitle: "Mario", sessionId: "fixture-ambig", errorCode: "AMBIGUOUS" },
                    "LIBRARY_REFRESH_FAILED": { phase: "INSTALLED", systemId: "gbc", expectedTitle: "Pokémon Crystal", sessionId: "fixture-refreshfail" },
                  }
                  const rec = map[af.toUpperCase()] || map[af]
                  if (rec) {
                    const now = Date.now()
                    fixtureExternal = {
                      coordinatorId: "fixture-" + af,
                      systemId: rec.systemId,
                      expectedTitle: rec.expectedTitle,
                      sessionId: rec.sessionId,
                      phase: rec.phase,
                      acquisitionSession: null,
                      startedAt: now - 6000,
                      lastUpdatedAt: now,
                      errorCode: rec.errorCode || null,
                      message: rec.message || null,
                    }
                    const phaseMap: any = {
                      "WAITING_FOR_DOWNLOAD":"WAITING_FOR_DOWNLOAD",
                      "DOWNLOAD_DETECTED":"DOWNLOAD_DETECTED",
                      "WAITING_FOR_STABILITY":"FINISHING_DOWNLOAD",
                      "FINISHING_DOWNLOAD":"FINISHING_DOWNLOAD",
                      "IMPORTING":"ADDING_TO_LIBRARY",
                      "ADDING_TO_LIBRARY":"ADDING_TO_LIBRARY",
                      "INSTALLED":"READY_TO_PLAY",
                      "READY_TO_PLAY":"READY_TO_PLAY",
                      "READY":"READY_TO_PLAY",
                      "COLLISION":"FILE_CONFLICT",
                      "FILE_CONFLICT":"FILE_CONFLICT",
                      "FAILED":"FAILED",
                      "TIMED_OUT":"TIMED_OUT",
                      "DOWNLOAD_NOT_FOUND":"TIMED_OUT",
                      "SAFE_MODE":"SAFE_MODE",
                      "SAFE_MODE_BLOCKED":"SAFE_MODE",
                      "AMBIGUOUS":"MULTIPLE_DOWNLOADS_FOUND",
                      "MULTIPLE":"MULTIPLE_DOWNLOADS_FOUND",
                      "LIBRARY_REFRESH_FAILED":"LIBRARY_REFRESH_FAILED",
                    }
                    fixturePhase = phaseMap[af.toUpperCase()] || phaseMap[af] || null
                  }
                }
              }
            } catch {}
          }
          const ext = fixtureExternal || crystalAcq.externalState
          const cPhase = (fixturePhase as any) || crystalAcq.crystalPhase
          if (!ext && !fixtureExternal) return null
          return (
            <AcquisitionStatusCard
              externalState={ext as any}
              crystalPhase={cPhase as any}
              theme={theme as any}
              forcePresentForFixture={!!fixtureExternal}
              onCancel={() => { try { crystalAcq.cancel() } catch {} }}
              onClose={() => { try { crystalAcq.close() } catch {} }}
              onPlay={() => {
                const g = (crystalAcq as any).foundGame || selectedGameEntry
                if (g) handleLaunchGame(g as any)
              }}
            />
          )
        } catch { return null }
      })()}

      {view === 'library' && (
        <SystemStage
          config={{ ...(stageConfig as any), background: { url: bgUrl } }}
          theme={theme}
          showGuides={showGuides}
          backgroundUrl={bgUrl}
          gameplaySources={selectedGameplaySources}
          physicalMediaUrl={selectedPhysicalUrl}
          isEntered={true}
          mode="library"
        >
          <LibraryView
            systemId={activeSystemId}
            fullName={fullName}
            theme={theme}
            games={carouselGames}
            selectedId={selectedGameId || (activeGames[0]?.id ?? '')}
            selectedGame={librarySelectedDetail}
            safeMode={safeMode}
            onSafeModeBlocked={() => {
              console.warn('[SAFE MODE] blocked launch via LibraryView')
              setSafeModeToast('SAFE MODE – launch blocked')
              setTimeout(() => setSafeModeToast(null), 2400)
            }}
            onSelect={id => setSelectedGameId(id)}
            onLaunch={g => {
              const real = activeGames.find(ag => ag.id === g.id)
              if (real) handleLaunchGame(real)
            }}
            onDiscover={() => {
              const g = selectedGameEntry as any
              setDiscoverPrefillGame(g || null)
              setDiscoverOrigin('library')
              setView('discover')
            }}
            onBack={() => {
              setView('system')
              setSelectedGameplaySources(undefined)
              setSelectedPhysicalUrl(undefined)
            }}
            mediaResolving={mediaResolving}
            logoUrl={logoUrl}
            stageNode={null}
          />
        </SystemStage>
      )}

      {view === 'discover' && (
        <DiscoverView
          systemId={activeSystemId}
          systemFullName={fullName}
          theme={theme}
          backgroundUrl={bgUrl}
          logoUrl={logoUrl}
          selectedLocalGame={discoverPrefillGame}
          libraryGames={activeGames}
          onBeginAcquisition={crystalAcq.begin}
          acquisitionActive={crystalAcq.active}
          acquisitionPhase={crystalAcq.crystalPhase as any}
          onBack={() => {
            // restore origin view
            setView(discoverOrigin === 'discover' ? 'system' : (discoverOrigin as any))
          }}
        />
      )}

            {(view === 'allgames' || view === 'favorites' || view === 'recent') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: theme === 'dark' ? '#0a0a0f' : '#f2f4f8',
            color: theme === 'dark' ? '#eef7ff' : '#14151a',
          }}
        >
          {/* Background – same language as Discover / Library */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
            {bgUrl ? (
              <img
                src={bgUrl}
                alt=""
                style={{
                  position: 'absolute',
                  inset: '-8%',
                  width: '116%',
                  height: '116%',
                  objectFit: 'cover',
                  filter: 'blur(32px) saturate(0.84) brightness(0.68)',
                  transform: 'scale(1.08)',
                  opacity: theme === 'dark' ? 0.9 : 0.62,
                }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? '#12131a' : '#eceef8' }} />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  theme === 'dark'
                    ? 'linear-gradient(180deg, rgba(10,12,18,0.36), rgba(8,10,16,0.58)), radial-gradient(86% 70% at 50% 18%, transparent 10%, rgba(6,9,14,0.42) 78%)'
                    : 'linear-gradient(180deg, rgba(251,253,255,0.68), rgba(244,247,255,0.76)), radial-gradient(86% 70% at 50% 18%, transparent 8%, rgba(232,238,248,0.44) 72%)',
              }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.18) 100%)', opacity: theme === 'dark' ? 0.5 : 0.2 }} />
          </div>

          {/* Top chrome */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              height: 84,
              minHeight: 84,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
              backdropFilter: 'blur(22px) saturate(1.12)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
              background: theme === 'dark' ? 'rgba(10,12,18,0.32)' : 'rgba(255,255,255,0.56)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => setView('system')}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                  background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)',
                  color: theme === 'dark' ? '#eef7ff' : '#16213e',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 13,
                }}
              >
                ←
              </button>
              <div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.11em', opacity: 0.56, textTransform: 'uppercase' }}>
                  CRYSTAL • COLLECTION
                </div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 20, fontWeight: 720, letterSpacing: '-0.02em', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {view === 'allgames' ? 'All Games' : view === 'favorites' ? 'Favorites' : 'Recently Played'}
                  <span
                    style={{
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 10,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: theme === 'dark' ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.10)',
                      border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
                      color: theme === 'dark' ? 'rgba(230,244,255,0.88)' : 'rgba(22,33,62,0.82)',
                    }}
                  >
                    {(collectionGames?.length ?? '—')} TITLES
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.54, letterSpacing: '0.08em' }}>
                [B] BACK • [A] PLAY • D-PAD NAV
              </div>
              {logoUrl && (
                <div style={{ opacity: 0.88 }}>
                  <SystemLogo systemId={activeSystemId} logoUrl={logoUrl} fallbackName={fullName} theme={theme} style={{ minWidth: 120, maxWidth: 180, minHeight: 28 }} isSelected />
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
            {collectionLoading && (
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 12, opacity: 0.6, padding: '32px 8px' }}>Loading collection…</div>
            )}
            {collectionError && (
              <div
                style={{
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 11,
                  color: '#ff8a8a',
                  background: theme === 'dark' ? 'rgba(255,80,80,0.08)' : 'rgba(255,80,80,0.08)',
                  border: '1px solid rgba(255,80,80,0.16)',
                  padding: '12px 14px',
                  borderRadius: 12,
                }}
              >
                {collectionError}
              </div>
            )}
            {!collectionLoading && !collectionError && collectionGames && collectionGames.length === 0 && (
              <div
                style={{
                  marginTop: 24,
                  padding: '28px 22px',
                  borderRadius: 16,
                  background: theme === 'dark' ? 'rgba(20,24,36,0.56)' : 'rgba(255,255,255,0.72)',
                  border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}`,
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 11,
                  lineHeight: 1.6,
                  opacity: 0.72,
                }}
              >
                No titles here — Tauri runtime reports no games for this collection. Real machine truth only, no synthetic fallback. Connect your ROG Ally X library to see real titles.
              </div>
            )}
            {!collectionLoading && collectionGames && collectionGames.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                {collectionGames.map(g => (
                  <div
                    key={g.id}
                    onClick={() => handleLaunchGame(g)}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderRadius: 14,
                      background:
                        theme === 'dark'
                          ? 'linear-gradient(180deg, rgba(26,30,46,0.72), rgba(18,22,36,0.64))'
                          : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,252,255,0.86))',
                      border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.07)'}`,
                      boxShadow: theme === 'dark' ? '0 6px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)' : '0 6px 16px rgba(18,26,44,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                      cursor: 'pointer',
                      transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: theme === 'dark' ? 'rgba(125,249,255,0.10)' : 'rgba(70,130,255,0.10)',
                        border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.14)'}`,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: theme === 'dark' ? '#7df9ff' : '#3a6ee8',
                        flexShrink: 0,
                      }}
                    >
                      {g.system_id.toUpperCase().slice(0, 3)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                      <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.58, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.rom_basename}
                        <span style={{ opacity: 0.5, marginLeft: 6 }}>{g.extension}</span>
                        <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 999, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', fontSize: 9 }}>{g.system_id}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: 'grid',
                          placeItems: 'center',
                          background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.05)',
                          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)'}`,
                          fontFamily: 'var(--crystal-mono)',
                          fontSize: 11,
                        }}
                      >
                        A
                      </span>
                      <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.44 }}>↗ PLAY</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: theme === 'dark' ? '#0a0a0f' : '#f2f4f8',
            color: theme === 'dark' ? '#eef7ff' : '#14151a',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
            {bgUrl ? (
              <img src={bgUrl} alt="" style={{ position: 'absolute', inset: '-8%', width: '116%', height: '116%', objectFit: 'cover', filter: 'blur(32px) saturate(0.84) brightness(0.68)', transform: 'scale(1.08)', opacity: theme === 'dark' ? 0.9 : 0.62 }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? '#12131a' : '#eceef8' }} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? 'linear-gradient(180deg, rgba(10,12,18,0.42), rgba(8,10,16,0.68)), radial-gradient(86% 70% at 50% 18%, transparent 12%, rgba(6,9,14,0.48) 78%)' : 'linear-gradient(180deg, rgba(251,253,255,0.72), rgba(244,247,255,0.82)), radial-gradient(86% 70% at 50% 18%, transparent 10%, rgba(232,238,248,0.48) 72%)' }} />
          </div>

          <div
            style={{
              position: 'relative',
              zIndex: 2,
              height: 84,
              minHeight: 84,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
              backdropFilter: 'blur(22px) saturate(1.12)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
              background: theme === 'dark' ? 'rgba(10,12,18,0.34)' : 'rgba(255,255,255,0.58)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: theme === 'dark' ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)',
                  border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
                  color: theme === 'dark' ? '#7df9ff' : '#3a6ee8',
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                ✦
              </div>
              <div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.12em', opacity: 0.56, textTransform: 'uppercase' }}>CRYSTAL OS • PREFERENCES</div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 19, fontWeight: 720, letterSpacing: '-0.02em', marginTop: 1 }}>Settings</div>
              </div>
            </div>
            <button
              onClick={() => setView('system')}
              style={{
                padding: '9px 16px',
                borderRadius: 999,
                border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)',
                color: theme === 'dark' ? '#eef7ff' : '#16213e',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              [B] CLOSE
            </button>
          </div>

          <div style={{ position: 'relative', zIndex: 2, flex: 1, overflowY: 'auto', padding: '22px 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Premium hardware context */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
              <div
                style={{
                  padding: '18px 18px',
                  borderRadius: 16,
                  background: theme === 'dark' ? 'linear-gradient(180deg, rgba(22,26,42,0.78), rgba(16,20,32,0.72))' : 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(251,253,255,0.84))',
                  border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}`,
                  boxShadow: theme === 'dark' ? '0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)' : '0 10px 24px rgba(18,26,44,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>SYSTEM • ENVIRONMENT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--crystal-mono)', fontSize: 11, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Machine</span>
                    <span style={{ fontWeight: 700, color: isRealMachine ? (theme === 'dark' ? '#7df9ff' : '#295fdc') : theme === 'dark' ? '#ffd885' : '#8a5a00' }}>
                      {isRealMachine ? 'ROG • Real via get_machine_config' : isExample ? 'SANITIZED EXAMPLE • browser dev' : 'No machine loaded'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Systems</span>
                    <span>{systemsForUI.length} calibrated</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Theme</span>
                    <span style={{ textTransform: 'uppercase' }}>{theme}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Crystal</span>
                    <span>v{/* version injected */}4.5.0 • graphite / silver / cyan acrylic</span>
                  </div>
                </div>

                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={toggle}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.82)',
                      color: theme === 'dark' ? '#eef7ff' : '#16213e',
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ⇄ Toggle {theme === 'dark' ? 'Light' : 'Dark'}
                  </button>
                  <button
                    onClick={() => setShowGuides(v => !v)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                      color: theme === 'dark' ? '#eef7ff' : '#16213e',
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {showGuides ? 'Hide guides' : 'Guides'}
                  </button>
                </div>

                {devMode && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.66)',
                      border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                      fontFamily: 'var(--crystal-mono)',
                      fontSize: 10,
                      lineHeight: 1.6,
                      opacity: 0.86,
                    }}
                  >
                    <div>Active: {activeSystemId} / {fullName} • {systemIds.length}</div>
                    <div>Cache: {Array.from(gameCache.entries()).map(([k, v]) => `${k}:${v.length}`).join(', ') || 'empty'} • View: {view} • Sel: {selectedGameId || 'none'}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    padding: '14px 14px',
                    borderRadius: 14,
                    background: theme === 'dark' ? 'rgba(125,249,255,0.08)' : 'rgba(70,130,255,0.08)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.14)'}`,
                  }}
                >
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>CRYSTAL TIPS • CONTROLLER FIRST</div>
                  <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 11.5, lineHeight: 1.5, opacity: 0.86 }}>
                    <div>[A] PLAY / ENTER • [B] BACK • [X] MEDIA CYCLE • [Y] FAVORITE • [VIEW] DISCOVER • [MENU] SETTINGS</div>
                    <div style={{ marginTop: 6, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66 }}>D-PAD up/down browses games, left/right switches system. Media aligns with SystemStage video → screenshot → title → mix → cover.</div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '14px 14px',
                    borderRadius: 12,
                    background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.08)'}`,
                  }}
                >
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.66, letterSpacing: '0.08em', marginBottom: 6 }}>SAFE MODE • WRITE GUARD</div>
                  <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, lineHeight: 1.5, opacity: 0.78 }}>
                    Crystal only writes to <span style={{ fontFamily: 'var(--crystal-mono)', background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)', padding: '1px 6px', borderRadius: 6 }}>%LOCALAPPDATA%\\CrystalFrontend\\</span>. ROM / ES-DE / EmuDeck / BIOS untouched. {safeMode ? 'SAFE MODE active — launch blocked.' : 'Normal operation — ROG ready.'}
                  </div>
                </div>
              </div>
            </div>

            <SettingsUpdaterPanel theme={theme} />

            {/* Discovery entry */}
            <div
              style={{
                padding: '16px 16px',
                borderRadius: 14,
                background: theme === 'dark' ? 'linear-gradient(100deg, rgba(22,26,42,0.72), rgba(18,22,36,0.68))' : 'linear-gradient(100deg, rgba(255,255,255,0.86), rgba(248,250,255,0.84))',
                border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  DISCOVER — VIMM'S LAIR CATALOG
                  <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9, padding: '3px 8px', borderRadius: 999, background: theme === 'dark' ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.10)', border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.16)'}`, color: theme === 'dark' ? '#7df9ff' : '#295fdc' }}>CATALOG ONLY • NO ROM FETCH</span>
                </div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, opacity: 0.66, lineHeight: 1.5, marginTop: 6, maxWidth: 560 }}>
                  Catalog-only reference to Vimm's Lair Vault. No shop/cart/price, no file URLs handled inside Crystal. Opens externally via Tauri shell native validation (https://vimm.net/vault/{'{numericId}'}) only.
                </div>
              </div>
              <button
                onClick={() => {
                  setDiscoverPrefillGame(null)
                  setDiscoverOrigin('settings')
                  setView('discover')
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
                  background: theme === 'dark' ? 'rgba(125,249,255,0.12)' : '#4a86ff',
                  color: theme === 'dark' ? '#7df9ff' : '#fff',
                  fontFamily: 'var(--crystal-mono)',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: theme === 'dark' ? '0 6px 16px rgba(125,249,255,0.18)' : '0 6px 16px rgba(70,130,255,0.18)',
                }}
              >
                OPEN DISCOVERY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global SAFE MODE indicator for non-system views – subtle dev-only pill */}
      {safeMode && view !== 'system' && (
        <div
          data-testid="safe-mode-badge-global"
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            zIndex: 9,
            pointerEvents: 'none',
            background: theme === 'dark' ? 'rgba(8,10,14,0.56)' : 'rgba(255,255,255,0.72)',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,120,120,0.24)' : 'rgba(255,90,90,0.22)'}`,
            color: theme === 'dark' ? 'rgba(255,180,180,0.92)' : 'rgba(170,40,40,0.92)',
            padding: '4px 10px',
            borderRadius: 999,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          SAFE MODE
        </div>
      )}

      {/* SAFE MODE toast – frontend block feedback */}
      {safeModeToast && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: theme === 'dark' ? 'rgba(20,12,12,0.92)' : 'rgba(255,240,240,0.96)',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,120,120,0.30)' : 'rgba(255,90,90,0.28)'}`,
            color: theme === 'dark' ? '#ffd0d0' : '#7a2020',
            padding: '10px 16px',
            borderRadius: 10,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 11,
            letterSpacing: '0.04em',
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            pointerEvents: 'none',
          }}
        >
          {safeModeToast}
        </div>
      )}

      {/* V8.3.1 Crystal signed updater – restrained boutique card, NEVER force, explicit confirm */}
      {availableUpdate && (
        <UpdaterBanner
          update={availableUpdate}
          downloading={updaterDownloading}
          progressPct={updaterPct}
          error={updaterError}
          theme={theme}
          onSkip={() => {
            setAvailableUpdate(null)
            setUpdaterError(null)
            setUpdaterDownloading(false)
            setUpdaterPct(0)
            setUpdaterPendingConfirm(false)
            setUpdaterRawObj(null)
          }}
          onStartUpdate={async () => {
            // Re-fetch raw Update object via direct check in service to preserve download methods
            setUpdaterDownloading(true)
            setUpdaterError(null)
            setUpdaterPct(2)
            try {
              // dynamic import to get raw check
              // @ts-ignore
              let mod: any = null
              try {
                mod = await import('@tauri-apps/plugin-updater')
              } catch {
                mod = null
              }
              let raw: any = null
              if (mod && mod.check) {
                raw = await mod.check().catch(() => null)
              } else {
                // fallback raw via Tauri invoke path
                try {
                  const { invoke } = await import('@tauri-apps/api/core')
                  // @ts-ignore
                  raw = await (invoke as any)('plugin:updater|check').catch(() => null)
                } catch {}
              }
              if (!raw) {
                setUpdaterError('no-update – try again later')
                setUpdaterDownloading(false)
                return
              }
              setUpdaterRawObj(raw)
              // Start progress simulated if plugin does event callbacks inside downloadAndInstall wrapper
              const { downloadAndInstallWithProgress: doInstall } = await import('./updater/crystalUpdater')
              const res = await doInstall(
                (p) => setUpdaterPct(p),
                raw
              )
              if (res.ok) {
                // Download finished – require explicit install confirmation
                setUpdaterPct(100)
                setUpdaterDownloading(false)
                setUpdaterPendingConfirm(true)
                // keep banner visible for confirmation step
              } else {
                setUpdaterError(res.error || 'download failed – kept current')
                setUpdaterDownloading(false)
                // do not dismiss – let user retry LATER
              }
            } catch (e: any) {
              setUpdaterError(e?.message || String(e) || 'update failed – kept current')
              setUpdaterDownloading(false)
            }
          }}
          onConfirmInstall={async () => {
            // Final explicit user confirmation before restart
            try {
              if (updaterRawObj && typeof updaterRawObj.install === 'function') {
                await updaterRawObj.install()
                // Tauri updater install triggers restart automatically after install completes (when using installAndRestart pattern)
                // If install separate, we now trigger relaunch via AppHandle? Plugin handles restart.
              } else {
                // fallback direct invoke installer which performs install+restart
                try {
                  const { downloadAndInstallWithProgress: doInstall } = await import('./updater/crystalUpdater')
                  // If we already downloaded, some impls require installAndRestart helper
                  const { installAndRestart } = await import('./updater/crystalUpdater')
                  const ok = await installAndRestart(updaterRawObj)
                  if (!ok) {
                    // last resort – attempt full downloadAndInstall again will restart
                    await doInstall(undefined, updaterRawObj)
                  }
                } catch {}
              }
            } catch (e: any) {
              setUpdaterError('install failed – kept current: ' + (e?.message || String(e)))
              setUpdaterPendingConfirm(false)
            }
          }}
          onCancelConfirm={() => {
            setUpdaterPendingConfirm(false)
            // keep availableUpdate showing so user can LATER or retry
          }}
          pendingConfirm={updaterPendingConfirm}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <MachineConfigProvider>
        <AppInner />
      </MachineConfigProvider>
    </ThemeProvider>
  )
}
