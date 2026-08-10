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
import { getSystemMeta } from './presentation/systemMeta'
import { deriveSystemSummary, getRecent, getMostPlayed, getSurprise } from './presentation/systemSummary'
import { useSemanticInput } from './hooks/useSemanticInput'
import type { NavigationAction } from './input/types'
import { getTauriInvoker } from './runtime/tauri'
// V8.2 fixture DEV ONLY – isolated, never overwrites real Tauri truth – used for web QA screenshots
import { getFixtureGames, toGameEntry, fixtureMediaForGame, getFixtureSystems } from './dev/fixtures/goldenFixture'
import { isFixtureEnabled, isDevFixtureAllowed } from './dev/fixtures/fixtureMode'
// V8.3.1 signed updater – official Tauri v2 plugin – non-blocking startup check, restrained UI, manual Settings entry
import { checkForUpdate } from './updater/crystalUpdater'
import type { CrystalUpdateInfo } from './updater/crystalUpdater'
import { UpdaterBanner } from './components/UpdaterBanner'
import { SettingsUpdaterPanel } from './components/SettingsUpdaterPanel'

type View = 'system' | 'library' | 'allgames' | 'favorites' | 'recent' | 'settings'

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

  const populatedSystems = useMemo(() => {
    if (!config) return [] as MachineSystem[]
    return getPopulatedSystems(config) as MachineSystem[]
  }, [config])

  const systemsForUI = useMemo(() => {
    // V8.2 fixture DEV-only – merge fixture systems for web QA populated fidelity
    // Never overrides Tauri real machine truth alone; real machine still uses truth only,
    // but for browser dev with ?fixture=golden we inject gbc/ps2/gc (7 games each)
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
          }
        }
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
            // attempt fixture media for populated screenshot
            const fix = fixtureMediaForGame(game.id)
            if (fix) {
              if (curId !== mediaRequestIdRef.current) return
              // screenshot -> gameplay source (preserve layers)
              const regions = stageConfig.gameplayRegions
              if (regions && regions.length > 0 && fix.screenshot) {
                setSelectedGameplaySources([
                  { regionId: regions[0].id, url: fix.screenshot, mediaType: 'screenshot' as any },
                ])
              } else if (fix.cover) {
                const r0 = regions && regions[0]
                if (r0) setSelectedGameplaySources([{ regionId: r0.id, url: fix.cover, mediaType: 'screenshot' as any }])
              }
              if (fix.physical) setSelectedPhysicalUrl(fix.physical)
              setMediaResolving(false)
              return
            }
            setMediaResolving(false)
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
           // dual-screen truthful primary only
          const regions = stageConfig.gameplayRegions
          if (!regions || regions.length === 0) {
            setSelectedGameplaySources(undefined)
          } else if (regions.length === 1) {
            if (pick.primaryUrl && pick.primaryType !== 'none') {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: pick.primaryUrl!, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }])
            } else {
              setSelectedGameplaySources(undefined)
            }
          } else {
            if (pick.primaryUrl) {
              setSelectedGameplaySources([{ regionId: regions[0].id, url: pick.primaryUrl!, mediaType: pick.primaryType === 'video' ? 'video' : 'screenshot' }])
            } else {
              setSelectedGameplaySources(undefined)
            }
          }
        } catch {
          if (curId !== mediaRequestIdRef.current) return
          setSelectedGameplaySources(undefined)
          setSelectedPhysicalUrl(undefined)
        } finally {
          if (curId === mediaRequestIdRef.current) setMediaResolving(false)
        }
      }, 130) as unknown as number
    },
    [isRealMachine, stageConfig.gameplayRegions]
  )

  const onNav = useCallback(
    (action: NavigationAction) => {
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
        }
      } else if (view === 'library') {
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
      } else {
        if (action === 'back') setView('system')
      }
    },
    [view, systemIds, activeSystemId, activeGames, selectedGameEntry, config, safeMode]
  )

  // Effects – must be unconditional and before any early returns
  useEffect(() => {
    try {
      const qp = typeof window !== 'undefined' ? window.location.search : ''
      const ls = typeof window !== 'undefined' ? window.localStorage.getItem('crystal-dev') : null
      if (qp.includes('dev') || ls === '1') setDevMode(true)
    } catch {}
  }, [])

  // Fixture mode ?fixture=golden&system=gbc|ps2|gc&view=system|library&theme=light|dark (DEV only)
  useEffect(() => {
    try {
      const fm = isFixtureEnabled()
      if (!fm.enabled) return
      if (fm.systemId) {
        // default gbc but allow override
        setActiveSystemId(fm.systemId)
      }
      if (fm.view && (fm.view === 'system' || fm.view === 'library')) {
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

      {(view === 'allgames' || view === 'favorites' || view === 'recent') && (
        <div style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? '#0a0a0f' : '#f4f6fb', zIndex: 6, overflowY: 'auto', padding: '22px 22px', pointerEvents: 'auto', color: theme === 'dark' ? '#eef7ff' : '#16213e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--crystal-display)', fontWeight: 500 }}>
              {view === 'allgames' ? 'All Games' : view === 'favorites' ? 'Favorites' : 'Recently Played'} {collectionGames ? `• ${collectionGames.length}` : ''}
            </h2>
            <button
              onClick={() => setView('system')}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', color: theme === 'dark' ? '#eef7ff' : '#16213e' }}
            >
              Back
            </button>
          </div>
          {collectionLoading && <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--crystal-mono)' }}>Loading…</div>}
          {collectionError && <div style={{ fontSize: 11, color: '#ff7b7b' }}>{collectionError}</div>}
          {!collectionLoading && !collectionError && collectionGames && collectionGames.length === 0 && (
            <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--crystal-mono)' }}>No games – real Tauri runtime shows real library only. No fake data.</div>
          )}
          {!collectionLoading && collectionGames && collectionGames.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {collectionGames.map(g => (
                <div key={g.id} onClick={() => handleLaunchGame(g)} style={{ padding: '8px 12px', borderRadius: 8, background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{g.name} <span style={{ opacity: 0.6, fontSize: 10 }}>({g.system_id})</span></div>
                    <div style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--crystal-mono)' }}>{g.rom_basename}{g.extension}</div>
                  </div>
                  <span style={{ fontSize: 10, opacity: 0.6 }}>↗</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'settings' && (
        <div style={{ position: 'absolute', inset: 0, padding: '22px 22px', background: theme === 'dark' ? '#0a0a0f' : '#f4f6fb', zIndex: 6, pointerEvents: 'auto', color: theme === 'dark' ? '#eef7ff' : '#16213e', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--crystal-display)', fontWeight: 500 }}>Settings</h2>
            <button
              onClick={() => setView('system')}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', color: theme === 'dark' ? '#eef7ff' : '#16213e' }}
            >
              Close
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8, lineHeight: 1.6, fontFamily: 'var(--crystal-mono)' }}>
            <div>Machine: {isRealMachine ? 'Real – machine-local via get_machine_config (Tauri)' : isExample ? 'SANITIZED EXAMPLE – browser dev' : 'No machine loaded'}</div>
            <div>Systems: {systemsForUI.length}</div>
            <div>Theme: {theme}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={toggle}
                style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', color: theme === 'dark' ? '#eef7ff' : '#16213e', fontSize: 11 }}
              >
                Toggle {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
              <button
                onClick={() => setShowGuides(v => !v)}
                style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`, background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', color: theme === 'dark' ? '#eef7ff' : '#16213e', fontSize: 11 }}
              >
                {showGuides ? 'Hide guides' : 'Guides'}
              </button>
            </div>
            {devMode && (
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.66)', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`, fontSize: 11 }}>
                <div>Active system: {activeSystemId} / {fullName}</div>
                <div>Cache sizes: {Array.from(gameCache.entries()).map(([k, v]) => `${k}:${v.length}`).join(', ') || 'empty'}</div>
                <div>View: {view}</div>
                <div>Selected game: {selectedGameId || 'none'}</div>
              </div>
            )}
          </div>
          <SettingsUpdaterPanel theme={theme} />
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
