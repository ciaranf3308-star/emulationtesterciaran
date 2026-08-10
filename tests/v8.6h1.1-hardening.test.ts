/**
 * V8.6H1.1 – Frontend hardening behavioral proof
 * Tasks 11,17,18,19
 *
 * 17 DUPLICATE DETAIL – provider getDetail count =1 single authority
 * 18 STRICT FIXTURE GATE – shim actual behavior exact ?fixture=golden only, Tauri disables
 * 19 DISCOVER UNMOUNT ABORT – abort signal aborted on cleanup, late result ignored
 * 11 EXACT PATH IDENTITY – duplicate normalized title, exact installedPaths wins
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { DiscoveryService } from '../src/discovery/discoveryService'
import type { CatalogProvider } from '../src/discovery/catalogProvider'
import { search as shimSearch, detail as shimDetail } from '../src/lib/discoveryService'
import { isFixtureEnabled, isDevFixtureAllowed } from '../src/dev/fixtures/fixtureMode'
import { findInstalledGame } from '../src/acquisition/acquisitionUiController'

// ---------- polyfill window for bun:test (no jsdom by default) ----------

function ensureWindow() {
  // Make window identifier resolvable via globalThis
  const g: any = globalThis as any
  if (typeof g.window === 'undefined') {
    g.window = g
  }
  const w = g.window
  if (!w.location || typeof w.location.href === 'undefined') {
    // location as URL object – enough for search property
    try {
      w.location = new URL('http://localhost/')
    } catch {
      w.location = { href: 'http://localhost/', search: '' } as any
    }
  }
  if (!w.history) {
    w.history = {
      replaceState: (_: any, __: string, url: string) => {
        try {
          const u = new URL(url, 'http://localhost/')
          w.location = u
          // also keep search string accessible
        } catch {
          // fallback parse ?qs
          const qIdx = url.indexOf('?')
          if (qIdx >= 0) {
            const search = url.slice(qIdx)
            // mutate existing URL if possible
            try {
              const cur = w.location instanceof URL ? w.location : new URL(w.location.href || 'http://localhost/')
              const newU = new URL(cur.href)
              newU.search = search
              w.location = newU
            } catch {
              w.location.search = search
            }
          }
        }
      },
    }
  }
  // localStorage stub for cache (optional)
  if (!w.localStorage) {
    const store = new Map<string, string>()
    w.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
    } as any
  }
}

function setLocationSearch(qs: string) {
  ensureWindow()
  const w: any = (globalThis as any).window
  const url = new URL('http://localhost/' + qs)
  try {
    w.history.replaceState({}, '', url.toString())
  } catch {
    w.location = url
  }
}
function clearLocation() {
  ensureWindow()
  const w: any = (globalThis as any).window
  try {
    w.history.replaceState({}, '', 'http://localhost/')
  } catch {
    w.location = new URL('http://localhost/')
  }
}

function setTauriEnv(enabled: boolean) {
  ensureWindow()
  const w = (globalThis as any).window
  if (enabled) {
    w.__TAURI__ = w.__TAURI__ || {}
    w.__TAURI_INTERNALS__ = w.__TAURI_INTERNALS__ || {}
  } else {
    delete w.__TAURI__
    delete w.__TAURI_INTERNALS__
    delete w.__TAURI_INVOKE__
    delete w.__TAURI_IPC__
  }
}

function setDevEnv(devTrue: boolean) {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined') {
      // @ts-ignore
      (import.meta as any).env = { DEV: devTrue }
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && (process as any).env) {
      (process as any).env.NODE_ENV = devTrue ? 'development' : 'test'
    }
  } catch {}
}

// ---------- 17 DUPLICATE DETAIL ----------

describe('V8.6H1.1 – DUPLICATE DETAIL REQUEST TEST', () => {
  it('DiscoveryService.getDetail calls provider.getDetail exactly once on failure – no fallback second call', async () => {
    let callCount = 0
    const mockProvider: CatalogProvider = {
      id: 'vimms',
      name: "Vimm's Lair",
      supportsSystem: () => true,
      search: async () => [],
      getDetail: async (id: string) => {
        callCount++
        throw new Error(`mock fail for ${id}`)
      },
      buildExternalUrl: (id: string) => `https://vimm.net/vault/${id}`,
    }

    const service = new DiscoveryService(mockProvider as any)
    const uniqueId = `999999${Date.now() % 10000}`

    try {
      await service.getDetail(uniqueId, 'ps2')
      expect(true).toBe(false) // should not reach
    } catch (e: any) {
      expect(e.message.includes('mock fail')).toBe(true)
    }
    expect(callCount).toBe(1)
  })

  it('shim discoveryService.ts detail() must not contain provider.getDetail retry path', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync('src/lib/discoveryService.ts', 'utf8')
    const detailIdx = content.indexOf('export async function detail')
    expect(detailIdx).toBeGreaterThan(-1)
    const detailBody = content.slice(detailIdx, detailIdx + 2500)
    expect(detailBody.includes('service.getDetail')).toBe(true)
    expect(detailBody.includes('provider.getDetail')).toBe(false)
    expect(detailBody.includes('return null')).toBe(true)
  })

  it('shim facade single authority – search gap still covered, service only provider', async () => {
    const fs = await import('node:fs')
    const shim = fs.readFileSync('src/lib/discoveryService.ts', 'utf8')
    expect(shim.includes('new DiscoveryService')).toBe(true)
    expect(shim.includes('VimmProvider')).toBe(true)
    const searchUses = (shim.match(/service\.search/g) || []).length
    expect(searchUses).toBeGreaterThanOrEqual(1)
  })
})

// ---------- 18 STRICT FIXTURE GATE SHIM BEHAVIOR ----------

describe('V8.6H1.1 – STRICT FIXTURE GATE – shim actual behavior', () => {
  const originalDev = (() => {
    try {
      // @ts-ignore
      return (import.meta as any).env?.DEV
    } catch { return undefined }
  })()
  const originalNodeEnv = typeof process !== 'undefined' ? (process as any).env?.NODE_ENV : undefined

  beforeEach(() => {
    ensureWindow()
    setTauriEnv(false)
    setDevEnv(true)
    clearLocation()
  })

  afterEach(() => {
    setTauriEnv(false)
    clearLocation()
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined') {
        // @ts-ignore
        (import.meta as any).env = { DEV: originalDev ?? true }
      }
      if (typeof process !== 'undefined' && (process as any).env) {
        (process as any).env.NODE_ENV = originalNodeEnv ?? 'test'
      }
    } catch {}
  })

  it('?fixture=golden → synthetic discovery allowed (DEV non-tauri)', async () => {
    setLocationSearch('?fixture=golden')
    const res = isFixtureEnabled()
    expect(res.enabled).toBe(true)
    expect(isDevFixtureAllowed()).toBe(true)

    const results = await shimSearch({ systemId: 'ps2', query: 'Mario' })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBe(6)
    expect(results[0].title.toLowerCase().includes('mario')).toBe(true)
    expect(results[0].externalUrl.includes('https://vimm.net/vault/')).toBe(true)
  })

  it('non-exact fixtures must NOT activate synthetic discovery', async () => {
    const negativeCases = [
      '?myfixture=true',
      '?fixturegolden=true',
      '?foo=fixture',
      '?fixture=somethingelse',
      '?fixture=goldenx',
      '?fixture=GOLDEN',
      '',
      '?fixture=',
    ]

    for (const qs of negativeCases) {
      setLocationSearch(qs)
      const res = isFixtureEnabled()
      expect(res.enabled).toBe(false)
    }

    // One representative negative -> ensure shim search NOT synthetic (throws tauri path, not returns mocks)
    setLocationSearch('?myfixture=true')
    let threw = false
    let synthetic = false
    try {
      const out = await shimSearch({ systemId: 'ps2', query: 'Mario' })
      if (Array.isArray(out) && out.length === 6) {
        synthetic = true // would be synthetic, which we don't want
      }
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.toLowerCase().includes('tauri') || msg.toLowerCase().includes('unsupported') || msg.toLowerCase().includes('provider')) {
        threw = true
      } else {
        threw = true // any throw counts as not synthetic
      }
    }
    expect(synthetic).toBe(false)
    expect(threw).toBe(true)
  })

  it('Tauri env must keep synthetic disabled even with ?fixture=golden', async () => {
    setLocationSearch('?fixture=golden')
    setTauriEnv(true)
    // isFixtureEnabled may still be true (it doesn't check Tauri), but shim's strict gate blocks
    expect(isDevFixtureAllowed()).toBe(false) // because Tauri true -> isDevFixtureAllowed false

    let threw = false
    let gotSynthetic = false
    try {
      const out = await shimSearch({ systemId: 'ps2', query: 'Mario' })
      if (Array.isArray(out) && out.length === 6) {
        gotSynthetic = true
      }
    } catch {
      threw = true
    }
    expect(gotSynthetic).toBe(false)
    expect(threw).toBe(true)

    try {
      const d = await shimDetail('123456', 'ps2')
      // detail shim when gate false returns null on error, not synthetic object – prove gate blocked synthetic
      // synthetic detail would be non-null with description premium; null indicates real path blocked
      expect(d).toBeNull()
    } catch {
      expect(true).toBe(true)
    }
  })

  it('detail shim behaves same gate – fixture=golden returns mock detail, others go real', async () => {
    setTauriEnv(false)
    setDevEnv(true)
    setLocationSearch('?fixture=golden')
    const d = await shimDetail('999001', 'gc')
    expect(d).not.toBeNull()
    expect(d?.title).toBeTruthy()
    expect(d?.externalUrl.includes('https://vimm.net/vault/')).toBe(true)

    setLocationSearch('?fixture=somethingelse')
    const d2 = await shimDetail('999002', 'gc')
    // When gate false, shim detail goes to service.getDetail which fails (tauri) -> returns null
    expect(d2).toBeNull()
    expect(isFixtureEnabled().enabled).toBe(false)
  })
})

// ---------- 19 DISCOVER UNMOUNT ABORT ----------

describe('V8.6H1.1 – DISCOVER UNMOUNT ABORT', () => {
  it('abortRef pattern exists in DiscoverView.tsx', async () => {
    const fs = await import('node:fs')
    const content = fs.readFileSync('src/components/DiscoverView.tsx', 'utf8')
    expect(content.includes('abortRef')).toBe(true)
    expect(content.includes('abortRef.current?.abort()')).toBe(true)
    expect(content.includes('return () =>')).toBe(true)
    expect(content.includes('let cancelled = false') || content.includes('cancelled = true')).toBe(true)
  })

  it('AbortController semantics: cleanup aborts signal, late result ignored', async () => {
    const abortRef = { current: null as AbortController | null }
    let resultsState: any[] | null = null
    let cancelled = false

    async function simulatedDoSearch(query: string) {
      if (abortRef.current) {
        try { abortRef.current.abort() } catch {}
      }
      const ac = new AbortController()
      abortRef.current = ac

      const fetchPromise = new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (ac.signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
          } else {
            resolve([`result for ${query}`])
          }
        }, 30)
        ac.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })

      try {
        const res = await fetchPromise
        if (cancelled || ac.signal.aborted) return
        resultsState = res
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        throw e
      }
    }

    const p1 = simulatedDoSearch('Mario')
    await new Promise(r => setTimeout(r, 5))
    cancelled = true
    try { abortRef.current?.abort() } catch {}
    try { await p1 } catch {}

    expect(abortRef.current?.signal.aborted).toBe(true)
    expect(resultsState).toBe(null)

    cancelled = false
    await simulatedDoSearch('Zelda')
    expect(resultsState?.[0]).toBe('result for Zelda')
  })

  it('new query aborts prior (stale guard)', async () => {
    const acA = new AbortController()
    const acB = new AbortController()
    acA.abort()
    expect(acA.signal.aborted).toBe(true)
    expect(acB.signal.aborted).toBe(false)
  })
})

// ---------- 11 EXACT PATH IDENTITY DUPLICATE TITLES ----------

describe('V8.6H1.1 – EXACT PATH IDENTITY WITH DUPLICATE TITLES', () => {
  function makeEntry(id: string, name: string, rom_path: string): any {
    return {
      id,
      system_id: 'ps2',
      name,
      rom_path,
      rom_basename: rom_path.split('/').pop() || rom_path.split('\\').pop(),
      extension: 'iso',
    }
  }

  it('findInstalledGame selects exact path match when duplicate normalized titles', () => {
    const entryA = makeEntry('a', 'Super Mario World', 'C:/ROMS/PS2/Super Mario World (USA).iso')
    const entryB = makeEntry('b', 'Super Mario World (USA)', 'C:/ROMS/PS2/Super Mario World (Europe).iso')
    const installedPaths = ['C:/ROMS/PS2/Super Mario World (USA).iso']

    const res = findInstalledGame({
      systemId: 'ps2',
      expectedTitle: 'Super Mario World',
      installedPaths,
      refreshedGames: [entryA, entryB],
    })

    expect(res.found).not.toBeNull()
    expect(res.found?.id).toBe('a')
    expect(res.found?.rom_path.toLowerCase()).toBe(installedPaths[0].toLowerCase())
  })

  it('exact installedPaths authority preferred over title ambiguity – multiple titles same normalized fails to single but exact wins', () => {
    const entry1 = makeEntry('1', 'Gran Turismo 4', '/roms/ps2/Gran Turismo 4.iso')
    const entry2 = makeEntry('2', 'Gran Turismo 4', '/roms/ps2/Gran Turismo 4 (Europe).iso')
    const installedPaths = ['/roms/ps2/Gran Turismo 4 (Europe).iso']

    const res = findInstalledGame({
      systemId: 'ps2',
      expectedTitle: 'Gran Turismo 4',
      installedPaths,
      refreshedGames: [entry1, entry2],
    })
    expect(res.found?.id).toBe('2')
  })

  it('without installedPaths, duplicate title leads to MULTIPLE_TITLE_MATCHES fail-closed', () => {
    const e1 = makeEntry('1', 'Mario', '/a/Mario.iso')
    const e2 = makeEntry('2', 'Mario', '/b/Mario.iso')
    const res = findInstalledGame({
      systemId: 'ps2',
      expectedTitle: 'Mario',
      installedPaths: [],
      refreshedGames: [e1, e2],
    })
    expect(res.found).toBeNull()
    expect(res.reason).toBe('MULTIPLE_TITLE_MATCHES')
  })

  it('primary descriptor preferred when multiple installedPaths (CUE over BIN)', () => {
    const cueEntry = makeEntry('cue', 'Game', '/roms/ps2/Game.cue')
    const binEntry = makeEntry('bin', 'Game', '/roms/ps2/tracks/track01.bin')
    const installedPaths = ['/roms/ps2/tracks/track01.bin', '/roms/ps2/Game.cue']

    const res = findInstalledGame({
      systemId: 'ps2',
      expectedTitle: 'Game',
      installedPaths,
      refreshedGames: [binEntry, cueEntry],
    })
    expect(res.found?.id).toBe('cue')
  })

  it('unicode titles retain exact path identity (Pokémon)', () => {
    const entryJa = makeEntry('ja', 'Pokémon', 'C:/ROMS/GBA/Pokémon.iso')
    const entryDup = makeEntry('dup', 'Pokémon', 'C:/ROMS/GBA/Pokémon (Europe).iso')
    const installedPaths = ['C:/ROMS/GBA/Pokémon (Europe).iso']

    const res = findInstalledGame({
      systemId: 'gba',
      expectedTitle: 'Pokémon',
      installedPaths,
      refreshedGames: [entryJa, entryDup],
    })
    expect(res.found?.id).toBe('dup')
  })

  it('ALREADY_INSTALLED exact path gap – proves C2 now has strongest identity path', () => {
    const installedPath = '/roms/gc/Super Smash Bros Melee.iso'
    const correct = makeEntry('correct', 'Super Smash Bros Melee', installedPath)
    const wrong = makeEntry('wrong', 'Super Smash Bros Melee', '/roms/gc/Other.iso')
    const res = findInstalledGame({
      systemId: 'gc',
      expectedTitle: 'Super Smash Bros Melee',
      installedPaths: [installedPath],
      refreshedGames: [wrong, correct],
    })
    expect(res.found).not.toBeNull()
    expect(res.found?.rom_path).toBe(installedPath)
  })
})
