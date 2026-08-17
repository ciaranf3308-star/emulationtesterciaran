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
import { dedupeLibraryGames } from './lib/dedupeLibraryGames'
import { listGames, listAllGames, getFavorites, getRecentlyPlayed, verifyMedia, invokeBackend } from './runtime/backend'
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
// V3 crash & lifecycle
import { setupCrashHandlers, setCrashContext, recordSemanticInput } from './lib/crashReporter'
import { setupLifecycleHandlers } from './controllers/lifecycle'
// V8.2 fixture DEV ONLY – isolated, never overwrites real Tauri truth – used for web QA screenshots
import { getFixtureGames, toGameEntry, fixtureMediaForGame, getFixtureSystems } from './dev/fixtures/goldenFixture'
import { isFixtureEnabled, isDevFixtureAllowed } from './dev/fixtures/fixtureMode'
import { useCrystalAcquisition } from './acquisition/useCrystalAcquisition'
import { useProviderSurface } from './acquisition/useProviderSurface'
import AcquisitionStatusCard from './acquisition/AcquisitionStatusCard'
import { acquisitionOwnsConfirm } from './acquisition/inputOwnership'
import ProviderSurfaceView from './components/ProviderSurfaceView'
import { buildCanonicalDetailUrl as buildRomsFunCanonicalForBegin } from './discovery/providers/romsfun/romsfunRoutes'
// V8.3.1 signed updater – official Tauri v2 plugin – non-blocking startup check, restrained UI, manual Settings entry
import { checkForUpdate } from './updater/crystalUpdater'
import type { CrystalUpdateInfo } from './updater/crystalUpdater'
import { UpdaterBanner } from './components/UpdaterBanner'

import DiscoverView from './components/DiscoverView'
import { RESTORED_FLAG_KEY, saveLocalNav, type CrystalNavPersist } from './lifecycle/launchCycle'
import { SettingsTabsView } from './components/SettingsTabsView'
import { DiagnosticsDebugOverlay } from './components/DiagnosticsDebugOverlay'


type View = 'system' | 'library' | 'allgames' | 'favorites' | 'recent' | 'settings' | 'discover'

type LibraryQuickFilter = 'all' | 'fav' | 'recent' | 'unplayed'

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
    const text = String(raw).trim()
    const esde = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
    const ms = esde
      ? new Date(
          Number(esde[1]), Number(esde[2]) - 1, Number(esde[3]),
          Number(esde[4]), Number(esde[5]), Number(esde[6]),
        ).getTime()
      : Date.parse(text)
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
  return 'played previously'
}

