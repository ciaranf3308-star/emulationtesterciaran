import { describe, test, expect } from 'bun:test'
import { resolveLaunchRequest } from '../../src/launcher/resolver'
import { isLaunchReady, getCapabilitiesForTemplate } from '../../src/launcher/capability'
import type { MachineConfig } from '../../src/machine/types'

/** Minimal config factory – sanitized excerpts, structurally realistic only */

function makeSystem(id: string, fullName: string, cmds: any[]) {
  return {
    id,
    fullName,
    configSource: 'example/bundled',
    configOrigin: 'example',
    romDirectory: `D:/Emulation/roms/${id}`,
    extensionString: '.iso',
    validExtensions: ['.iso'],
    matchingRomFileCount: 1,
    commands: cmds,
    launchSelection: { selectedLabel: cmds[0].label, rule: 'example/system-level', status: 'STATICALLY_RESOLVED', source: 'example/gamelists', systemAlternativeLabel: cmds[0].label, perGameOverrideCount:0, perGameOverrides:[] },
    media: {} as any,
    metadata: {} as any,
  }
}

function baseCmd(label: string, template: string, findRules: any[] = []) {
  return {
    label,
    template,
    workingDirectoryTemplate: null,
    isFirstConfiguredCommand: true,
    findRules,
    identifiers: { emulatorIdentifiers:[], coreFiles:[], corePathIdentifiers:[] }
  }
}

function fr(id: string, kind:'emulator'|'core') {
  return { identifier:id, kind, rules:[{ type:'staticpath', entries:[`%ESPATH%\\Emulators\\${id}\\bin.exe`] }], source:'example/es_find_rules.xml' }
}

function makeConfig(): MachineConfig {
  return {
    schemaVersion:1,
    populatedSystemCount:5,
    generatedAt:new Date().toISOString(),
    roots:{ rom:'D:/Emulation/roms/', gamelists:'D:/Emulation/gamelists', scrapedMedia:'D:/Emulation/storage/downloaded_media' },
    authoritativeFiles:{},
    systems:[
      // PS2 – typical RetroArch PCSX2
      makeSystem('ps2','Sony PlayStation 2',[
        baseCmd('LRPS2','%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\pcsx2_libretro.dll %ROM%',[fr('RETROARCH','emulator'), fr('RETROARCH','core')]),
        baseCmd('PCSX2 (Standalone)','%EMULATOR_PCSX2% -batch %ROM%',[fr('PCSX2','emulator')])
      ]),
      // GameCube – Dolphin
      makeSystem('gc','Nintendo GameCube',[
        baseCmd('Dolphin','%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\dolphin_libretro.dll %ROM%',[fr('RETROARCH','emulator')]),
        baseCmd('Dolphin (Standalone)','%EMULATOR_DOLPHIN% -b -e %ROM%',[fr('DOLPHIN','emulator')])
      ]),
      // Xbox – xemu verbatim preservation test
      makeSystem('xbox','Microsoft Xbox',[
        baseCmd('xemu (Standalone)','%STARTDIR%=%EMUDIR% %EMULATOR_XEMU% -dvd_path %ROM%',[fr('XEMU','emulator')])
      ]),
      // Xbox 360 – Xenia + INJECT (must block)
      makeSystem('xbox360','Microsoft Xbox 360',[
        baseCmd('xenia (Standalone)','%STARTDIR%=%EMUDIR% %EMULATOR_XENIA% %INJECT%=%BASENAME%.commands %ROM%',[fr('XENIA','emulator')]),
        baseCmd('Shortcut or script','%HIDEWINDOW% %ESCAPESPECIALS% %EMULATOR_OS-SHELL% /C %ROM%',[fr('OS','emulator')])
      ]),
      // Steam – EMULATOR_OS-SHELL + modifiers (must block)
      makeSystem('steam','Steam',[
        baseCmd('Steam (Standalone)','%HIDEWINDOW% %ESCAPESPECIALS% %RUNINBACKGROUND% %EMULATOR_OS-SHELL% /C %ROM%',[fr('STEAM','emulator')])
      ]),
    ]
  } as any as MachineConfig
}

