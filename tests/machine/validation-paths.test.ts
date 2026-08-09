import { describe, test, expect } from 'bun:test'
import { isValidRomDirectory, validateMachineConfig } from '../../src/machine/validation'
import { makeValidSystem, makeValidConfig } from '../helpers/factory'

describe('isValidRomDirectory – Windows absolute tolerant', () => {
  test('valid Windows backslash passes', () => {
    expect(isValidRomDirectory('D:\\Emulation\\roms\\ps2')).toBe(true)
    expect(isValidRomDirectory('C:\\Users\\TestUser\\roms\\gc')).toBe(true)
    expect(isValidRomDirectory('E:\\roms\\gba')).toBe(true)
    // lower case drive should pass (case-insensitive)
    expect(isValidRomDirectory('d:\\emulation\\roms\\ps2')).toBe(true)
  })

  test('valid Windows forward-slash passes', () => {
    expect(isValidRomDirectory('D:/Emulation/roms/ps2')).toBe(true)
    expect(isValidRomDirectory('C:/Emulation/roms/gc')).toBe(true)
    expect(isValidRomDirectory('D:/Emulation/storage/downloaded_media')).toBe(true)
    expect(isValidRomDirectory('d:/emulation/roms/ps2')).toBe(true)
  })

  test('invalid relative fails', () => {
    expect(isValidRomDirectory('roms')).toBe(false)
    expect(isValidRomDirectory('ps2')).toBe(false)
    expect(isValidRomDirectory('Emulation/roms/ps2')).toBe(false)
    expect(isValidRomDirectory('./roms/ps2')).toBe(false)
    expect(isValidRomDirectory('relative\\path\\ps2')).toBe(false)
  })

  test('empty fails', () => {
    expect(isValidRomDirectory('')).toBe(false)
    expect(isValidRomDirectory('   ')).toBe(false)
    // @ts-expect-error testing runtime guard
    expect(isValidRomDirectory(null as any)).toBe(false)
    // @ts-expect-error
    expect(isValidRomDirectory(undefined as any)).toBe(false)
  })

  test('malformed fails', () => {
    expect(isValidRomDirectory(':\\Emulation')).toBe(false)
    expect(isValidRomDirectory('D:')).toBe(false)
    expect(isValidRomDirectory(':')).toBe(false)
    expect(isValidRomDirectory('D')).toBe(false)
    expect(isValidRomDirectory(':Emulation\\roms')).toBe(false)
    expect(isValidRomDirectory('\\Emulation\\roms')).toBe(false)
    expect(isValidRomDirectory('/Emulation/roms')).toBe(false)
  })
})

describe('validateMachineConfig uses tolerant romDirectory', () => {
  test('valid backslash config passes', () => {
    const s1 = makeValidSystem('ps2', 'D:\\Emulation\\roms\\ps2')
    const cfg = makeValidConfig([s1 as any])
    const result = validateMachineConfig(cfg)
    expect(result.ok).toBe(true)
  })

  test('valid forward-slash config passes', () => {
    const s1 = makeValidSystem('ps2', 'D:/Emulation/roms/ps2')
    const cfg = makeValidConfig([s1 as any])
    const result = validateMachineConfig(cfg)
    expect(result.ok).toBe(true)
  })

  test('relative romDirectory fails validation', () => {
    const s1 = makeValidSystem('ps2', 'roms/ps2')
    const cfg = makeValidConfig([s1 as any])
    const result = validateMachineConfig(cfg)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.path.includes('romDirectory'))).toBe(true)
    }
  })

  test('empty romDirectory fails validation', () => {
    const s1 = makeValidSystem('ps2', '')
    const cfg = makeValidConfig([s1 as any])
    const result = validateMachineConfig(cfg)
    expect(result.ok).toBe(false)
  })

  test('malformed romDirectory fails validation', () => {
    const bad1 = makeValidSystem('ps2', ':\\Emulation')
    const cfg1 = makeValidConfig([bad1 as any])
    expect(validateMachineConfig(cfg1).ok).toBe(false)

    const bad2 = makeValidSystem('ps2', 'D:')
    const cfg2 = makeValidConfig([bad2 as any])
    expect(validateMachineConfig(cfg2).ok).toBe(false)
  })
})
