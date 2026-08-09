import { describe, test, expect } from 'bun:test'
import { ComposableAssetResolver, mergeAssetSets } from '../src/assets/resolver'
import type { ThemeAssetSet } from '../src/assets/types'

const sampleManifest: ThemeAssetSet = {
  ps2: { backgroundDark:'/assets/dark/ps2.webp', backgroundLight:'/assets/light/ps2.png', logoDark:'/assets/logos/dark/ps2.png', carouselIcon:'/assets/icons/ps2.png' } as any,
  gc: { backgroundDark:'/assets/backgrounds/dark/gc.webp', logoDark:'/assets/logos/dark/gc.png' } as any,
  genesis: { backgroundDark:'/a/genesis-dark.webp', logoDark:'/a/genesis.png', backgroundLight:'/a/genesis-light.webp' } as any,
  megadrive: { backgroundDark:'/a/megadrive-dark.webp', logoDark:'/a/megadrive.png', backgroundLight:'/a/megadrive-light.webp' } as any,
  steam: { backgroundDark:'/a/steam.webp', logoDark:'/a/steam-dark.png', carouselIcon:'/a/steam-icon.png' } as any,
  _default: { backgroundDark:'/a/default-dark.webp', logoDark:'/a/default.png' } as any
} as any

describe('composable asset arch', ()=>{
  test('resolve by system id preserves exact id', ()=>{
    const r = new ComposableAssetResolver(sampleManifest)
    const ps2 = r.getThemeAssetsForSystem('ps2','dark')
    expect(ps2.systemId).toBe('ps2')
    expect(ps2.background).toBeDefined()
  })

  test('genesis vs megadrive distinct', ()=>{
    const r = new ComposableAssetResolver(sampleManifest)
    const g = r.getThemeAssetsForSystem('genesis','dark')
    const m = r.getThemeAssetsForSystem('megadrive','dark')
    expect(g.systemId).toBe('genesis')
    expect(m.systemId).toBe('megadrive')
    expect(g.background).toBe('/a/genesis-dark.webp')
    expect(m.background).toBe('/a/megadrive-dark.webp')
    expect(g.background).not.toBe(m.background)
  })

  test('steam light fallback to dark', ()=>{
    const r = new ComposableAssetResolver(sampleManifest)
    const steamLight = r.getThemeAssetsForSystem('steam','light')
    expect(steamLight.logo).toBeDefined()
    expect(steamLight.logo).toBe('/a/steam-dark.png')
  })

  test('missing artwork graceful', ()=>{
    const r = new ComposableAssetResolver(sampleManifest)
    const miss = r.getThemeAssetsForSystem('xbox360','dark')
    expect(miss.systemId).toBe('xbox360')
    // returns default background if available, else undefined – should not throw
    expect(()=> r.getThemeAssetsForSystem('xbox360','dark')).not.toThrow()
  })

  test('mergeAssetSets per-field override', ()=>{
    const base: ThemeAssetSet = { ps2:{ backgroundDark:'/base/ps2.webp', logoDark:'/base/ps2.png' } } as any
    const over: ThemeAssetSet = { ps2:{ logoDark:'/over/ps2.png' } } as any
    const merged = mergeAssetSets(base, over)
    expect((merged as any).ps2.backgroundDark).toBe('/base/ps2.webp')
    expect((merged as any).ps2.logoDark).toBe('/over/ps2.png')
  })
})
