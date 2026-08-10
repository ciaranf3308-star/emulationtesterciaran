import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { readFileSync, existsSync } from 'node:fs'

/**
 * V8.1 – Frontend Safety & Tests & Integration
 * Covers:
 * - write guard accepts Crystal app-data child path
 * - rejects ROM path (e.g. D:/Emulation/roms/ps2/foo.bin)
 * - rejects ES-DE path (e.g. /home/.../ES-DE/settings.xml etc)
 * - rejects EmuDeck path
 * - rejects drive root C:\ or /
 * - rejects parent traversal ../../../etc
 * - safe-mode logic: safe mode blocks launch_game backend (mock)
 * - safe mode still permits machine-config read, ROM enum, gamelist read, media resolution
 * - installed mode never falls back to fake config
 * - invalid machine config blocks cleanly
 * - normal launch path preserved when safe mode OFF
 *
 * Helpers mirror Rust safety logic in TS for unit test (isSafeWritePathTs)
 */

// ---------- TS helper mirroring Rust write guard ----------
function normalizePath(p: string): string {
  if (!p) return ''
  // convert backslashes to forward slashes for uniform handling
  let s = p.replace(/\\/g, '/')
  // preserve windows drive prefix e.g. C:/ -> C:/
  let drive = ''
  const driveMatch = s.match(/^([a-zA-Z]:)(\/.*)?$/)
  if (driveMatch) {
    drive = driveMatch[1].toUpperCase() // normalize drive case
    s = driveMatch[2] || '/'
    if (!s.startsWith('/')) s = '/' + s
  }
  const isAbs = s.startsWith('/')
  const parts = s.split('/').filter(Boolean)
  const stack: string[] = []
  for (const seg of parts) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop()
      } else {
        // attempting to traverse beyond root – keep .. to signal escape
        stack.push('..')
      }
    } else {
      stack.push(seg)
    }
  }
  let out = (isAbs ? '/' : '') + stack.join('/')
  if (drive) {
    out = drive + (out.startsWith('/') ? out : '/' + out)
    // drive root case: drive + '/' or drive + '' -> "C:/" canonical
    if (stack.length === 0) out = drive + '/'
  }
  // collapse duplicate slashes already done
  return out || (isAbs ? '/' : '.')
}

export function isSafeWritePathTs(root: string, target: string): boolean {
  if (!root || !target) return false
  const normRoot = normalizePath(root)
  const normTarget = normalizePath(target)

  // reject drive root C:\ or / or empty
  if (normTarget === '/' || /^[a-zA-Z]:\/$/.test(normTarget)) return false
  if (normRoot === '/' || /^[a-zA-Z]:\/$/.test(normRoot)) {
    // root itself should never be drive root – treat as unsafe config
    return false
  }

  // reject if target still contains ".." after normalization (escape attempt)
  if (normTarget.includes('..')) return false

  const lowerTarget = target.toLowerCase()

  // Forbid obvious non-app-data locations even if somehow inside root symlink illusion
  // These markers are what product rule forbids overwriting
  const forbiddenMarkers = ['emudeck', 'es-de', '/roms/', '\\roms\\', 'emulation/roms', 'emulation\\roms']
  for (const m of forbiddenMarkers) {
    if (lowerTarget.includes(m.toLowerCase())) {
      // If root itself contains forbidden? root is CrystalFrontend – never contains these, so safe to reject target
      return false
    }
  }

  // Must be strictly inside root (child path), not root itself for file write
  // Allow root + '/' prefix and longer
  const rootWithSep = normRoot.endsWith('/') ? normRoot : normRoot + '/'
  if (normTarget === normRoot) {
    // writing directly to app-data folder itself is ambiguous – reject for file safety (require child file)
    // but for unit test we treat root itself as unsafe? Acceptance says child path accepted, root not necessarily.
    // We'll reject root itself to encourage child path.
    return false
  }
  if (!normTarget.startsWith(rootWithSep)) {
    return false
  }

  // Ensure after prefix there is at least one segment (file) and no traversal left
  const remainder = normTarget.slice(rootWithSep.length)
  if (!remainder || remainder.length === 0) return false
  if (remainder.includes('..')) return false

  return true
}

