import { describe, expect, test } from 'bun:test'
import { buildCanonicalSearchUrl, resolveRomsFunSystemSlug } from '../../src/discovery/providers/romsfun/romsfunRoutes'
import { parseRomsFunSearch } from '../../src/discovery/providers/romsfun/parseRomsfunSearch'

describe('ROMsFun live category routes', () => {
  test('maps ES-DE IDs to provider category slugs', () => {
    expect(resolveRomsFunSystemSlug('wiiu')).toBe('wii-u')
    expect(resolveRomsFunSystemSlug('gc')).toBe('gamecube')
    expect(resolveRomsFunSystemSlug('gba')).toBe('game-boy-advance')
    expect(resolveRomsFunSystemSlug('psx')).toBe('playstation')
    expect(resolveRomsFunSystemSlug('ps2')).toBe('playstation-2')
  })

  test('builds category queries with the required trailing slash', () => {
    expect(buildCanonicalSearchUrl('wiiu', 'mario')).toBe('https://romsfun.com/roms/wii-u/?q=mario')
    expect(buildCanonicalSearchUrl('psx', 'Final Fantasy')).toBe('https://romsfun.com/roms/playstation/?q=Final%20Fantasy')
  })

  test('fails closed for an unverified category', () => {
    expect(() => resolveRomsFunSystemSlug('steam')).toThrow(/no verified ROMsFun category/)
  })

  test('parses current absolute first-party result anchors and ignores image duplicates', () => {
    const html = `
      <a href="https://romsfun.com/roms/wii-u/super-mario-3d-world-79320.html"><img src="cover.jpg"></a>
      <a href="https://romsfun.com/roms/wii-u/super-mario-3d-world-79320.html"><span>Super Mario 3D World</span></a>
      <a href="https://romsfun.com/roms/wii-u/mario-kart-8-143664.html">Mario Kart 8</a>
      <a href="https://romsfun.com/roms/wii-u/page/2/?q=mario">2</a>`
    const results = parseRomsFunSearch(html, 'wiiu', 'wii-u')
    expect(results.map(r => r.title)).toEqual(['Super Mario 3D World', 'Mario Kart 8'])
    expect(results[0].providerId).toBe('wii-u/super-mario-3d-world-79320.html')
  })
})
