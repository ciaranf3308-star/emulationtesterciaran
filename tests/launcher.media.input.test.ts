import { describe, test, expect } from 'bun:test'
import { resolveLaunchRequest, __testables } from '../src/launcher/resolver'
import { expectedMediaPath, resolveMediaCandidates, resolveMediaPath } from '../src/media/resolver'
import { createKeyboardAdapter, keyboardToAction } from '../src/input/keyboard'
import { createGamepadAdapter, ANALOG_DEADZONE, GAMEPAD_INITIAL_DELAY, GAMEPAD_REPEAT_INTERVAL, gamepadButtonToAction } from '../src/input/gamepad'
import type { MachineConfig } from '../src/machine/types'

function makeConfig(): MachineConfig {
  const mk = (id:string, full:string, cmds:any[])=> ({
    id, fullName: full, configSource:'', configOrigin:'', romDirectory:`D:\\Emulation\\roms\\${id}`, extensionString:'.iso', validExtensions:['.iso'],
    matchingRomFileCount:1, commands:cmds, identifiers:{ emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }, emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[],
    launchSelection:{ selectedLabel: cmds[0].label, rule:{ identifier: cmds[0].label.toLowerCase() }, status:'STATICALLY_RESOLVED', source:'', systemAlternativeLabel:'', perGameOverrideCount:0 },
    media:{} as any, metadata:{} as any
  })
  return {
    schemaVersion:1, generatedAt:new Date().toISOString(), populatedSystemCount:3,
    roots:{ rom:'D:\\Emulation\\roms\\', gamelists:'C:\\gamelists', scrapedMedia:'C:\\media' },
    systems: [
      mk('ps2','PlayStation 2', [
        { label:'PCSX2 QT', template:'\"%EMUPATH%\\%EMULATOR_PCSX2%\" -batch -nogui \"%ROM_RAW%\"', workingDirectoryTemplate:'%EMUDIR%', findRules:[{ identifier:'pcsx2', kind:'emulator', rules:[{ type:'staticpath', path:'C:\\Emulators\\pcsx2' }]}], identifiers:{ emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }, description:'' },
        { label:'Alt PCSX2', template:'"%EMULATOR%\" \"%ROM%\"', findRules:[], identifiers:{ emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }, description:'' }
      ]),
      mk('xbox360','Xbox 360', [
        { label:'Xenia Canary', template:'STARTDIR=\"%GAMEDIR%\"; \"%EMULATOR%\" \"%ROM%\"', workingDirectoryTemplate:'', findRules:[{ identifier:'xenia_canary', kind:'emulator', rules:[] }], identifiers:{ emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }, description:'' }
      ]),
      mk('steam','Steam', [
        { label:'Steam Shortcut', template:'%OS-SHELL% \"%ROM%\"', workingDirectoryTemplate:'', findRules:[], identifiers:{ emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }, description:'' }
      ]),
    ]
  } as MachineConfig
}

describe('launch domain', ()=>{
  test('preserves commandTemplate verbatim', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\Emulation\\roms\\ps2\\Game.iso' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backendRequest.commandTemplate).toContain('%ROM_RAW%')
    }
  })

  test('Xbox 360 unusual template preserved', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'xbox360', romPath:'D:\\Emulation\\roms\\xbox360\\Game\\default.xex' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.backendRequest.commandTemplate).toContain('STARTDIR')
  })

  test('placeholders extracted', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\path' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) {
      const present = (res.backendRequest as any).placeholdersPresent as string[]
      expect(present.some(p=>p.includes('ROM'))).toBe(true)
    }
  })

  test('%OS-SHELL% marked unsupported', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'steam', romPath:'D:\\steam\\game.lnk' } as any)
    // Our resolver marks unknown placeholders unsupported -> ok false
    expect(res.ok).toBe(false)
    if (!res.ok) expect((res as any).reason?.toLowerCase().includes('unsupported') || (res as any).unsupported).toBeTruthy()
  })

  test('selected label resolution', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\game.iso', selectedCommandLabel:'PCSX2 QT' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.backendRequest.commandLabel).toBe('PCSX2 QT')
  })

  test('unknown selected command returns ok false not throw', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\game.iso', selectedCommandLabel:'DOES_NOT_EXIST' } as any)
    expect(res.ok).toBe(false)
  })
})

