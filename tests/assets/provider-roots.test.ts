import { describe, test, expect } from 'bun:test'
import { ComposableAssetResolver, mergeAssetSets } from '../../src/assets/resolver'
import type { ThemeAssetSet } from '../../src/assets/types'

const CRYSTAL_BASE = '/assets/Crystal-Frontend-Asset-Pack'
const HARDWARE_BASE = '/assets/hardware'

const crystalManifest: ThemeAssetSet = {
  ps2: {
    backgroundDark: 'backgrounds/dark/ps2.webp',
    backgroundLight: 'backgrounds/light/ps2.png',
    logoDark: 'logos/dark/ps2.png',
    carouselIcon: 'carousel-icons/ps2.webp',
  } as any,
  genesis: { backgroundDark: 'backgrounds/dark/genesis.webp', logoDark: 'logos/dark/genesis.png' } as any,
  megadrive: { backgroundDark: 'backgrounds/dark/megadrive.webp', logoDark: 'logos/dark/megadrive.png' } as any,
  _default: { backgroundDark: 'backgrounds/dark/_default.webp', logoDark: 'logos/dark/_default.png' } as any,
} as any

const hardwareManifest: ThemeAssetSet = {
  ps2: {
    hardwareForeground: 'hardware/ps2/fg.png',
    screenMask: 'masks/ps2/screen.png',
    slotMask: 'masks/ps2/slot.png',
  } as any,
  _default: {
    hardwareForeground: 'hardware/_default/fg.png',
  } as any,
} as any

const hardwareOverridePs2Bg: ThemeAssetSet = {
  ps2: {
    backgroundDark: 'overrides/ps2-custom.webp',
  } as any,
} as any

describe('provider-specific roots composition', () => {
  test('crystal background stays crystal-rooted, hardware fg stays hardware-rooted', () => {
    const r = new ComposableAssetResolver(crystalManifest)
    r.mergeProvider(hardwareManifest, 'hardware', HARDWARE_BASE)

    const ps2dark = r.getThemeAssetsForSystem('ps2', 'dark')
    expect(ps2dark.background).toBe(`${CRYSTAL_BASE}/backgrounds/dark/ps2.webp`)
    expect(ps2dark.hardwareForeground).toBe(`${HARDWARE_BASE}/hardware/ps2/fg.png`)
    expect(ps2dark.screenMask).toBe(`${HARDWARE_BASE}/masks/ps2/screen.png`)
    expect(ps2dark.slotMask).toBe(`${HARDWARE_BASE}/masks/ps2/slot.png`)
    // origin tracking
    expect(ps2dark.origins?.background?.providerId).toBe('crystal')
    expect(ps2dark.origins?.hardwareForeground?.providerId).toBe('hardware')
    expect(ps2dark.origins?.background?.baseRoot).toBe(CRYSTAL_BASE)
    expect(ps2dark.origins?.hardwareForeground?.baseRoot).toBe(HARDWARE_BASE)
  })

  test('per-field override works – hardware can override crystal background with its own root', () => {
    const r = new ComposableAssetResolver(crystalManifest)
    r.mergeProvider(hardwareManifest, 'hardware', HARDWARE_BASE)
    r.mergeProvider(hardwareOverridePs2Bg, 'hardware', HARDWARE_BASE)

    const ps2 = r.getThemeAssetsForSystem('ps2', 'dark')
    expect(ps2.background).toBe(`${HARDWARE_BASE}/overrides/ps2-custom.webp`)
    expect(ps2.origins?.background?.providerId).toBe('hardware')
    expect(ps2.carouselIcon).toBe(`${CRYSTAL_BASE}/carousel-icons/ps2.webp`) // unchanged crystal
  })

  test('missing graceful – no throw, undefined returned', () => {
    const r = new ComposableAssetResolver(crystalManifest)
    r.mergeProvider(hardwareManifest, 'hardware', HARDWARE_BASE)
    const missing = r.getThemeAssetsForSystem('xbox360', 'dark')
    expect(() => r.getThemeAssetsForSystem('xbox360', 'dark')).not.toThrow()
    expect(missing.systemId).toBe('xbox360')
    // should fallback to default background if present, else undefined – graceful
    expect(missing.hardwareForeground).toBe(`${HARDWARE_BASE}/hardware/_default/fg.png`)
  })

  test('genesis vs megadrive distinct even with providers', () => {
    const r = new ComposableAssetResolver(crystalManifest)
    r.mergeProvider(hardwareManifest, 'hardware', HARDWARE_BASE)
    const g = r.getThemeAssetsForSystem('genesis', 'dark')
    const m = r.getThemeAssetsForSystem('megadrive', 'dark')
    expect(g.systemId).toBe('genesis')
    expect(m.systemId).toBe('megadrive')
    expect(g.background).toBe(`${CRYSTAL_BASE}/backgrounds/dark/genesis.webp`)
    expect(m.background).toBe(`${CRYSTAL_BASE}/backgrounds/dark/megadrive.webp`)
    expect(g.background).not.toBe(m.background)
  })

  test('mergeAssetSets per-field still works legacy', () => {
    const base: ThemeAssetSet = { ps2: { backgroundDark: '/base/ps2.webp', logoDark: '/base/ps2.png' } } as any
    const over: ThemeAssetSet = { ps2: { logoDark: '/over/ps2.png' } } as any
    const merged = mergeAssetSets(base, over)
    expect((merged as any).ps2.backgroundDark).toBe('/base/ps2.webp')
    expect((merged as any).ps2.logoDark).toBe('/over/ps2.png')
  })
})