function AppInner() {
  const { config, isRealMachine, loading: machineLoading, error: machineError, validationErrors, blockingError } = useMachineConfig() as any
  const { theme, toggle, manifest, resolver, manifestLoading } = useThemeAssets()

  const [activeSystemId, setActiveSystemId] = useState<string>('ps2')
  const [view, setView] = useState<View>('system')
  const [showGuides, setShowGuides] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [safeMode, setSafeMode] = useState(false)
  const [safeModeToast, setSafeModeToast] = useState<string | null>(null)
  const [dedupToast, setDedupToast] = useState<string | null>(null)
  const [libraryChipFocused, setLibraryChipFocused] = useState(false)
  const [diagnosticsDebugOverlayVisible, setDiagnosticsDebugOverlayVisible] = useState(false)
  const [libraryFilter, setLibraryFilter] = useState<LibraryQuickFilter>('all')

  // V3: crash + lifecycle orchestration
  useEffect(() => {
    const unsubCrash = setupCrashHandlers()
    // attempt to write bounded logs on unmount? nothing else
    const unsubLife = setupLifecycleHandlers({
      onSuspend: () => {
        // pause videos/animation handled via CSS class crystal-background-suspended
        try { document.documentElement.classList.add('crystal-background-suspended') } catch {}
      },
      onResume: () => {
        try { document.documentElement.classList.remove('crystal-background-suspended') } catch {}
      },
    })
    return () => {
      unsubCrash()
      unsubLife()
    }
  }, [])

  // Pillar 1 – Navigation & Restore: spatial memory + instant restore + cinematic bridge state
  const [instantRestoring, setInstantRestoring] = useState<{ active: boolean; systemId?: string } | null>(null)
  const [isRestoredBoot, setIsRestoredBoot] = useState<boolean>(false)
  const navDebounceRef = useRef<number | null>(null)
  const lastNavPersistRef = useRef<CrystalNavPersist | null>(null)

  // V8.7 + Pillar 1 – restore on mount (fullscreen/focus/context return journey)
  // Extended: spatial memory, instant optimistic restore <5min, cinematic fade-in, localStorage fallback
  useEffect(() => {
    let cancelled = false
    async function tryRestore() {
      try {
        const mod = await import('./lifecycle/launchCycle')

        // Detect --crystal-restored arg or localStorage flag for cinematic in
        let flaggedRestored = false
        try {
          const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
          if (sp.has('crystal-restored') || sp.get('restored') === '1') flaggedRestored = true
        } catch {}
        try {
          if (typeof window !== 'undefined' && window.localStorage.getItem(RESTORED_FLAG_KEY)) {
            flaggedRestored = true
          }
        } catch {}
        // Also check for Tauri args containing --crystal-restored via invoke if possible
        try {
          if (isTauriEnvironment()) {
            // backend already logged restored_boot flag at startup; we treat presence of restore.json as restored
          }
        } catch {}

        if (flaggedRestored) {
          setIsRestoredBoot(true)
          // Trigger cinematic in class on documentElement
          try {
            document.documentElement.classList.add('crystal-emulator-transitioning-in')
            // Remove after animation to clean up
            window.setTimeout(() => {
              try { document.documentElement.classList.remove('crystal-emulator-transitioning-in') } catch {}
              try { window.localStorage.removeItem(RESTORED_FLAG_KEY) } catch {}
            }, 600)
          } catch {}
        }

        const state = await mod.getRestoreState().catch(() => null)
        if (cancelled) return

        // Pillar 1 – attempt localStorage fallback regardless of Tauri restore presence
        const localNav = mod.loadLocalNav()

        if (!state) {
          // No backend restore – fallback to localStorage crystal:nav
          if (localNav && localNav.ts && (Date.now() - localNav.ts) < 5 * 60 * 1000) {
            if (localNav.systemId) setActiveSystemId(localNav.systemId)
            if (localNav.view && ['system','library','discover','settings','allgames','favorites','recent'].includes(localNav.view)) {
              setView(localNav.view as any)
            }
            // If gameIndex present, optimistic select later when activeGames populated – handled downstream
            console.info('[nav] fallback localStorage restore', localNav)
          }
          setInstantRestoring(null)
          return
        }

        // Must be recent (<5 min) and bounded – backend already validates sympathy
        if (!mod.isRestoreRecent(state as any, 300)) {
          // stale – clear to avoid loop
          try { await mod.clearRestoreState() } catch {}
          // Still attempt local fallback
          if (localNav && localNav.ts && (Date.now() - localNav.ts) < 5 * 60 * 1000) {
            if (localNav.systemId) setActiveSystemId(localNav.systemId)
            if (localNav.view) setView(localNav.view as any)
          }
          setInstantRestoring(null)
          return
        }

        console.info('[lifecycle] restore_state recent', state.system_id, state.rom_basename, 'view', (state as any).view, 'sysIdx', (state as any).last_system_index, 'gameIdx', (state as any).game_index)

        // Instant restore – optimistic before enumeration finishes
        setInstantRestoring({ active: true, systemId: state.system_id })

        // Restore previous system where practical
        let targetSystemId = state.system_id
        if ((state as any).last_system_index != null) {
          // last_system_index is advisory; system_id authoritative
          targetSystemId = state.system_id
        }
        if (targetSystemId) {
          setActiveSystemId(targetSystemId)
        }

        // Restore view – library|systems|discover|settings|downloads – map downloads->settings as safe fallback
        const restoreViewRaw = (state as any).view as string | undefined
        if (restoreViewRaw) {
          const norm = restoreViewRaw.toLowerCase()
          if (['library','discover','settings','system','systems','allgames','favorites','recent'].includes(norm)) {
            const mapped: any = norm === 'systems' ? 'system' : norm === 'system' ? 'system' : norm
            setView(mapped as any)
          } else if (norm === 'downloads') {
            setView('settings') // Downloads inbox lives in Settings
          }
        } else {
          setView('library')
        }

        // Restore previous selected game where practical – defer until gameCache populated; we can attempt via id = system:basename
        const plausibleId = `${state.system_id}:${state.rom_basename}`
        try {
          setSelectedGameId(plausibleId)
        } catch {}

        // If spatial memory game_index present and local scroll index present, we can later scroll browser
        // Persist to localStorage for current session
        try {
          const merged: CrystalNavPersist = {
            view: restoreViewRaw || 'library',
            systemId: targetSystemId,
            systemIndex: (state as any).last_system_index ?? undefined,
            gameIndex: (state as any).game_index ?? undefined,
            scrollIndex: (state as any).scroll_index ?? undefined,
            restored: true,
            ts: Date.now(),
          }
          mod.saveLocalNav(merged)
        } catch {}

        // recover focus – dispatcher will handle controller focus via autofocus of LibraryView
        try {
          window.dispatchEvent(new CustomEvent('crystal:restored' as any, { detail: state }))
        } catch {}

        // finally clear to avoid loop – small delay so optimistic nav seen
        // keep restore file until after optimistic nav is applied? spec says clear after restore to avoid loop – we do after 800ms
        window.setTimeout(() => {
          mod.clearRestoreState().catch(() => {})
          setInstantRestoring(null)
        }, 650)

        // fullscreen – Tauri window should already be fullscreen, but ensure focus
        try {
          const tauriWin = (window as any).__TAURI__?.window?.getCurrentWindow?.()
          if (tauriWin?.setFocus) await tauriWin.setFocus().catch(() => {})
        } catch {}
      } catch {
        setInstantRestoring(null)
      }
    }
    // delay slightly to allow machine config to load – 500ms mirrors previous behavior
    const t = window.setTimeout(tryRestore, 500)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [])

  const [gameCache, setGameCache] = useState<Map<string, GameEntry[]>>(() => new Map())
  const [cacheLoading, setCacheLoading] = useState<Set<string>>(() => new Set())
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedGameplaySources, setSelectedGameplaySources] = useState<GameplaySource[] | undefined>(undefined)
  const [selectedPhysicalUrl, setSelectedPhysicalUrl] = useState<string | undefined>(undefined)
  const [gameIdentityMedia, setGameIdentityMedia] = useState<Record<string, { cover?: string; marquee?: string }>>({})
  const [mediaResolving, setMediaResolving] = useState(false)
  const mediaRequestIdRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  const launchInFlightRef = useRef(false)
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

  // V8.6D1 – Provider surface primary (in-app ROMsFun child webview → browser download capture)
  const providerSurf = useProviderSurface({
    refreshLibrary: async (sid: string) => {
      if (!isTauriEnvironment() || !isRealMachine) {
        const cached = gameCache.get(sid)
        if (cached) return cached
        return []
      }
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

  const handleBeginProviderAcquisition = useCallback(async (req: any) => {
    // req from DiscoverView: { systemId, expectedTitle, providerId?, initialUrl?, openExternalPage }
    // Primary Plan C: do NOT open Edge/shell.open, do NOT use fallback watcher, use in-app provider surface
    try {
      let canonical: string | null = null
      const pid = (req.providerId || '').trim()
      if (pid) {
        // pid may be slug roms/<system>/title or system/slug etc
        try {
          // If pid looks like full slug with roms/ prefix
          if (pid.startsWith('roms/')) {
            const stripped = pid.replace(/^roms\//, '')
            canonical = buildRomsFunCanonicalForBegin(stripped)
          } else if (pid.includes('/')) {
            canonical = buildRomsFunCanonicalForBegin(pid)
          } else if (/^\d+$/.test(pid)) {
            // legacy Vimm numeric – dormant path, but if triggered via romsfun provider this should not happen
            // For safety keep dormant: we don't open romsfun via numeric, reject
            throw new Error(`Numeric provider id '${pid}' not valid for ROMsFun primary – Vimm dormant`)
          } else {
            canonical = buildRomsFunCanonicalForBegin(pid)
          }
        } catch (e: any) {
          // If construction fails, try initialUrl if provided and validated as romsfun
          if (req.initialUrl && typeof req.initialUrl === 'string') {
            try {
              const u = new URL(req.initialUrl)
              if (u.hostname === 'romsfun.com' || u.hostname === 'www.romsfun.com') {
                canonical = req.initialUrl
              }
            } catch {}
          }
          if (!canonical) throw e
        }
      } else if (req.initialUrl) {
        canonical = req.initialUrl
      }

      if (!canonical) {
        console.error('[D1] provider surface begin – no canonical URL could be built', req)
        return
      }

      // Block galaxylanes explicitly – do NOT allowlist
      try {
        const u = new URL(canonical)
        if (u.hostname.toLowerCase().includes('galaxylanesandgames.com')) {
          console.error('[D1] blocked – galaxylanes URL not allowed', canonical)
          return
        }
      } catch {}

      await providerSurf.begin({
        systemId: req.systemId,
        expectedTitle: req.expectedTitle,
        initialUrl: canonical,
      })
    } catch (e: any) {
      console.error('[D1] provider surface begin failed', e)
      // fallback to legacy if needed? primary flow must NOT open Edge – we keep legacy intact but not call it automatically
    }
  }, [providerSurf])
  // Kept as an explicit fallback; external browser + Downloads watcher is primary.
  void handleBeginProviderAcquisition

  // Expose generic entry – DEV ONLY – production Tauri build must NOT expose window globals
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (!isDevFixtureAllowed()) {
        // ensure prod does not leak dev hooks
        try { delete (window as any).__beginCrystalAcquisition } catch {}
        try { delete (window as any).__crystalAcquisition } catch {}
        try { delete (window as any).__beginProviderSurface } catch {}
        try { delete (window as any).__providerSurface } catch {}
        return
      }
      ;(window as any).__beginCrystalAcquisition = (req: any) => crystalAcq.begin(req)
      ;(window as any).__crystalAcquisition = crystalAcq
      ;(window as any).__beginProviderSurface = (req: any) => providerSurf.begin(req)
      ;(window as any).__providerSurface = providerSurf
    } catch {}
  }, [crystalAcq, providerSurf])



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
    return dedupeLibraryGames(gameCache.get(activeSystemId) || [])
  }, [gameCache, activeSystemId])

  // Smart filter chips: All / Favorites / Recent / Unplayed – filtering logic reusable for LibraryView
  const parseLastPlayedMs = useCallback((g: any): number | null => {
    const raw = g?.last_played ?? g?.lastplayed ?? null
    if (!raw) return null
    const text = String(raw).trim()
    const esde = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
    if (esde) {
      const d = new Date(Number(esde[1]), Number(esde[2]) - 1, Number(esde[3]), Number(esde[4]), Number(esde[5]), Number(esde[6]))
      return d.getTime() || null
    }
    const ms = Date.parse(text)
    return isNaN(ms) ? null : ms
  }, [])

  const filteredActiveGames = useMemo(() => {
    if (view !== 'library') return activeGames
    const filter = libraryFilter
    if (filter === 'all') return activeGames
    if (filter === 'fav') return activeGames.filter((g: any) => !!(g as any).favorite)
    if (filter === 'recent') {
      // sort descending by last_played where exists
      const withPlay = activeGames
        .map(g => ({ g, ms: parseLastPlayedMs(g as any) }))
        .filter(x => x.ms != null)
        .sort((a, b) => (b.ms! - a.ms!))
        .map(x => x.g)
      return withPlay as any
    }
    if (filter === 'unplayed') {
      return activeGames.filter((g: any) => {
        const pc = (g as any).play_count ?? (g as any).playcount ?? null
        if (pc != null && Number(pc) > 0) return false
        if (parseLastPlayedMs(g as any) != null) return false
        const pt = (g as any).playtime
        if (pt != null && Number(pt) > 0) return false
        return true
      })
    }
    return activeGames
  }, [activeGames, view, libraryFilter, parseLastPlayedMs])

  const continuePlayingGames = useMemo(() => {
    // Continue Playing row: top 3-5 sorted descending where last_played exists
    const sorted = activeGames
      .map((g: any) => ({ g, ms: parseLastPlayedMs(g) }))
      .filter((x: any) => x.ms != null)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((x: any) => x.g)
    return sorted as GameEntry[]
  }, [activeGames, parseLastPlayedMs])

  const isLibraryEmptyDriveState = useMemo(() => {
    if (view !== 'library') return false
    if (activeGames.length > 0) return false
    // If cache has no games for this system and we are on real machine with D drive path, treat as unplugged empty
    try {
      const romRoot = (config as any)?.roots?.rom || ''
      if (typeof romRoot === 'string' && romRoot.toUpperCase().startsWith('D:')) {
        return true // heuristic: real ROG Ally X library lives on D:\Emulation\roms
      }
    } catch {}
    // In web preview where no games enumerated but config null, still show empty hint after load settled
    const cached = gameCache.get(activeSystemId)
    if (cached && cached.length === 0) return true
    if (!config && !machineLoading) {
      // If no Tauri and no fixture, consider empty as drive missing illustration
      return activeGames.length === 0
    }
    return false
  }, [view, activeGames, config, gameCache, activeSystemId, machineLoading])

  const summary = useMemo(() => {
    if (!activeGames.length) return { total: 0, favoriteCount: 0, continuePlaying: undefined, recent: undefined, mostPlayed: undefined, surprise: undefined } as any
    return deriveSystemSummary(activeGames as any)
  }, [activeGames])

  const displayGames = useMemo(() => {
    if (view === 'library') return filteredActiveGames
    return activeGames
  }, [view, filteredActiveGames, activeGames])

  const selectedIndex = useMemo(() => {
    const src = displayGames
    if (!src.length) return -1
    if (!selectedGameId) return 0
    const i = src.findIndex(g => g.id === selectedGameId)
    return i >= 0 ? i : 0
  }, [displayGames, selectedGameId])

  const selectedGameEntry = useMemo(() => {
    if (!displayGames.length) return null
    if (selectedIndex >= 0 && selectedIndex < displayGames.length) return displayGames[selectedIndex]
    return displayGames[0] ?? null
  }, [displayGames, selectedIndex])

  // Pillar 1 – Spatial memory persistence: Systems carousel index + Library game index + scroll
  // Captures last_system_index on left/right, game_index+scroll debounced 500ms, writes localStorage & restore.json
  useEffect(() => {
    // Resolve system carousel index
    let sysIdx: number | undefined = undefined
    try {
      const sysIds = populatedSystems.map(s => s.id)
      sysIdx = sysIds.indexOf(activeSystemId)
      if (sysIdx < 0) sysIdx = undefined
    } catch {}

    const gameIdx = selectedIndex >= 0 ? selectedIndex : undefined

    // Read scroll – LibraryView exposes #crystal-library-scroll container
    let scrollIdx: number | undefined = undefined
    try {
      const candidates = [
        document.querySelector('[data-crystal-library-scroll]') as HTMLElement | null,
        document.querySelector('.library-left') as HTMLElement | null,
        document.querySelector('.game-browser-list') as HTMLElement | null,
        document.querySelector('.library-details') as HTMLElement | null,
      ].filter(Boolean) as HTMLElement[]
      for (const sc of candidates) {
        if (sc && sc.scrollTop > 0) { scrollIdx = Math.round(sc.scrollTop); break }
        if (sc) { scrollIdx = Math.round(sc.scrollTop); break }
      }
    } catch {}

    const nav: CrystalNavPersist = {
      view,
      systemId: activeSystemId,
      systemIndex: sysIdx,
      gameIndex: gameIdx,
      scrollIndex: scrollIdx,
      ts: Date.now(),
    }

    // Avoid writing duplicate nav quickly
    const last = lastNavPersistRef.current
    if (last && last.view === nav.view && last.systemId === nav.systemId && last.gameIndex === nav.gameIndex && last.systemIndex === nav.systemIndex) {
      // Still update timestamp for scroll – allow small scroll delta
      if (typeof nav.scrollIndex === 'number' && typeof last.scrollIndex === 'number' && Math.abs(nav.scrollIndex - last.scrollIndex) < 24) {
        return
      }
    }
    lastNavPersistRef.current = nav

    // Always localStorage – cheap, controller-safe
    try { saveLocalNav(nav) } catch {}

    // Debounce Tauri save_launch_restore_state (500ms) with extended nav fields
    // Only when we have a valid ROM-ish payload OR we want spatial-only restore
    try {
      if (navDebounceRef.current != null) { window.clearTimeout(navDebounceRef.current) }
      navDebounceRef.current = window.setTimeout(async () => {
        try {
          if (!isTauriEnvironment()) return
          // When library entry present, use its rom path/basename
          let romPath = (selectedGameEntry as any)?.path ?? (selectedGameEntry as any)?.rom_path ?? `${activeSystemId}/_nav`
          let romBasename = (selectedGameEntry as any)?.basename ?? (selectedGameEntry as any)?.rom_basename ?? (selectedGameEntry as any)?.name ?? `_spatial_${activeSystemId}`
          // Sanitize basename for validation (no / \ :)
          romBasename = String(romBasename).replace(/[\\/:]/g, '_').slice(0,120) || `_spatial_${activeSystemId}`

          const mod = await import('./lifecycle/launchCycle')
          await mod.saveRestoreState(activeSystemId, String(romPath), String(romBasename), {
            scroll_index: typeof scrollIdx === 'number' ? scrollIdx : null,
            view: view === 'system' ? 'systems' : view,
            game_index: typeof gameIdx === 'number' ? gameIdx : null,
            last_system_index: typeof sysIdx === 'number' ? sysIdx : null,
          }).catch(() => {})
        } catch {}
      }, 500) as any
    } catch {}
  }, [activeSystemId, view, selectedIndex, populatedSystems, selectedGameEntry])

  // Instant restore – re-apply scroll position after library populated with spatial scroll_index
  useEffect(() => {
    if (!instantRestoring?.active) return
    if (!activeGames.length) return
    try {
      import('./lifecycle/launchCycle').then(mod => {
        const nav = mod.loadLocalNav()
        if (!nav) return
        const scrollTarget = (nav.scrollIndex ?? (nav as any).scroll_top) as number | undefined
        if (typeof scrollTarget === 'number' && scrollTarget > 0) {
          const sc = (document.querySelector('[data-crystal-library-scroll]') || document.querySelector('.library-left') || document.querySelector('.game-browser-list')) as HTMLElement | null
          if (sc) {
            sc.scrollTop = scrollTarget
          }
        }
        // If gameIndex stored, ensure selection matches
        if (typeof nav.gameIndex === 'number' && activeGames[nav.gameIndex]) {
          const target = activeGames[nav.gameIndex]
          if (target && target.id !== selectedGameId) {
            setSelectedGameId(target.id)
          }
        }
      }).catch(() => {})
    } catch {}
  }, [instantRestoring, activeGames, selectedGameId])

  const carouselGames: CarouselGame[] = useMemo(() => {
    return displayGames.slice(0, 200).map(g => {
      const anyG = g as any
      const fixCover = anyG._fixtureCoverUrl || null
      const fixMedia = fixtureMediaForGame(g.id)
      return { id: g.id, name: g.name, coverUrl: fixCover || fixMedia?.cover || gameIdentityMedia[g.id]?.cover || null }
    })
  }, [displayGames, gameIdentityMedia])

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
    Promise.all(displayGames.slice(0, 200).map(async game => {
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
  }, [displayGames])

  // Dedup trust toast: listen for dedupeLibraryGames event when duplicates removed
  useEffect(() => {
    const onDedup = (e: any) => {
      const detail = e?.detail || {}
      const count = Number(detail.removed || 0)
      if (count <= 0) return
      setDedupToast(`Cleaned ${count} duplicate${count === 1 ? '' : 's'}`)
      window.setTimeout(() => setDedupToast(null), 3000)
    }
    window.addEventListener('crystal:dedup-cleaned' as any, onDedup)
    return () => window.removeEventListener('crystal:dedup-cleaned' as any, onDedup)
  }, [])

  // After return from emulator – refresh metadata (real playtime) – lifecycle restore handling
  useEffect(() => {
    const onRestored = async (e: any) => {
      try {
        const detail = e?.detail || {}
        const sysId = detail.system_id || activeSystemId
        if (!sysId) return
        // Refresh gamelist metadata via backend – real playtime surfaces in LibraryView details + Continue Playing row
        try {
          const fresh = await listGames(sysId)
          setGameCache(prev => {
            const m = new Map(prev)
            m.set(sysId, fresh)
            return m
          })
        } catch {}
        // Also call Rust refresh_metadata_after_launch for logging / play stats count if Tauri
        if (isTauriEnvironment()) {
          try {
            await invokeBackend('refresh_metadata_after_launch', { system_id: sysId })
          } catch {}
          try {
            const favs = await getFavorites().catch(() => [] as any)
            // Merge favorites into cache optimistic if needed – fav flag already in gamelist
            if (favs && Array.isArray(favs)) {
              // optional: update cache favorites flags from favs list if present
            }
          } catch {}
        }
        setSafeModeToast('Library refreshed after play')
        window.setTimeout(() => setSafeModeToast(null), 2000)
      } catch {}
    }
    window.addEventListener('crystal:restored' as any, onRestored)
    // Also listen to Tauri window focus (return from emulator foreground restore)
    let unlistenFocus: (() => void) | null = null
    try {
      if (isTauriEnvironment()) {
        const tauriWindow = (window as any).__TAURI__?.window
        if (tauriWindow?.getCurrentWindow) {
          const cur = tauriWindow.getCurrentWindow()
          cur?.onFocusChanged?.((ev: any) => {
            if (ev?.payload) {
              // window gained focus after emulator exit – trigger refresh
              onRestored({ detail: { system_id: activeSystemId } })
            }
          }).then((un: any) => { unlistenFocus = un }).catch(() => {})
        }
      }
    } catch {}
    return () => {
      window.removeEventListener('crystal:restored' as any, onRestored)
      try { if (unlistenFocus) unlistenFocus() } catch {}
    }
  }, [activeSystemId])

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
        coverUrl: anyG._fixtureCoverUrl || fix?.cover || gameIdentityMedia[g.id]?.cover || null,
        marqueeUrl: anyG._fixtureLogoUrl || fix?.marquee || gameIdentityMedia[g.id]?.marquee || null,
        lastPlayedLabel: lastPlayedLabel(g) || undefined,
        metricLabel: (() => {
          const pc = parsePlayCount(g)
          if (pc != null && pc > 0) return `${pc} plays`
          const lp = lastPlayedLabel(g)
          return lp || undefined
        })(),
      }
    },
    [gameIdentityMedia]
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
      if (launchInFlightRef.current) return
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
      if (req.ok === false) {
        console.error('[launch] request rejected:', req.reason)
        setSafeModeToast(`LAUNCH FAILED • ${req.reason}`)
        setTimeout(() => setSafeModeToast(null), 5000)
        return
      }
      // V3 P0 Steam – never through generic shell; route via safe_steam_launch
      try {
        const sysIdLc = (game.system_id || '').toLowerCase()
        const tmpl = (req as any).backendRequest?.commandTemplate || ''
        const romLc = (game.rom_path || '').toLowerCase()
        const isSteamLike = sysIdLc === 'steam' || /OS-?SHELL/i.test(tmpl) || romLc.startsWith('steam://')
        if (isSteamLike) {
          // Set crash context with basename only
          try { const base = (game.rom_path||'').split(/[\\/]/).pop(); setCrashContext('library', sysIdLc || 'steam'); recordSemanticInput(`LAUNCH ${sysIdLc} ${base}`) } catch {}
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('safe_steam_launch', { romPath: game.rom_path })
          setSafeModeToast(`LAUNCHED • ${game.name} (Steam)`)
          setTimeout(() => setSafeModeToast(null), 1800)
          setTimeout(() => { launchInFlightRef.current = false }, 800)
          return
        }
      } catch (e: any) {
        const msg = e?.message || String(e)
        console.error('[steam-launch] failed, falling back?', msg)
        if (msg.includes('STEAM_') || msg.includes('SAFE_MODE')) {
          setSafeModeToast(`STEAM LAUNCH FAILED • ${msg.slice(0,80)}`)
          setTimeout(() => setSafeModeToast(null), 4000)
          launchInFlightRef.current = false
          return
        }
        // otherwise fall through to normal path? but for steam we should not fallback to arbitrary shell
        setSafeModeToast(`STEAM LAUNCH BLOCKED • ${msg.slice(0,80)}`)
        setTimeout(() => setSafeModeToast(null), 4000)
        launchInFlightRef.current = false
        return
      }
      launchInFlightRef.current = true

      // Pillar 1 – spatial memory: persist final selection before launch (immediate, not debounced)
      try {
        const mod = await import('./lifecycle/launchCycle')
        const scrollIdx = (() => {
          try {
            const sc = (document.querySelector('[data-crystal-library-scroll]') || document.querySelector('.library-left') || document.querySelector('.game-browser-list')) as HTMLElement | null
            return sc ? Math.round(sc.scrollTop) : null
          } catch { return null }
        })()
        const systemIdx = (() => {
          try { return populatedSystems.findIndex(s => s.id === game.system_id) } catch { return -1 }
        })()
        const gameIdx = (() => {
          try { return activeGames.findIndex(g => g.id === (game as any).id) } catch { return -1 }
        })()
        await mod.saveRestoreState(game.system_id, game.rom_path, String((game as any).basename || game.name), {
          scroll_index: scrollIdx,
          view: 'library',
          game_index: gameIdx >= 0 ? gameIdx : null,
          last_system_index: systemIdx >= 0 ? systemIdx : null,
        }).catch(() => {})
        try { mod.saveLocalNav({ view: 'library', systemId: game.system_id, systemIndex: systemIdx >=0?systemIdx:undefined, gameIndex: gameIdx>=0?gameIdx:undefined, scrollIndex: scrollIdx ?? undefined, ts: Date.now() }) } catch {}
        // Flag for restored boot in-animation next launch
        try { if (typeof window !== 'undefined') window.localStorage.setItem(RESTORED_FLAG_KEY, '1') } catch {}
      } catch {}

      // Pillar 1 – Cinematic fade-out → then handoff
      const triggerCinematicOut = async () => {
        try {
          document.documentElement.classList.add('crystal-emulator-transitioning-out')
          await new Promise<void>(res => setTimeout(res, 380)) // match --crystal-fade-out
        } catch { /* ignore */ }
      }

      // Attempt V8.7 handoff path first (watcher BEFORE exit) – this was disabled in legacy branch
      // We re-enable for ROG FIRST-BOOT verification but keep fallback to resident launch
      try {
        await triggerCinematicOut()
        const { launchWithHandoff, runPreExitCleanup, exitAfterHandoff } = await import('./lifecycle/launchCycle')
        const handoff = await launchWithHandoff(req.backendRequest)
        if (!handoff || !handoff.pid) throw new Error('Handoff missing pid')
        runPreExitCleanup((typeof providerSurf !== 'undefined' ? providerSurf : null) as any, (typeof crystalAcq !== 'undefined' ? crystalAcq : null) as any)
        console.info('[lifecycle] handoff_ready pid=', handoff.pid, 'session=', handoff.session_id, '-> exiting Crystal (cinematic)')
        await exitAfterHandoff().catch(() => {
          try {
            const win = (window as any).__TAURI__?.window?.getCurrentWindow?.()
            if (win?.close) win.close()
            else window.close()
          } catch {}
        })
        return
      } catch (e: any) {
        // Remove fade-out class if we fell back
        try { document.documentElement.classList.remove('crystal-emulator-transitioning-out') } catch {}
        const msg = e?.message || String(e)
        if (msg.includes('SAFE_MODE_BLOCKED_LAUNCH')) {
          console.warn('[lifecycle] handoff blocked by SAFE_MODE – staying open')
          setSafeModeToast('SAFE MODE – launch blocked')
          setTimeout(() => setSafeModeToast(null), 2400)
          launchInFlightRef.current = false
          return
        }
        if (msg.includes('WATCHER_CREATE_FAILED') || msg.includes('RESTORE_SAVE_FAILED')) {
          launchInFlightRef.current = false
          console.warn('[lifecycle] watcher creation failed – stay open, no orphan –', msg)
          return
        }
        // Fallback to resident launch if handoff not available (command not found etc)
        if (msg.includes('not found') || msg.includes('unknown command') || msg.includes('not registered')) {
          console.debug('[lifecycle] handoff not available, fallback classic launch')
        } else {
          console.debug('[lifecycle] handoff error fallback classic launch:', msg)
        }
      }

      // Classic resident launch – keep Crystal open behind emulator (works in flatpak/bundle without watcher)
      try {
        await getLauncherBridge().launch(req.backendRequest)
        setSafeModeToast(`LAUNCHED • ${game.name}`)
        setTimeout(() => setSafeModeToast(null), 1800)
      } catch (e: any) {
        const msg = e?.message || String(e)
        console.error('[launch] failed:', msg)
        setSafeModeToast(`LAUNCH FAILED • ${msg}`)
        setTimeout(() => setSafeModeToast(null), 5000)
      } finally {
        setTimeout(() => { launchInFlightRef.current = false }, 1200)
      }
    },
    [config, safeMode, populatedSystems, activeGames]
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

  const moveSettingsFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    // Legacy fallback for monolithic settings – SettingsTabsView also listens to crystal-settings-nav
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.crystal-settings button:not(:disabled)'))
      .filter(button => button.offsetParent !== null)
    if (!buttons.length) return
    const current = document.activeElement as HTMLButtonElement | null
    if (!current || !buttons.includes(current)) {
      const firstContentButton = buttons.find(button => button.closest('[data-settings-content]')) || buttons[0]
      firstContentButton.focus({ preventScroll: true })
      firstContentButton.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    const from = current.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const vertical = direction === 'up' || direction === 'down'
    const sign = direction === 'up' || direction === 'left' ? -1 : 1
    const ranked = buttons
      .filter(button => button !== current)
      .map(button => {
        const rect = button.getBoundingClientRect()
        const dx = rect.left + rect.width / 2 - fromX
        const dy = rect.top + rect.height / 2 - fromY
        const primary = vertical ? dy * sign : dx * sign
        const cross = vertical ? Math.abs(dx) : Math.abs(dy)
        return { button, primary, score: primary * 10 + cross }
      })
      .filter(item => item.primary > 3)
      .sort((a, b) => a.score - b.score)
    const next = ranked[0]?.button || buttons[(buttons.indexOf(current) + sign + buttons.length) % buttons.length]
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, [])

  const cycleLibraryFilter = useCallback((dir: 1 | -1 = 1) => {
    const order: LibraryQuickFilter[] = ['all', 'fav', 'recent', 'unplayed']
    setLibraryFilter(cur => {
      const idx = order.indexOf(cur)
      const nextIdx = (idx + dir + order.length) % order.length
      return order[nextIdx]
    })
  }, [])

  const toggleFavoriteCurrent = useCallback(() => {
    const g = selectedGameEntry as any
    if (!g) return
    const system_id = g.system_id || activeSystemId
    const rom_basename = g.rom_basename || g.basename || g.id?.split('/')?.[1] || g.name
    const rom_path = g.rom_path || g.path || ''
    const prevFav = !!g.favorite
    const nextFav = !prevFav

    // Optimistic update via setGameCache creation for immediate UI feedback – library detail binds favorite
    setGameCache(prev => {
      const m = new Map(prev)
      const list = m.get(system_id)
      if (list) {
        const nextList = list.map((item: any) => {
          if ((item.id && item.id === g.id) || (item.rom_basename && item.rom_basename === rom_basename && item.system_id === system_id)) {
            return { ...item, favorite: nextFav }
          }
          return item
        })
        m.set(system_id, nextList)
      }
      return m
    })

    // Call backend set_favorite – preserve ES-DE gamelist.xml only, safe_mode checked in Rust
    if (!isTauriEnvironment()) {
      // Web preview fallback – in-memory only, toast success
      setSafeModeToast(nextFav ? '★ Favorited (preview)' : '☆ Unfavorited (preview)')
      setTimeout(() => setSafeModeToast(null), 2000)
      return
    }

    invokeBackend('set_favorite', { system_id, rom_basename, rom_path, favorite: nextFav })
      .then(() => {
        setSafeModeToast(nextFav ? '★ Added to favorites' : '☆ Removed from favorites')
        setTimeout(() => setSafeModeToast(null), 2000)
      })
      .catch((e: any) => {
        console.error('[favorite] persistence failed', e)
        // Rollback on failure
        setGameCache(prev => {
          const m = new Map(prev)
          const list = m.get(system_id)
          if (list) {
            const rolled = list.map((item: any) => {
              if ((item.id && item.id === g.id) || (item.rom_basename && item.rom_basename === rom_basename)) {
                return { ...item, favorite: prevFav }
              }
              return item
            })
            m.set(system_id, rolled)
          }
          return m
        })
        const msg = (e as any)?.message || String(e || '')
        if (String(msg).includes('SAFE_MODE_BLOCKED')) {
          setSafeModeToast('SAFE MODE – favorite blocked')
        } else {
          setSafeModeToast(`Favorite failed – ${String(msg).slice(0, 60)}`)
        }
        setTimeout(() => setSafeModeToast(null), 3500)
      })
  }, [selectedGameEntry, activeSystemId])

  const cycleMediaCurrent = useCallback(() => {
    try {
      const candidates = availableGameplayCandidatesRef.current
      if (!candidates || candidates.length <= 1) {
        console.info('[Library] media cycle single/no source')
        return
      }
      const regions = stageConfig.gameplayRegions
      if (!regions || regions.length === 0) return
      gameplayCycleIndexRef.current = (gameplayCycleIndexRef.current + 1) % candidates.length
      const next = candidates[gameplayCycleIndexRef.current]
      setSelectedGameplaySources([{ regionId: regions[0].id, url: next.url, mediaType: next.type as any }])
      try {
        const ev = new CustomEvent('crystal-library-media-cycle' as any, { detail: { index: gameplayCycleIndexRef.current, url: next.url } })
        window.dispatchEvent(ev)
      } catch {}
    } catch {}
  }, [stageConfig.gameplayRegions])

  const onNav = useCallback(
    (action: NavigationAction) => {
      try { recordSemanticInput(String(action)) } catch {}
      try { setCrashContext(view, activeSystemId) } catch {}
      // V8.6D1 provider surface guard – Discover list must not react underneath while surface active
      try {
        if (providerSurf?.active) {
          const ph = providerSurf.phase as any
          // While BROWSING_PROVIDER / download phases, controller minimal B/Back recovery only
          if (action === 'back' || action === 'menu') {
            try { providerSurf.cancel?.() } catch {}
            return
          }
          if (ph === 'READY_TO_PLAY' && action === 'confirm') {
            const fg = (providerSurf as any).foundGame
            if (fg) { handleLaunchGame(fg as any); return }
            return
          }
          // Block left/right/system navigation underneath – no accidental A PLAY leak
          if (['left','right','up','down','previousSystem','nextSystem','search','favorite','media','quickFilter','quickSettings','diagnosticsDebug','cycleTabLeft','cycleTabRight'].includes(action as any)) return
        }
      } catch {}

      // V8.6C2.1 – Acquisition controller input guard
      try {
        const ext = (crystalAcq as any)?.externalState
        const phase = (crystalAcq as any)?.crystalPhase as string
        if (ext && phase) {
          const terminalReady = phase === "READY_TO_PLAY"
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
            if (nonTerminalBlocking && acquisitionOwnsConfirm(view, phase)) return
            if (terminalCloseable && acquisitionOwnsConfirm(view, phase)) return
          }
        }
      } catch {}

      // Global diagnosticsDebug chord – L+R+View (gamepad) or I / Ctrl+D (keyboard)
      if (action === 'diagnosticsDebug') {
        setDiagnosticsDebugOverlayVisible(v => !v)
        return
      }

      // Global quickSettings – Menu button (gamepad 9 / keyboard O) → Settings General immediately
      if (action === 'quickSettings') {
        setView('settings')
        // dispatch to set tab general when SettingsTabsView mounted
        try {
          window.setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent('crystal-settings-jump' as any, { detail: 'general' } as any)) } catch {}
          }, 80)
        } catch {}
        return
      }

      if (view === 'system') {
        if (action === 'left' || action === 'up' || action === 'previousSystem' || action === 'cycleTabLeft') {
          setActiveSystemId(current => {
            const idx = systemIds.indexOf(current)
            const safe = idx < 0 ? 0 : idx
            return systemIds[(safe - 1 + systemIds.length) % systemIds.length] ?? current
          })
        } else if (action === 'right' || action === 'down' || action === 'nextSystem' || action === 'cycleTabRight') {
          setActiveSystemId(current => {
            const idx = systemIds.indexOf(current)
            const safe = idx < 0 ? 0 : idx
            return systemIds[(safe + 1) % systemIds.length] ?? current
          })
        } else if (action === 'confirm') {
          setView('library')
        } else if (action === 'menu') {
          setView('settings')
        } else if (action === 'search' || action === 'quickFilter') {
          // View = quick filter in system context → cycle filter? System uses Discover but we map quickFilter → Discover prefill search
          setDiscoverPrefillGame(null)
          setDiscoverOrigin('system')
          setView('discover')
        } else if (action === 'favorite') {
          // Y no-op preserved in system
        } else if (action === 'media') {
          // X media in system – attempt discover? preserve
          setDiscoverPrefillGame(null)
          setDiscoverOrigin('system')
          setView('discover')
        }
      } else if (view === 'library') {
        // View (quick filter) → cycle filter chips All/Fav/Recent/Unplayed
        if (action === 'quickFilter') {
          cycleLibraryFilter(1)
          setLibraryChipFocused(true)
          try {
            const ev = new CustomEvent('crystal-library-quick-filter' as any, { detail: { filter: libraryFilter } as any })
            window.dispatchEvent(ev)
          } catch {}
          return
        }
        if (action === 'search') {
          const g = selectedGameEntry as any
          if (g) {
            setDiscoverPrefillGame(g)
            setDiscoverOrigin('library')
            setView('discover')
            return
          }
          setDiscoverPrefillGame(null)
          setDiscoverOrigin('library')
          setView('discover')
          return
        }
        if (action === 'favorite') {
          toggleFavoriteCurrent()
          return
        }
        if (action === 'media') {
          cycleMediaCurrent()
          return
        }
        const list = displayGames
        if (!list.length) {
          // Even when library empty due to filter/drive missing, back still returns
          if (action === 'back') setView('system')
          // Chip nav still allowed when empty – left/right cycles filter when chip focused, else moves to chip
          if (libraryChipFocused) {
            if (action === 'left') { cycleLibraryFilter(-1 as any); return }
            if (action === 'right') { cycleLibraryFilter(1); return }
            if (action === 'down' || action === 'up') {
              setLibraryChipFocused(false)
              return
            }
          } else {
            if (action === 'up') {
              setLibraryChipFocused(true)
              return
            }
          }
          return
        }
        // Smart filter chip D-pad navigable – when chip focused, left/right cycles chips, up/down moves games
        if (libraryChipFocused) {
          if (action === 'left') {
            cycleLibraryFilter(-1 as any)
            return
          }
          if (action === 'right') {
            cycleLibraryFilter(1)
            return
          }
          if (action === 'down') {
            setLibraryChipFocused(false)
            // move to first or keep selection? move to first entry for clarity
            if (list[0]) setSelectedGameId(list[0].id)
            return
          }
          if (action === 'up') {
            // up from chip goes to game list bottom? keep simple – go to last game then exit chip
            setLibraryChipFocused(false)
            const last = list[list.length - 1]
            if (last) setSelectedGameId(last.id)
            return
          }
          if (action === 'confirm') {
            // A toggles – filter already toggled via left/right, but A confirms selection and exits chip focus to games
            setLibraryChipFocused(false)
            return
          }
          if (action === 'back') { setLibraryChipFocused(false); return }
          return
        }
        if (action === 'left' || action === 'up') {
          // If at first item and pressing up, move focus to chip row (boutique navigation)
          if (action === 'up') {
            const curIdx = selectedGameId ? list.findIndex(g => g.id === selectedGameId) : 0
            if (curIdx <= 0) {
              setLibraryChipFocused(true)
              return
            }
          }
          setSelectedGameId(prev => {
            const curIdx = prev ? list.findIndex(g => g.id === prev) : 0
            const safe = curIdx < 0 ? 0 : curIdx
            const nextIdx = (safe - 1 + list.length) % list.length
            return list[nextIdx].id
          })
        } else if (action === 'right' || action === 'down') {
          setSelectedGameId(prev => {
            const curIdx = prev ? list.findIndex(g => g.id === prev) : 0
            const safe = curIdx < 0 ? 0 : curIdx
            const nextIdx = (safe + 1) % list.length
            return list[nextIdx].id
          })
        } else if (action === 'confirm') {
          // Ensure provider acquisition still cannot leak A PLAY
          if (providerSurf?.active || (crystalAcq as any)?.active) return
          if (safeMode) {
            console.warn('[SAFE MODE] controller launch blocked')
            setSafeModeToast('SAFE MODE – launch blocked')
            setTimeout(() => setSafeModeToast(null), 2400)
            return
          }
          const g = selectedGameEntry
          if (g) handleLaunchGame(g as any)
        } else if (action === 'back') {
          setView('system')
        } else if (action === 'menu') {
          setView('settings')
        } else if (action === 'previousSystem' || action === 'cycleTabLeft') {
          setActiveSystemId(current => {
            const idx = systemIds.indexOf(current)
            const safe = idx < 0 ? 0 : idx
            return systemIds[(safe - 1 + systemIds.length) % systemIds.length] ?? current
          })
        } else if (action === 'nextSystem' || action === 'cycleTabRight') {
          setActiveSystemId(current => {
            const idx = systemIds.indexOf(current)
            const safe = idx < 0 ? 0 : idx
            return systemIds[(safe + 1) % systemIds.length] ?? current
          })
        }
      } else if (view === 'discover') {
        if (action === 'quickFilter') {
          cycleLibraryFilter(1)
          return
        }
        if ((action as string) === 'quickSettings') {
          setView('settings')
          return
        }
        try {
          const ev = new CustomEvent('crystal-discover-nav', { detail: action })
          window.dispatchEvent(ev)
        } catch {}
        return
      } else if (view === 'settings') {
        if (action === 'back' || action === 'menu') {
          // if debug overlay open, close it first
          if (diagnosticsDebugOverlayVisible) {
            setDiagnosticsDebugOverlayVisible(false)
            return
          }
          setView('system')
          return
        }
        if (action === 'quickFilter' || action === 'search') {
          // In Diagnostics tab View toggles debug overlay, else cycles library filter inside settings? We map quickFilter to debug overlay only when in diagnostics tab
          try {
            const activeTabEl = document.querySelector('[data-settings-tab][style*=\"#7df9ff\"], [data-settings-tab][style*=\"#295fdc\"]') as HTMLElement | null
            const isDiagnostics = activeTabEl?.getAttribute('data-settings-tab') === 'diagnostics'
            // fallback heuristic – query active tab state via DOM aria? simpler dispatch event and let SettingsTabsView decide
            if (isDiagnostics) {
              setDiagnosticsDebugOverlayVisible(v => !v)
              return
            }
          } catch {}
          // In non-diagnostics, View jumps to quickFilter? No – we treat as no-op
        }
        if (action === 'up' || action === 'down') {
          try { window.dispatchEvent(new CustomEvent('crystal-settings-nav' as any, { detail: action })) } catch {}
          moveSettingsFocus(action as any)
          return
        }
        if (action === 'left' || action === 'right' || action === 'previousSystem' || action === 'nextSystem' || action === 'cycleTabLeft' || action === 'cycleTabRight') {
          const dir = (action === 'left' || action === 'previousSystem' || action === 'cycleTabLeft') ? 'left' : 'right'
          try { window.dispatchEvent(new CustomEvent('crystal-settings-nav' as any, { detail: dir })) } catch {}
          // Extra: also directly cycle via custom event for tab handlers
          try { window.dispatchEvent(new CustomEvent('crystal-settings-nav' as any, { detail: dir === 'left' ? 'previousSystem' : 'nextSystem' })) } catch {}
          return
        }
        if (action === 'confirm') {
          const focused = document.activeElement as HTMLButtonElement | null
          if (focused?.matches('.crystal-settings button:not(:disabled)')) focused.click()
          else {
            try { window.dispatchEvent(new CustomEvent('crystal-settings-nav' as any, { detail: 'down' })) } catch {}
            moveSettingsFocus('down')
          }
          return
        }
        if (action === 'favorite') {
          // Y in settings – reserved no-op / dev toggle
          return
        }
        if (action === 'media') {
          // X cycle media unavailable in settings – no-op
          return
        }
        return
      } else {
        if (action === 'back') setView('system')
        if (action === 'search' || action === 'quickFilter') {
          setDiscoverPrefillGame(null)
          setDiscoverOrigin(view as any)
          setView('discover')
        }
      }
    },
    [view, systemIds, activeSystemId, activeGames, selectedGameEntry, config, safeMode, stageConfig, crystalAcq, providerSurf, handleLaunchGame, moveSettingsFocus, libraryFilter, cycleLibraryFilter, toggleFavoriteCurrent, cycleMediaCurrent, diagnosticsDebugOverlayVisible]
  )

  // Effects – must be unconditional and before any early returns
  useEffect(() => {
    if (view !== 'settings') return
    const frame = window.requestAnimationFrame(() => moveSettingsFocus('down'))
    return () => window.cancelAnimationFrame(frame)
  }, [view, moveSettingsFocus])

  // Crystal remains resident behind an emulator. Stop expensive media decoding
  // and visual animation while its window is not active, then resume only the
  // visible videos when the user returns.
  useEffect(() => {
    const suspendBackgroundWork = () => {
      document.documentElement.classList.add('crystal-background-suspended')
      document.querySelectorAll<HTMLVideoElement>('video').forEach(video => video.pause())
    }
    const resumeBackgroundWork = () => {
      document.documentElement.classList.remove('crystal-background-suspended')
      document.querySelectorAll<HTMLVideoElement>('video').forEach(video => {
        if (video.offsetParent !== null && video.autoplay) void video.play().catch(() => {})
      })
    }
    window.addEventListener('blur', suspendBackgroundWork)
    window.addEventListener('focus', resumeBackgroundWork)
    return () => {
      window.removeEventListener('blur', suspendBackgroundWork)
      window.removeEventListener('focus', resumeBackgroundWork)
      document.documentElement.classList.remove('crystal-background-suspended')
    }
  }, [])

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
    async function load() {
      if (!activeSystemId) return
      if (gameCache.has(activeSystemId)) return
      if (cacheLoading.has(activeSystemId)) return
      const systemId = activeSystemId
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
            setGameCache(prev => {
              const m = new Map(prev)
              m.set(systemId, fixtures)
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
        s.add(systemId)
        return s
      })
      try {
        const games = await listGames(systemId)
        setGameCache(prev => {
          const m = new Map(prev)
          m.set(systemId, games)
          return m
        })
      } catch {
        // fallback to fixture even in Tauri if enumeration fails but fixture exists (dev assist)
        if ((!isTauri || !isRealMachine) && getFixtureSystems().includes(systemId)) {
          try {
            const fixtures = getFixtureGames(systemId).map(toGameEntry)
            setGameCache(prev => {
              const m = new Map(prev)
              m.set(systemId, fixtures)
              return m
            })
            return
          } catch {}
        }
        setGameCache(prev => {
          const m = new Map(prev)
          m.set(systemId, [])
          return m
        })
      } finally {
        setCacheLoading(prev => {
          const s = new Set(prev)
          s.delete(systemId)
          return s
        })
      }
    }
    load()
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
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg)', color: 'var(--crystal-ink)' }}>
        <div style={{ opacity: 0.6, fontSize: 12, letterSpacing: '0.08em' }}>crystal frontend • loading machine…</div>
      </div>
    )
  }

  if (machineError) {
    const isBlocking = !!(blockingError || (typeof machineError === 'string' && machineError.includes('Real machine configuration failed')))
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg)', color: 'var(--crystal-ink)', padding: 24 }}>
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
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--crystal-bg,#0a0a0f)', color: 'var(--crystal-ink)', padding: 24 }}>
        <div style={{ maxWidth: 560, fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--crystal-mono)', border: '1px solid var(--crystal-line)', background: 'var(--crystal-glass)', padding: 18, borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Machine reports 0 populated systems</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`fullscreen-root ${theme}-theme ${isRestoredBoot ? 'crystal-emulator-transitioning-in' : ''} ${instantRestoring?.active ? 'crystal-is-restoring' : ''} ${(providerSurf?.active || (crystalAcq as any)?.active) ? 'provider-surface-active' : ''}`} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#0a0a0f' }}>
      <style>{`
        .provider-surface-active .golden-system-landing,
        .provider-surface-active .golden-library,
        .provider-surface-active [data-crystal-system-landing],
        .provider-surface-active [data-crystal-library-view] {
          filter: brightness(0.6);
          pointer-events: none;
          user-select: none;
        }
        .provider-surface-active .crystal-provider-dim-overlay {
          display: block !important;
        }
        .provider-surface-active {
          --provider-owns: 1;
        }
      `}</style>
      {(providerSurf?.active || (crystalAcq as any)?.active) && (
        <div className="crystal-provider-dim-overlay" style={{ position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none', background: 'rgba(6,10,16,0.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'block' }} />
      )}
      {(providerSurf?.active || (crystalAcq as any)?.active) && (
        <div
          data-testid="provider-owns-badge"
          style={{
            position: 'absolute',
            top: 12,
            right: 96,
            zIndex: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            background: theme === 'dark' ? 'rgba(12,18,28,0.82)' : 'rgba(255,255,255,0.88)',
            border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.22)' : 'rgba(70,130,255,0.20)'}`,
            color: theme === 'dark' ? '#7df9ff' : '#2a5fdc',
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10.5,
            letterSpacing: '0.06em',
            fontWeight: 700,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 12 }}>🔒</span> Provider owns controls
        </div>
      )}
      {instantRestoring?.active && (
        <div className="crystal-instant-restore-placeholder" data-system={instantRestoring.systemId || activeSystemId} />
      )}
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
              setActiveSystemId(current => {
                const idx = systemIds.indexOf(current)
                const safe = idx < 0 ? 0 : idx
                return systemIds[(safe - 1 + systemIds.length) % systemIds.length] ?? current
              })
            }}
            onNext={() => {
              setActiveSystemId(current => {
                const idx = systemIds.indexOf(current)
                const safe = idx < 0 ? 0 : idx
                return systemIds[(safe + 1) % systemIds.length] ?? current
              })
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
            selectedId={selectedGameId || (displayGames[0]?.id ?? activeGames[0]?.id ?? '')}
            selectedGame={librarySelectedDetail}
            safeMode={safeMode}
            onSafeModeBlocked={() => {
              console.warn('[SAFE MODE] blocked launch via LibraryView')
              setSafeModeToast('SAFE MODE – launch blocked')
              setTimeout(() => setSafeModeToast(null), 2400)
            }}
            onSelect={id => setSelectedGameId(id)}
            onLaunch={g => {
              const real = displayGames.find(ag => ag.id === g.id) || activeGames.find(ag => ag.id === g.id)
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
              setLibraryChipFocused(false)
            }}
            mediaResolving={mediaResolving}
            logoUrl={logoUrl}
            stageNode={null}
            filter={libraryFilter}
            onFilterChange={f => setLibraryFilter(f)}
            chipFocused={libraryChipFocused}
            onChipFocusChange={setLibraryChipFocused}
            continueGames={continuePlayingGames.map((g: any) => ({
              id: g.id,
              name: g.name,
              coverUrl: (g as any)._fixtureCoverUrl || null,
              lastPlayedLabel: ((g as any).last_played || (g as any).lastplayed) ? lastPlayedLabel(g as any) as any : null,
            }))}
            isEmptyDriveState={isLibraryEmptyDriveState}
            onRefresh={async () => {
              try {
                const games = await listGames(activeSystemId)
                setGameCache(prev => {
                  const m = new Map(prev)
                  m.set(activeSystemId, games)
                  return m
                })
              } catch {}
            }}
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
          onBeginAcquisition={(req: any) => crystalAcq.begin(req)}
          acquisitionActive={!!(crystalAcq.active || providerSurf.active)}
          acquisitionPhase={(providerSurf.phase !== 'IDLE' ? providerSurf.phase : crystalAcq.crystalPhase) as any}
          onBack={() => {
            // Crystal B/Back must remain recoverable while provider surface active – block Discover exit underneath?
            if (providerSurf.active) {
              try { providerSurf.cancel(); } catch {}
              return
            }
            setView(discoverOrigin === 'discover' ? 'system' : (discoverOrigin as any))
          }}
        />
      )}

      {providerSurf.active && providerSurf.state && (
        <ProviderSurfaceView
          theme={theme as any}
          systemId={providerSurf.state.systemId}
          expectedTitle={providerSurf.state.expectedTitle}
          currentUrl={providerSurf.state.currentUrl}
          phase={providerSurf.phase}
          blockedUrl={providerSurf.state.providerBlockedUrl}
          errorMessage={providerSurf.state.message || providerSurf.errorDetail || undefined}
          onBack={() => {
            try { providerSurf.cancel(); } catch {}
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
          className="crystal-settings"
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

          <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SettingsTabsView
              theme={theme}
              onToggleTheme={toggle}
              showGuides={showGuides}
              onToggleGuides={() => setShowGuides(v => !v)}
              devMode={devMode}
              onToggleDevMode={() => setDevMode(v => !v)}
              safeMode={safeMode}
              systems={systemsForUI.map(s => ({ id: s.id, fullName: s.fullName }))}
              populatedSystems={populatedSystems as any}
              config={config}
              activeSystemId={activeSystemId}
              onLibraryChanged={async (systemId) => {
                const games = await listGames(systemId)
                setGameCache(prev => new Map(prev).set(systemId, games))
              }}
              onClose={() => setView('system')}
              onDebugOverlayToggle={() => setDiagnosticsDebugOverlayVisible(v => !v)}
              debugOverlayVisible={diagnosticsDebugOverlayVisible}
            />
          </div>
        </div>
      )}

      {/* Diagnostics Debug Overlay – L+R+View chord, View in Diagnostics tab */}
      <DiagnosticsDebugOverlay
        theme={theme as any}
        systemId={activeSystemId}
        visible={diagnosticsDebugOverlayVisible}
        onClose={() => setDiagnosticsDebugOverlayVisible(false)}
      />

      {/* Pillar 2 – Filter chips now live inside LibraryView (boutique integration) – legacy absolute chips removed to avoid clutter */}

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

      {/* Dedup trust toast – small, bounded, after dedupeLibraryGames cleans duplicates */}
      {dedupToast && (
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: 68,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 19,
            background: theme === 'dark' ? 'rgba(16,22,28,0.90)' : 'rgba(255,255,255,0.92)',
            border: `1px solid ${theme === 'dark' ? 'rgba(125,249,255,0.24)' : 'rgba(70,130,255,0.18)'}`,
            color: theme === 'dark' ? '#c8fcff' : '#1e3a8a',
            padding: '8px 14px',
            borderRadius: 999,
            fontFamily: 'var(--crystal-mono)',
            fontSize: 10.5,
            letterSpacing: '0.05em',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          ✨ {dedupToast}
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
        <CrystalErrorBoundaryWrapper>
          <AppInner />
        </CrystalErrorBoundaryWrapper>
      </MachineConfigProvider>
    </ThemeProvider>
  )
}

import { CrystalErrorBoundary } from './components/CrystalErrorBoundary'
function CrystalErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  return <CrystalErrorBoundary>{children}</CrystalErrorBoundary>
}