describe('media resolver', ()=>{
  test('expectedMediaPath positional', ()=>{
    // signature: (mediaRoot, systemId, mediaType, romBasename, extensionHint)
    const p = expectedMediaPath('C:\\Emulation\\storage\\downloaded_media', 'ps2', 'covers' as any, 'Kingdom Hearts', '.jpg')
    expect(p).toContain('ps2')
    expect(p).toContain('covers')
    expect(p).toContain('Kingdom Hearts')
  })

  test('resolveMediaPath primary', ()=>{
    const p = resolveMediaPath('C:\\media', 'ps2', 'covers' as any, 'Kingdom Hearts')
    expect(p).toContain('covers')
  })

  test('resolveMediaCandidates exceptionSamples', ()=>{
    const category = { directory:'C:\\media\\n64\\covers', exists:true, fileCount:10, directRomBasenameMatches:8, nonDirectBasenameCount:2, filenamePattern:'', exceptionSamples:['SM64','Super Mario 64 (USA)'] } as any
    const cand = resolveMediaCandidates({ mediaRoot:'C:\\media', systemId:'n64' } as any, 'covers' as any, 'Super Mario 64', category)
    expect(cand.primaryPath).toContain('Super Mario 64')
    // alternatives should include exceptionSamples or extra ext candidates
    expect(cand.alternatives.length + 1).toBeGreaterThan(1)
  })
})

describe('input architecture', ()=>{
  test('keyboardToAction arrow mapping', ()=>{
    const e = { key:'ArrowUp', code:'ArrowUp' } as any
    expect(keyboardToAction(e)).toBe('up')
    expect(keyboardToAction({ key:'Enter', code:'Enter' } as any)).toBe('confirm')
    expect(keyboardToAction({ key:'Tab', code:'Tab' } as any)).toBeNull()
  })

  test('keyboard shortcuts do not consume text-field typing', ()=>{
    const input = { tagName: 'INPUT', isContentEditable: false }
    expect(keyboardToAction({ key:'a', code:'KeyA', target: input } as any)).toBeNull()
    expect(keyboardToAction({ key:'m', code:'KeyM', target: input } as any)).toBeNull()
  })

  test('gamepad constants deadzone repeat', ()=>{
    expect(ANALOG_DEADZONE).toBe(0.25)
    expect(GAMEPAD_INITIAL_DELAY).toBe(400)
    expect(GAMEPAD_REPEAT_INTERVAL).toBe(120)
  })

  test('gamepad button mapping', ()=>{
    expect(gamepadButtonToAction(0)).toBe('confirm')
    expect(gamepadButtonToAction(1)).toBe('back')
    expect(gamepadButtonToAction(12)).toBe('up')
    expect(gamepadButtonToAction(15)).toBe('right')
    expect(gamepadButtonToAction(4)).toBe('previousSystem')
    expect(gamepadButtonToAction(5)).toBe('nextSystem')
  })

  test('adapters start/stop existence', ()=>{
    const ka = createKeyboardAdapter(()=>{})
    expect(typeof ka.start).toBe('function')
    ka.stop()
    const ga = createGamepadAdapter(()=>{})
    expect(typeof ga.start).toBe('function')
    ga.stop()
  })
})

describe('metadata domain', ()=>{
  test('parser supports required fields', async ()=>{
    const { parseGamelistXml } = await import('../src/metadata/parser')
    const xml = `<?xml version=\"1.0\"?><gameList><game><name>Test Game</name><desc>Desc</desc><developer>Dev</developer><publisher>Pub</publisher><genre>Action</genre><players>2</players><rating>0.8</rating><firstReleaseDate>20200101T000000</firstReleaseDate><favorite>true</favorite><playcount>5</playcount><lastplayed>20240202T123456</lastplayed><playtime>120</playtime></game></gameList>`
    const parsed = parseGamelistXml(xml)
    expect(parsed[0].name).toBe('Test Game')
    expect(parsed[0].favorite).toBe(true)
    expect(parsed[0].playCount).toBe(5)
  })

  test('getFavorites / getRecentlyPlayed', async ()=>{
    const { getFavorites, getRecentlyPlayed } = await import('../src/metadata/parser')
    const games = [{ name:'A', favorite:true, lastPlayed:'20240101' }, { name:'B', favorite:false, lastPlayed:'20250101' }, { name:'C', favorite:true }] as any
    expect(getFavorites(games).length).toBe(2)
    expect(getRecentlyPlayed(games,1)[0].name).toBe('B')
  })
})
