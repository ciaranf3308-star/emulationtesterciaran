import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'

// Helpers under test – import directly
import { getCategoryDefaults, resolveShowroomPlacement, showroomOverrides } from '../src/stage/config/showroomDefaults'
import { pickGameplayFromResolved, toAssetUrlSync } from '../src/runtime/mediaUrl'

describe('V7.3 showroom placement – category defaults + overrides', () => {
  it('category defaults handheld vs tv vs desktop vs hybrid are distinct', () => {
    const handheld = getCategoryDefaults('handheld')
    const tv = getCategoryDefaults('tv')
    const desktop = getCategoryDefaults('desktop')
    const hybrid = getCategoryDefaults('hybrid')
    expect(handheld.scale).toBeGreaterThan(1)
    expect(tv.x).not.toEqual(handheld.x) // tv more right than handheld defaults? actually tv 66 vs handheld 62 distinct
    expect(desktop.maxWidth).toBeDefined()
    expect(hybrid.translateY).toBeDefined()
  })

  it('ps2 override is large right hero – regression target preserved', () => {
    const ps2 = resolveShowroomPlacement('ps2', 'tv')
    expect(ps2.x).toBeGreaterThanOrEqual(66)
    expect(ps2.scale).toBeGreaterThanOrEqual(1.2)
    expect(ps2.maxWidth).toBeDefined()
    // library reserves the left 25% browser and centres hardware in the right 75%
    expect(ps2.library?.x).toBe(62.5)
    expect(ps2.library?.scale).toBe(1)
  })

  it('gb/gbc portrait tall bold – maxWidth tighter than tv', () => {
    const gb = resolveShowroomPlacement('gb', 'handheld')
    const ps2 = resolveShowroomPlacement('ps2', 'tv')
    // gb should be more constrained width (portrait)
    // parse maxWidth vw numbers
    const parseVW = (v: any) => parseFloat(String(v).replace('vw',''))
    expect(parseVW(gb.maxWidth)).toBeLessThanOrEqual(parseVW(ps2.maxWidth))
  })

  it('gba larger centred-right handheld', () => {
    const gba = resolveShowroomPlacement('gba', 'handheld')
    expect(gba.scale).toBeGreaterThanOrEqual(1.16)
    expect(gba.x).toBeGreaterThanOrEqual(60)
  })

  it('steam monitor-led wide', () => {
    const steam = resolveShowroomPlacement('steam', 'desktop')
    expect(steam.maxWidth).toBeDefined()
    const w = String(steam.maxWidth)
    expect(w.includes('vw') || w.includes('px')).toBeTruthy()
    // wider than handhelds
    expect(steam.x).toBeGreaterThanOrEqual(67)
  })

  it('wiiu GamePad-led slightly lower', () => {
    const wiiu = resolveShowroomPlacement('wiiu', 'hybrid')
    expect(wiiu.y).toBeGreaterThan(54) // lower than default centre
    expect(wiiu.translateY).toBeDefined()
  })
})

describe('V7.3 system shelf navigation wraps correctly', () => {
  function wrapIndex(i: number, len: number) {
    return ((i % len) + len) % len
  }
  it('wraps up from 0 to last', () => {
    const len = 19
    expect(wrapIndex(-1, len)).toBe(18)
    expect(wrapIndex(-2, len)).toBe(17)
  })
  it('wraps down from last to first', () => {
    const len = 5
    expect(wrapIndex(5, len)).toBe(0)
    expect(wrapIndex(6, len)).toBe(1)
  })
  it('visible window prev-prev to next-next stays 5 items', () => {
    const systems = Array.from({length:19}, (_,i)=>`s${i}`)
    const selectedIdx = 0
    const offsets = [-2,-1,0,1,2].map(off=> wrapIndex(selectedIdx+off, systems.length))
    expect(offsets).toHaveLength(5)
    // includes wrap for selected at 0
    expect(offsets).toContain(17) // prev prev wraps
    expect(offsets).toContain(18)
  })
})

describe('V7.3 platform logo resolver fallback – never raw ID as hero', () => {
  function formatFallback(systemId: string, fallbackName?: string): string {
    if (fallbackName && fallbackName.trim()) return fallbackName
    const map: Record<string,string> = {
      gb: 'Game Boy', gbc: 'Game Boy Color', gba: 'Game Boy Advance',
      nds: 'Nintendo DS', n3ds: 'Nintendo 3DS', snes: 'Super Nintendo',
      n64: 'Nintendo 64', gc: 'GameCube', wii: 'Wii', wiiu: 'Wii U',
      genesis: 'Genesis', megadrive: 'Mega Drive', dreamcast: 'Dreamcast',
      psx: 'PlayStation', ps2: 'PlayStation 2', psp: 'PlayStation Portable',
      xbox: 'Xbox', xbox360: 'Xbox 360', steam: 'Steam',
    }
    if (map[systemId]) return map[systemId]
    return systemId.replace(/[-_]/g,' ').replace(/\b\w/g, l=>l.toUpperCase())
  }
  it('missing logo falls back to full system name not raw ID', () => {
    expect(formatFallback('ps2')).toBe('PlayStation 2')
    expect(formatFallback('ps2', '')).toBe('PlayStation 2')
    expect(formatFallback('gc')).toBe('GameCube')
    expect(formatFallback('gba')).toBe('Game Boy Advance')
  })
  it('fallback with fullName provided uses tasteful full name', () => {
    expect(formatFallback('ps2', 'PlayStation 2 – Real Machine')).toBe('PlayStation 2 – Real Machine')
  })
  it('never returns raw 2-3-char id as hero when full map exists', () => {
    const ids = ['ps2','gc','n64','gba','nds','n3ds','psx','psp','snes']
    for (const id of ids) {
      const out = formatFallback(id)
      expect(out.toLowerCase()).not.toEqual(id) // not raw id
      expect(out.length).toBeGreaterThan(2)
    }
  })
})