describe('sanitized template realism', ()=>{
  test('PS2 / PCSX2 RetroArch template ready', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\Emulation\\roms\\ps2\\Game.iso', selectedCommandLabel:'LRPS2' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backendRequest.commandTemplate).toBe('%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\pcsx2_libretro.dll %ROM%')
      const ready = isLaunchReady(res.backendRequest.commandTemplate)
      expect(ready.ready).toBe(true)
    }
  })

  test('GameCube / Dolphin sanitized realistic ready', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'gc', romPath:'D:/Emulation/roms/gc/game.iso', selectedCommandLabel:'Dolphin (Standalone)' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backendRequest.commandTemplate).toBe('%EMULATOR_DOLPHIN% -b -e %ROM%')
      expect(isLaunchReady(res.backendRequest.commandTemplate).ready).toBe(true)
    }
  })

  test('Xbox / xemu template preserved verbatim – no simplification, no invented path', ()=>{
    const cfg = makeConfig()
    const template = '%STARTDIR%=%EMUDIR% %EMULATOR_XEMU% -dvd_path %ROM%'
    const res = resolveLaunchRequest(cfg, { systemId:'xbox', romPath:'D:\\Emulation\\roms\\xbox\\halo.iso', selectedCommandLabel:'xemu (Standalone)' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backendRequest.commandTemplate).toBe(template)
      expect(res.backendRequest.commandTemplate).toContain('%STARTDIR%=%EMUDIR%')
      expect(res.backendRequest.commandTemplate).toContain('%EMULATOR_XEMU%')
      // ensure we did not invent path
      expect(res.backendRequest.commandTemplate).not.toContain('/usr/bin')
    }
  })

  test('Xbox360 Xenia + INJECT blocked, ok:false, reason contains INJECT, template preserved exactly', ()=>{
    const cfg = makeConfig()
    const template = '%STARTDIR%=%EMUDIR% %EMULATOR_XENIA% %INJECT%=%BASENAME%.commands %ROM%'
    const res = resolveLaunchRequest(cfg, { systemId:'xbox360', romPath:'D:\\Emulation\\roms\\xbox360\\Game\\default.xex', selectedCommandLabel:'xenia (Standalone)' } as any)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toContain('INJECT')
      expect(res.unsupported).toContain('INJECT')
      // blocking reason mentions preservation – but at least contains token
      expect(res.reason.toLowerCase()).toContain('inject')
      // template must be preserved verbatim – we can reconstruct via capabilities
      const caps = getCapabilitiesForTemplate(template)
      expect(caps.some(c=>c.token.includes('INJECT'))).toBe(true)
      // Ensure config still holds original verbatim
      const sys = cfg.systems.find(s=>s.id==='xbox360')!
      const cmd = sys.commands.find(c=>c.label==='xenia (Standalone)')!
      expect(cmd.template).toBe(template)
    }
  })

  test('Steam EMULATOR_OS-SHELL + modifiers blocked, reason contains OS-SHELL', ()=>{
    const cfg = makeConfig()
    const template = '%HIDEWINDOW% %ESCAPESPECIALS% %RUNINBACKGROUND% %EMULATOR_OS-SHELL% /C %ROM%'
    const res = resolveLaunchRequest(cfg, { systemId:'steam', romPath:'D:\\steam\\game.lnk', selectedCommandLabel:'Steam (Standalone)' } as any)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason.toUpperCase()).toContain('OS-SHELL')
      expect(res.unsupported?.toUpperCase()).toContain('OS-SHELL')
      // capabilities: modifiers runtimeSupported true, OS-SHELL false
      const caps = getCapabilitiesForTemplate(template)
      const mods = caps.filter(c=>c.category==='modifier')
      expect(mods.length).toBe(3)
      expect(mods.every(c=>c.runtimeSupported)).toBe(true)
      const shell = caps.find(c=>c.category==='shell')
      expect(shell).toBeDefined()
      expect(shell?.runtimeSupported).toBe(false)
    }
  })

  test('selected-label resolution reuse existing resolver logic', ()=>{
    const cfg = makeConfig()
    const res = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\game.iso', selectedCommandLabel:'LRPS2' } as any)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.backendRequest.commandLabel).toBe('LRPS2')
    const res2 = resolveLaunchRequest(cfg, { systemId:'ps2', romPath:'D:\\game.iso', selectedCommandLabel:'DOES_NOT_EXIST' } as any)
    expect(res2.ok).toBe(false)
  })

  test('exact template preservation – no silent fallback, no invented emulator path', ()=>{
    const cfg = makeConfig()
    // Ensure GC template containing %ROM% but not requiring extra
    const res = resolveLaunchRequest(cfg, { systemId:'gc', romPath:'D:/gc/game.gcm' } as any) // defaults to first command Dolphin
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.backendRequest.commandTemplate).toBe('%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\dolphin_libretro.dll %ROM%')
      expect(res.backendRequest.emulatorFindRules.length).toBeGreaterThan(0)
      // backendRequest preserves findRules verbatim, not simplified
      expect(res.backendRequest.findRules).toBeDefined()
    }
  })
})
