import { describe, test, expect } from 'bun:test'
import { getPlaceholderCapability, getCapabilitiesForTemplate, isLaunchReady } from '../../src/launcher/capability'

describe('placeholder capability mapping', () => {
  test('direct path tokens supported', () => {
    const tokens = ['%ROM%', '%ROM_RAW%', '%BASENAME%', '%GAMEDIR%', '%ROMPATH%', '%EMUDIR%', '%EMUPATH%', '%ESPATH%', '%STARTDIR%']
    for (const t of tokens) {
      const cap = getPlaceholderCapability(t)
      expect(cap.recognized).toBe(true)
      expect(cap.runtimeSupported).toBe(true)
      expect(['rom','path']).toContain(cap.category)
    }
  })

  test('emulator and core supported', () => {
    expect(getPlaceholderCapability('%EMULATOR%').recognized).toBe(true)
    expect(getPlaceholderCapability('%EMULATOR%').runtimeSupported).toBe(true)
    expect(getPlaceholderCapability('%EMULATOR_RETROARCH%').category).toBe('emulator')
    expect(getPlaceholderCapability('%EMULATOR_RETROARCH%').runtimeSupported).toBe(true)
    expect(getPlaceholderCapability('%CORE_RETROARCH%').category).toBe('core')
    expect(getPlaceholderCapability('%CORE_RETROARCH%').runtimeSupported).toBe(true)
  })

  test('%INJECT% is supported by the backend argument-file expander', () => {
    const cap = getPlaceholderCapability('%INJECT%')
    expect(cap.recognized).toBe(true)
    expect(cap.runtimeSupported).toBe(true)
    expect(cap.category).toBe('injection')
    expect(cap.requiresBackendFeature).toBe('argument-file-injection')
  })

  test('OS-SHELL shell family resolves through configured find rules', () => {
    const tokens = ['%EMULATOR_OS-SHELL%', '%OS-SHELL%', '%EMULATOR_OS%']
    for (const t of tokens) {
      const cap = getPlaceholderCapability(t)
      expect(cap.recognized).toBe(true)
      expect(cap.runtimeSupported).toBe(true)
      expect(cap.category).toBe('shell')
    }
  })

  test('modifiers supported', () => {
    for (const t of ['%HIDEWINDOW%', '%ESCAPESPECIALS%', '%RUNINBACKGROUND%']) {
      const cap = getPlaceholderCapability(t)
      expect(cap.recognized).toBe(true)
      expect(cap.runtimeSupported).toBe(true)
      expect(cap.category).toBe('modifier')
    }
  })

  test('unknown placeholder not recognized', () => {
    const cap = getPlaceholderCapability('%FOO%')
    expect(cap.recognized).toBe(false)
    expect(cap.runtimeSupported).toBe(false)
    expect(cap.category).toBe('unsupported')
  })

  test('template capabilities extraction dedupes', () => {
    const tpl = '%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\pcsx2_libretro.dll %ROM%'
    const caps = getCapabilitiesForTemplate(tpl)
    expect(caps.length).toBe(3)
    const tokens = caps.map(c=>c.normalized)
    expect(tokens).toContain('%EMULATOR_RETROARCH%')
    expect(tokens).toContain('%ROM%')
  })

  test('isLaunchReady happy path', () => {
    const ready = isLaunchReady('%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\\pcsx2_libretro.dll %ROM%')
    expect(ready.ready).toBe(true)
    expect(ready.blockingReasons.length).toBe(0)
  })

  test('isLaunchReady supports INJECT', () => {
    const r = isLaunchReady('%STARTDIR%=%EMUDIR% %EMULATOR_XENIA% %INJECT%=%BASENAME%.commands %ROM%')
    expect(r.ready).toBe(true)
    expect(r.blockingReasons).toEqual([])
  })

  test('isLaunchReady supports OS-SHELL with modifiers', () => {
    const r = isLaunchReady('%HIDEWINDOW% %ESCAPESPECIALS% %RUNINBACKGROUND% %EMULATOR_OS-SHELL% /C %ROM%')
    expect(r.ready).toBe(true)
    expect(r.blockingReasons).toEqual([])
    // modifiers themselves are supported
    const modCaps = r.capabilities.filter(c=>c.category==='modifier')
    expect(modCaps.every(c=>c.runtimeSupported)).toBe(true)
  })
})