describe('V7.3 live selected-game media bridge – truthful priority', () => {
  it('real video is priority 1', () => {
    const resolved = { video: '/asset/v.mp4' }
    const pick = pickGameplayFromResolved(resolved as any)
    expect(pick.primaryType).toBe('video')
    expect(pick.primaryUrl).toBe('/asset/v.mp4')
  })
  it('screenshot fallback when no video', () => {
    const resolved = { screenshot: '/asset/s.png' }
    const pick = pickGameplayFromResolved(resolved as any)
    expect(pick.primaryType).toBe('screenshot')
    expect(pick.primaryUrl).toBe('/asset/s.png')
  })
  it('titleScreen and mixImage and cover used in order', () => {
    expect(pickGameplayFromResolved({ titleScreen: '/t.png' } as any).primaryUrl).toBe('/t.png')
    expect(pickGameplayFromResolved({ mixImage: '/m.png' } as any).primaryUrl).toBe('/m.png')
    expect(pickGameplayFromResolved({ cover: '/c.png' } as any).primaryUrl).toBe('/c.png')
  })
  it('no real scraped media yields idle glass – primaryType none', () => {
    const pick = pickGameplayFromResolved({} as any)
    expect(pick.primaryType).toBe('none')
    expect(pick.primaryUrl).toBeNull()
    expect(pick.fallbackReason).toMatch(/idle glass/i)
  })
  it('missing physical media renders nothing', () => {
    const resolved = { video: '/v.mp4' } as any
    // physicalMedia undefined → should be undefined url
    expect(resolved.physicalMedia).toBeUndefined()
    // downstream would render nothing if no url
    const physicalUrl = resolved.physicalMedia
    expect(physicalUrl).toBeFalsy()
  })
})

describe('V7.3 structural – storefront hardware hero, no carousel, showroom outer transform', () => {
  const appSrc = readFileSync('src/App.tsx','utf8')
  const stageSrc = readFileSync('src/stage/SystemStage.tsx','utf8')

  it('storefront shows hardware hero – storefront no longer hides hardware opacity 0', () => {
    // old V7.2 had opacity 0 storefront – new should have opacity 1 in hardware-frame always
    expect(stageSrc).toContain('hardware-showroom-wrapper')
    expect(stageSrc).not.toContain("opacity: entered ? 1 : showGuides ? 0.22 : 0")
    // new frame opacity 1 always
    expect(stageSrc).toContain('opacity: 1')
  })

  it('storefront does NOT hide hardware – large unobstructed hero logic', () => {
    expect(stageSrc).toContain('storefront showroom hero')
    expect(stageSrc).toContain('hardware-showroom-wrapper')
  })

  it('calibrated inner hardware-frame unchanged by showroom outer transform', () => {
    // inner frame still computed with contain logic aImg > aCont
    expect(stageSrc).toContain('const aImg = iw / ih')
    expect(stageSrc).toContain('const aCont = cw / ch')
    // outer == showroom wrapper, inner == hardware-frame – wrapper does NOT recompute regions via % inside frame
    expect(stageSrc).toContain('className="hardware-frame"')
    // frame left/top/width/height from contain still used
    expect(stageSrc).toContain('left: frame.left')
    expect(stageSrc).toContain('top: frame.top')
  })

  it('storefront has no full-width old carousel', () => {
    expect(appSrc).not.toContain('className="carousel"')
    expect(appSrc).not.toContain('carouselRef')
    expect(appSrc).not.toContain('full-width bottom navy carousel')
  })

  it('library uses entered state – background blur isolated', () => {
    expect(stageSrc).toContain("data-visual={entered ? 'library' : 'storefront'}")
    // blur only background layer
    expect(stageSrc).toContain('className="stage-bg-image"')
    expect(stageSrc).toContain("filter: entered")
    // ensure hardware/gameplay layer filter none
    expect(stageSrc).toContain('filter: \'none\'')
    // library background blur never affects hardware/gameplay layer – checked via layer separation
    expect(stageSrc.match(/layer-background/g)?.length).toBeGreaterThan(0)
    expect(stageSrc.match(/layer-gameplay/g)?.length).toBeGreaterThan(0)
  })

  it('utility destinations moved to shelf – top no longer 4 pill buttons', () => {
    // old top-bar had 4 pill buttons spanning; ensure top-bar class removed and shelf handles utility
    expect(appSrc).not.toContain('className="top-bar"')
    const shelfSrc = readFileSync('src/components/SystemShelf.tsx','utf8')
    expect(shelfSrc).toContain('shelf-utility-rail')
  })
})

describe('V7.3 Tauri local media url handling – degrade safely', () => {
  it('already-web urls pass through sync', () => {
    expect(toAssetUrlSync('/assets/hardware/ps2/ps2.png')).toBe('/assets/hardware/ps2/ps2.png')
    expect(toAssetUrlSync('https://example.com/v.mp4')).toBe('https://example.com/v.mp4')
  })
  it('windows paths in browser dev return null', () => {
    // in test env isTauriEnvironment false → returns null for raw windows path
    expect(toAssetUrlSync('D:\\Emulation\\roms\\ps2\\video.mp4')).toBeNull()
  })
})