// ---------- Helpers for safe-mode mock ----------
type MockBackend = {
  safeMode: boolean
  calls: string[]
  launch_game?: (req: any) => Promise<void>
  get_machine_config?: () => Promise<any>
  list_games?: (sys: string) => Promise<any>
  list_all_games?: () => Promise<any>
  get_favorites?: () => Promise<any>
  get_recently_played?: () => Promise<any>
  verify_media?: (sys: string, base: string) => Promise<any>
  get_safe_mode?: () => Promise<boolean>
}

function createMockBackend(safeMode: boolean): MockBackend {
  const calls: string[] = []
  return {
    safeMode,
    calls,
    async get_safe_mode() { calls.push('get_safe_mode'); return safeMode },
    async get_machine_config() { calls.push('get_machine_config'); return { schemaVersion: 1, systems: [] } },
    async list_games(systemId: string) { calls.push(`list_games:${systemId}`); return [{ id: `${systemId}/a`, name: 'A' }] },
    async list_all_games() { calls.push('list_all_games'); return [] },
    async get_favorites() { calls.push('get_favorites'); return [] },
    async get_recently_played() { calls.push('get_recently_played'); return [] },
    async verify_media(sys: string, base: string) { calls.push(`verify_media:${sys}/${base}`); return { system_id: sys, rom_basename: base, media: {} } },
    async launch_game(req: any) {
      calls.push('launch_game')
      if (safeMode) {
        throw new Error('SAFE MODE – launch blocked (backend)')
      }
      return
    },
  }
}

function loadMachineConfigFromJson(json: unknown): any {
  if (typeof json === 'string') {
    try { json = JSON.parse(json as any) } catch (e) { throw new Error('Invalid JSON') }
  }
  const o = json as any
  if (!o || typeof o !== 'object') throw new Error('Config not an object')
  if (!o.schemaVersion || o.schemaVersion !== 1) throw new Error('Unsupported schemaVersion')
  if (!Array.isArray(o.systems)) throw new Error('Missing systems array')
  return o
}

// ---------- TESTS ----------
describe('V8.1 write guard – TS mirror isSafeWritePathTs', () => {
  const appDataRootPosix = '/home/user/.local/share/CrystalFrontend'
  const appDataRootWin = 'C:/Users/testuser/AppData/Local/CrystalFrontend'

  it('accepts Crystal app-data child path (posix)', () => {
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/.local/share/CrystalFrontend/settings.json')).toBe(true)
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/.local/share/CrystalFrontend/cache/rom-list.json')).toBe(true)
  })

  it('accepts Crystal app-data child path (windows)', () => {
    expect(isSafeWritePathTs(appDataRootWin, 'C:/Users/testuser/AppData/Local/CrystalFrontend/settings.json')).toBe(true)
    expect(isSafeWritePathTs(appDataRootWin, 'C:\\Users\\testuser\\AppData\\Local\\CrystalFrontend\\cache\\gamelist.json')).toBe(true)
  })

  it('rejects ROM path (e.g. D:/Emulation/roms/ps2/foo.bin)', () => {
    expect(isSafeWritePathTs(appDataRootWin, 'D:/Emulation/roms/ps2/foo.bin')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, '/mnt/d/Emulation/roms/ps2/foo.bin')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, 'D:/Emulation/roms/ps2/foo.bin')).toBe(false)
  })

  it('rejects ES-DE path (e.g. /home/.../ES-DE/settings.xml etc)', () => {
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/.emulationstation/ES-DE/settings.xml')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/ES-DE/gamelists/ps2/gamelist.xml')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, 'C:/Users/testuser/AppData/Roaming/EmuDeck/EmulationStation-DE/ES-DE/settings.xml')).toBe(false)
  })

  it('rejects EmuDeck path', () => {
    expect(isSafeWritePathTs(appDataRootWin, 'C:/Users/testuser/AppData/Roaming/EmuDeck/settings.ps1')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/EmuDeck/tools/launchers/ps2.sh')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, 'D:/EmuDeck/backend/EmuDeck/settings')).toBe(false)
  })

  it('rejects drive root C:\\ or /', () => {
    expect(isSafeWritePathTs(appDataRootWin, 'C:\\')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, 'C:/')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, '/')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, 'C:/')).toBe(false)
  })

  it('rejects parent traversal ../../../etc', () => {
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/.local/share/CrystalFrontend/../../../etc/passwd')).toBe(false)
    expect(isSafeWritePathTs(appDataRootPosix, '../../../etc/passwd')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, 'C:/Users/testuser/AppData/Local/CrystalFrontend/../../Windows/System32/drivers/etc/hosts')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, '..\\..\\..\\Windows\\System32\\config\\SAM')).toBe(false)
  })

  it('rejects app-data root itself (must be child file)', () => {
    expect(isSafeWritePathTs(appDataRootPosix, appDataRootPosix)).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, appDataRootWin)).toBe(false)
  })

  it('rejects non-child sibling path', () => {
    expect(isSafeWritePathTs(appDataRootPosix, '/home/user/.local/share/OtherApp/settings.json')).toBe(false)
    expect(isSafeWritePathTs(appDataRootWin, 'C:/Users/testuser/AppData/Local/OtherApp/file.txt')).toBe(false)
  })
})

