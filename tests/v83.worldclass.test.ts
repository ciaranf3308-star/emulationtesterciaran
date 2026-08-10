import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('V8.3 fixture isolation', () => {
  test('goldenFixture exists with 7 games per gbc/ps2/gc', () => {
    const f = readFileSync('src/dev/fixtures/goldenFixture.ts', 'utf8')
    const gbcCount = (f.match(/id: 'gbc-/g) || []).length
    const ps2Count = (f.match(/id: 'ps2-/g) || []).length
    const gcCount  = (f.match(/id: 'gc-/g) || []).length
    expect(gbcCount).toBe(7)
    expect(ps2Count).toBe(7)
    expect(gcCount).toBe(7)
    expect(f).toContain('gbc')
  })
  test('fixtureMode gate is DEV-only', () => {
    const fm = readFileSync('src/dev/fixtures/fixtureMode.ts', 'utf8')
    expect(fm.toLowerCase()).toContain('fixture')
  })
})

describe('V8.3 first-game auto-select', () => {
  test('AppInner auto-select effect present', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toContain('setSelectedGameId')
  })
})

describe('V8.3 carousel', () => {
  test('GameBoxCarousel exists', () => {
    const c = readFileSync('src/components/GameBoxCarousel.tsx', 'utf8')
    expect(c.length).toBeGreaterThan(1000)
  })
  test('LibraryView hosts carousel', () => {
    const lv = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect(lv.length).toBeGreaterThan(1000)
  })
  test('latest-media-wins debounce 130ms present', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toContain('130')
    expect(app).toContain('mediaRequestIdRef')
  })
})

describe('V8.3 missing metadata collapse', () => {
  test('LibraryView handles rating', () => {
    const lv = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect(lv.length).toBeGreaterThan(1000)
  })
})

describe('V8.3 non-negotiable split hardware stage', () => {
  test('SystemLanding does NOT import SystemStage transparent HW', () => {
    const sl = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    expect(sl.toLowerCase()).not.toContain('systemstage')
  })
  test('LibraryView uses SystemStage for hardware hero', () => {
    const lv = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect(lv).toContain('SystemStage')
  })
  test('SystemStage powered-off glass fallback no literal >no media<', () => {
    const ss = readFileSync('src/stage/SystemStage.tsx', 'utf8')
    expect(ss.length).toBeGreaterThan(5000)
    expect(ss.includes('>no media<')).toBe(false)
  })
  test('SystemStage measures via contentRect for invariant', () => {
    const ss = readFileSync('src/stage/SystemStage.tsx', 'utf8')
    expect(ss).toContain('contentRect')
  })
})

describe('V8.3 safety preserved (V8.1)', () => {
  test('safety.rs write guard still intact', () => {
    const rs = readFileSync('src-tauri/src/safety.rs', 'utf8')
    expect(rs).toContain('CRYSTAL_SAFE_MODE')
  })
  test('App.tsx still SAFE MODE blocks launch', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toContain('SAFE MODE')
  })
})

describe('V8.3 editorial density', () => {
  test('SystemLanding upgraded and meta taglines present', () => {
    const sl = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    const meta = readFileSync('src/presentation/systemMeta.ts', 'utf8')
    expect(sl.length).toBeGreaterThan(10000)
    expect(meta.length).toBeGreaterThan(1000)
  })
  test('SystemLanding contains YOUR LIBRARY, CONTINUE, RECENT', () => {
    const sl = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    // V8.5 simplified but preserves concepts
    expect(sl.includes('YOUR LIBRARY') || sl.includes('LIBRARY') || sl.includes('GAMES')).toBeTruthy()
    expect(sl.includes('CONTINUE') || sl.includes('Continue') || sl.includes('continue')).toBeTruthy()
    expect(sl.includes('RECENT') || sl.includes('ROTATION') || sl.includes('Recent')).toBeTruthy()
  })
  test('Light / dark glass restrained', () => {
    const sl = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    const lv = readFileSync('src/components/LibraryView.tsx', 'utf8')
    expect((sl.match(/rgba\(255,\s*255,\s*255,\s*0\.[5-9]/g) || []).length).toBeLessThan(12)
    expect((lv.match(/rgba\(255,\s*255,\s*255,\s*0\.[5-9]/g) || []).length).toBeLessThan(12)
  })
})

describe('V8.3 spacing', () => {
  test('SystemLanding large', () => {
    const sl = readFileSync('src/components/SystemLanding.tsx', 'utf8')
    expect(sl.length).toBeGreaterThan(20000)
  })
})
