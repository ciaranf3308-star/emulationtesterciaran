import { describe, test, expect } from 'bun:test'
import { getExpectedRelPath, isSafeCachePath } from '../../src/discovery/cache'

// Regression coverage proving Discovery cache location is under existing Crystal writable root
// Frontend enforces cache/discovery/* only; Rust side enforces crystal_writable_root guard.

describe('discovery cache root regression V8.4.1', () => {
  test('expected rel path always under cache/discovery/', () => {
    const keys = [
      'vimms:ps2:mario',
      'vimms:gbc:__empty__',
      'vimms:detail:9008377360493797128',
      'vimms:gc:f-zero',
      'vimms:ps2:f-zero-gx',
    ]
    for (const k of keys) {
      const rel = getExpectedRelPath(k)
      expect(rel).not.toBeNull()
      expect(rel!.startsWith('cache/discovery/')).toBe(true)
      expect(rel!.endsWith('.json')).toBe(true)
      expect(isSafeCachePath(rel!)).toBe(true)
    }
  })

  test('cache path never contains traversal or AppLocalData assumption', () => {
    const badKeys = [
      'vimms:..:evil',
      'vimms:ps2:bad/../evil',
      '../evil',
      'vimms:ps2:slash/evil',
      'vimms:ps2:back\\slash',
      'vimms::empty',
      ':leading',
      'trailing:',
      'vimms:ps2:space evil',
    ]
    for (const k of badKeys) {
      const rel = getExpectedRelPath(k as any)
      expect(rel).toBeNull()
    }
    // safe path checks reject traversal tricks even if presented directly
    expect(isSafeCachePath('cache/discovery/../evil.json')).toBe(false)
    expect(isSafeCachePath('cache/discovery/evil/../../etc.json')).toBe(false)
    expect(isSafeCachePath('/absolute/path/cache/discovery/vimms.json')).toBe(false)
    expect(isSafeCachePath('C:\\CrystalFrontend\\cache\\discovery\\vimms.json')).toBe(false)
    expect(isSafeCachePath('cache/discovery/evil.zip')).toBe(false) // must be json only
  })

  test('discovery cache does not allow EmuDeck/ES-DE/ROM external writes mimic', () => {
    // Our guard rejects any relPath mentioning emudeck etc, even if somehow passed via key sanitization bypass
    const externalTricks = [
      'cache/discovery/EmuDeck/roms/evil.json',
      'cache/discovery/es-de/cache.json',
      'cache/discovery/emulationstation/evil.json',
    ]
    for (const p of externalTricks) {
      expect(isSafeCachePath(p)).toBe(false)
    }
  })

  test('sanitized mapping colon -> slash keeps file under root', () => {
    // Prove colon replacement keeps hierarchy inside discovery
    const key = 'vimms:ps2:twisted_metal'
    const rel = getExpectedRelPath(key)!
    expect(rel).toBe('cache/discovery/vimms/ps2/twisted_metal.json')
    // Ensure no absolute root, no drive
    expect(rel.includes('com.crystal.frontend')).toBe(false)
    expect(rel.toLowerCase().includes('appadata')).toBe(false)
    // Must be exactly cache/discovery + provider/system/query pattern
    const parts = rel.replace('cache/discovery/', '').replace('.json', '').split('/')
    expect(parts.length).toBe(3)
    expect(parts[0]).toBe('vimms')
    expect(parts[1]).toBe('ps2')
    expect(parts[2]).toBe('twisted_metal')
  })
})