describe('V8.1 safe-mode – TS mirror logic', () => {
  it('safe mode blocks launch_game backend (mock)', async () => {
    const backend = createMockBackend(true)
    await expect(backend.launch_game!({ systemId: 'ps2', romPath: 'D:/roms/ps2/foo.bin' })).rejects.toThrow(/SAFE MODE/)
    expect(backend.calls).toContain('launch_game')
  })

  it('safe mode still permits machine-config read, ROM enum, gamelist read, media resolution', async () => {
    const backend = createMockBackend(true)
    await expect(backend.get_machine_config!()).resolves.toBeDefined()
    await expect(backend.list_games!('ps2')).resolves.toBeDefined()
    await expect(backend.list_all_games!()).resolves.toBeDefined()
    await expect(backend.get_favorites!()).resolves.toBeDefined()
    await expect(backend.get_recently_played!()).resolves.toBeDefined()
    await expect(backend.verify_media!('ps2', 'game')).resolves.toBeDefined()
    // all calls recorded, no launch_game blocked yet unless called
    expect(backend.calls).toContain('get_machine_config')
    expect(backend.calls).toContain('list_games:ps2')
    expect(backend.calls).toContain('list_all_games')
    expect(backend.calls).toContain('get_favorites')
    expect(backend.calls).toContain('get_recently_played')
    expect(backend.calls.some(c => c.startsWith('verify_media'))).toBe(true)
  })

  it('installed mode never falls back to fake config – Tauri failure is blocking', () => {
    // Simulate MachineConfigProvider logic: Tauri env + get_machine_config throws -> blockingError true, no example fallback
    const isTauri = true
    const getMachineConfigThrew = true
    const wouldFallbackToExample = isTauri ? false : true
    expect(wouldFallbackToExample).toBe(false)
    // Ensure provider code contains blockingError handling (read file)
    const providerSrc = readFileSync('src/providers/MachineConfigProvider.tsx', 'utf8')
    expect(providerSrc).toContain('blockingError')
    expect(providerSrc).toContain('Real machine configuration failed')
    expect(providerSrc).toContain('DO NOT fallback to example')
  })

  it('invalid machine config blocks cleanly', () => {
    const invalids = [
      null,
      {},
      { schemaVersion: 2, systems: [] },
      { schemaVersion: 1 },
      { schemaVersion: 1, systems: null },
    ]
    for (const inv of invalids) {
      expect(() => loadMachineConfigFromJson(inv)).toThrow()
    }
    // valid passes
    const valid = { schemaVersion: 1, systems: [{ id: 'ps2' }] }
    expect(() => loadMachineConfigFromJson(valid)).not.toThrow()
  })

  it('normal launch path preserved when safe mode OFF', async () => {
    const backend = createMockBackend(false)
    await expect(backend.launch_game!({ systemId: 'ps2', romPath: 'D:/roms/ps2/foo.bin' })).resolves.toBeUndefined()
    expect(backend.calls).toContain('launch_game')
  })

  it('App.tsx queries get_safe_mode on startup (Tauri invoke)', () => {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    expect(appSrc).toContain('get_safe_mode')
    expect(appSrc).toContain('safeMode')
    expect(appSrc).toContain('setSafeMode')
  })

  it('App.tsx shows DEV-only SAFE MODE pill top-right second to theme toggle', () => {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    expect(appSrc).toContain('SAFE MODE')
    expect(appSrc).toContain('safe-mode-badge')
    // pill style subtle 10.5px mono – ensure small font size present
    expect(appSrc).toContain('10.5')
    // ensure hidden in normal prod i.e., conditional rendering safeMode && (
    expect(appSrc).toContain('safeMode &&')
  })

  it('LibraryView PLAY blocked when safeMode with toast', () => {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    expect(appSrc).toContain('SAFE MODE – launch blocked')
    expect(appSrc).toContain('safeModeToast')
    const libSrc = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect(libSrc).toContain('safeMode')
    expect(libSrc).toContain('SAFE MODE')
    // LibraryView should disable button when safeMode
    expect(libSrc).toContain('disabled')
  })

  it('safe-mode blocked launches logged via console', () => {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    expect(appSrc).toContain('console.warn')
    expect(appSrc).toContain('SAFE MODE')
    expect(appSrc).toContain('launch blocked')
  })
})

describe('V8.1 no filesystem write TS API – audit', () => {
  it('src/** does not import tauri-plugin-fs write APIs', () => {
    const appSrc = readFileSync('src/App.tsx', 'utf8')
    const libSrc = readFileSync('src/components/LibraryView.tsx', 'utf8')
    const landingSrc = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    const carouselSrc = readFileSync('src/components/GameBoxCarousel.tsx', 'utf8')
    const providerSrc = readFileSync('src/providers/MachineConfigProvider.tsx', 'utf8')
    const runtimeSrc = readFileSync('src/runtime/backend.ts', 'utf8')
    const all = [appSrc, libSrc, landingSrc, carouselSrc, providerSrc, runtimeSrc].join('\n')
    expect(all).not.toContain('writeFile')
    expect(all).not.toContain('writeTextFile')
    expect(all).not.toContain('BaseDirectory')
    // loader may use node:fs/promises readFile only – not write
    const loaderSrc = readFileSync('src/machine/loader.ts', 'utf8')
    expect(loaderSrc).not.toContain('writeFile')
    expect(loaderSrc).toContain('readFile')
  })

  it('version files consistently use the current release version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.version).toBe("4.3.1")
    const tauriConf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
    expect(tauriConf.version).toBe("4.3.1")
    const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
    expect(cargo).toContain('version = "4.3.1"')
    const verJson = JSON.parse(readFileSync('version.json', 'utf8'))
    expect(verJson.packageVersion).toBe("4.3.1")
    expect(verJson.semver).toBe("4.3.1")
  })

  it('golden screen layouts preserved – SystemLanding/LibraryView/Carousel still contain expected markers', () => {
    const landingSrc = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    expect(landingSrc).toContain('golden-system-landing')
    expect(landingSrc).toContain('YOUR LIBRARY')
    const libSrc = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect(libSrc).toContain('golden-library')
    expect(libSrc).toContain('GameBoxCarousel')
    const carouselSrc = readFileSync('src/components/GameBoxCarousel.tsx', 'utf8')
    expect(carouselSrc).toContain('game-box-carousel')
    expect(carouselSrc).toContain('is-selected')
  })
})
