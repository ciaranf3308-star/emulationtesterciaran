/**
 * DEV-ONLY visual fixtures – V8.2 Golden Screen QA – POPULATED FIDELITY
 *
 * Strict rules (V8.1 safety preserved):
 * - DEV ONLY – isolated under src/dev/fixtures
 * - never used as product fallback unless explicitly allowed via fixture flag
 * - production Tauri (real machine) continues using machine truth only
 * - No filesystem writes – pure data in-memory
 *
 * Exists so web-engineering (no Tauri ROMs) can render populated golden screens.
 * 3 systems × 7 games – full metadata (80-200 char desc) + media representations.
 * Covers are inline SVG data URLs – no external asset dependency – proves composition.
 */

export type FixtureGame = {
  id: string
  name: string
  system_id: string
  rom_basename: string
  extension: string
  rom_path: string
  description?: string
  developer?: string
  publisher?: string
  genre?: string
  year?: string
  players?: string
  rating?: number // 0-5 scale 3.8-4.9
  releasedate?: string // YYYYMMDD
  favorite?: boolean
  play_count?: number
  last_played?: string
  coverUrl?: string
  logoUrl?: string
  marqueeUrl?: string
  screenshotUrl?: string
  videoUrl?: string | null
  physicalUrl?: string
}

function svgCoverDataUrl(title: string, system: string, idx: number): string {
  const colors: Record<string, [string, string]> = {
    gbc: ['#b8e6fe', '#7aa7ff'],
    ps2: ['#1a2336', '#5a8cff'],
    gc: ['#6b21cf', '#c084fc'],
  }
  const [c1, c2] = colors[system] || ['#202030', '#8af']
  const short = title.slice(0, 18)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='224' height='304' viewBox='0 0 224 304'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
  <rect width='224' height='304' rx='14' fill='url(#g)'/>
  <rect x='12' y='12' width='200' height='200' rx='10' fill='rgba(255,255,255,0.10)' stroke='rgba(255,255,255,0.18)'/>
  <text x='112' y='246' text-anchor='middle' font-family='system-ui' font-size='13' font-weight='700' fill='white' opacity='0.92'>${short}</text>
  <text x='112' y='266' text-anchor='middle' font-family='monospace' font-size='10' fill='white' opacity='0.68'>${system.toUpperCase()} • #${String(idx + 1).padStart(2, '0')}</text>
  <circle cx='112' cy='108' r='36' fill='rgba(255,255,255,0.16)'/>
  <text x='112' y='114' text-anchor='middle' font-size='28'>▶</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function svgMarqueeDataUrl(title: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='90' viewBox='0 0 400 90'><text x='20' y='54' font-family='system-ui' font-size='30' font-weight='800' fill='white' letter-spacing='-0.02em'>${title.slice(0, 28)}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function svgScreenshotDataUrl(title: string, system: string, idx: number): string {
  const colors: Record<string, [string, string]> = {
    gbc: ['#dbeafe', '#93c5fd'],
    ps2: ['#0f172a', '#60a5fa'],
    gc: ['#4c1d95', '#a78bfa'],
  }
  const [c1, c2] = colors[system] || ['#12121a', '#88aaff']
  const short = title.slice(0, 20)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>
  <defs><linearGradient id='sg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
  <rect width='640' height='360' rx='14' fill='url(#sg)'/>
  <rect x='24' y='24' width='320' height='200' rx='10' fill='rgba(255,255,255,0.12)' stroke='rgba(255,255,255,0.18)'/>
  <rect x='368' y='24' width='248' height='96' rx='8' fill='rgba(0,0,0,0.18)'/>
  <text x='42' y='280' font-family='system-ui' font-size='22' font-weight='700' fill='white'>${short} – Gameplay</text>
  <text x='42' y='305' font-family='monospace' font-size='11' fill='white' opacity='0.7'>${system.toUpperCase()} • SCREEN • #${String(idx + 1).padStart(2, '0')} • 16:9</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function svgPhysicalDataUrl(kind: string, system: string, idx: number): string {
  const colors: Record<string, [string, string]> = {
    gbc: ['#fef3c7', '#f59e0b'],
    ps2: ['#020617', '#334155'],
    gc: ['#fdf4ff', '#e9d5ff'],
  }
  const [c1, c2] = colors[system] || ['#1a1a20', '#555']
  const label = kind.slice(0, 18)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180' viewBox='0 0 300 180'>
  <defs><linearGradient id='pg' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
  <rect width='300' height='180' rx='12' fill='url(#pg)' stroke='rgba(0,0,0,0.12)'/>
  <rect x='18' y='18' width='92' height='92' rx='8' fill='rgba(0,0,0,0.12)'/>
  <circle cx='64' cy='64' r='28' fill='rgba(255,255,255,0.5)'/>
  <circle cx='64' cy='64' r='9' fill='rgba(0,0,0,0.28)'/>
  <text x='136' y='56' font-family='system-ui' font-size='14' font-weight='700' fill='#111'>${label}</text>
  <text x='136' y='74' font-family='monospace' font-size='10' fill='#333' opacity='0.8'>${system.toUpperCase()} #${String(idx + 1).padStart(2, '0')}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function mkCover(t: string, sys: string, i: number) {
  return svgCoverDataUrl(t, sys, i)
}
export function mkScreen(t: string, sys: string, i: number) {
  return svgScreenshotDataUrl(t, sys, i)
}
export function mkPhysical(kind: string, sys: string, i: number) {
  return svgPhysicalDataUrl(kind, sys, i)
}
export function mkMarquee(t: string) {
  return svgMarqueeDataUrl(t)
}
function isoHoursAgo(h: number) {
  return new Date(Date.now() - 1000 * 60 * 60 * h).toISOString()
}
function isoDaysAgo(d: number) {
  return new Date(Date.now() - 1000 * 60 * 60 * 24 * d).toISOString()
}

export const goldenFixtures: Record<string, FixtureGame[]> = {
  gbc: [
    { id: 'gbc-pokemon-tcg', name: 'Pokémon Trading Card Game', system_id: 'gbc', rom_basename: 'PokemonTCG', extension: '.gbc', rom_path: 'D:/fixtures/gbc/PokemonTCG.gbc', description: 'Build decks, duel Gym Leaders, and collect 226 cards. Energy, status effects, and evolutions create deep tactical play in this definitive portable adaptation of the classic card game.', developer: 'Hudson Soft', publisher: 'Nintendo', genre: 'Card Battle', year: '1998', players: '1', rating: 4.6, releasedate: '19981218', favorite: true, play_count: 23, last_played: isoHoursAgo(7), coverUrl: mkCover('Pokémon TCG', 'gbc', 0), marqueeUrl: mkMarquee('Pokémon TCG'), screenshotUrl: mkScreen('Pokémon TCG SC', 'gbc', 0), physicalUrl: mkPhysical('GBC Cart', 'gbc', 0), videoUrl: null },
    { id: 'gbc-zelda-dx', name: "Link's Awakening DX", system_id: 'gbc', rom_basename: 'ZeldaDX', extension: '.gbc', rom_path: 'D:/fixtures/gbc/ZeldaDX.gbc', description: 'Shipwrecked on Koholint Island, Link must awaken the Wind Fish. Features Color Dungeon, camera shop, and intimate dungeon craft in a mysterious timeless Game Boy adventure.', developer: 'Nintendo', publisher: 'Nintendo', genre: 'Action-Adventure', year: '1998', players: '1', rating: 4.8, releasedate: '19981212', favorite: true, play_count: 18, last_played: isoDaysAgo(2), coverUrl: mkCover('Zelda DX', 'gbc', 1), marqueeUrl: mkMarquee("Zelda DX"), screenshotUrl: mkScreen('Zelda DX', 'gbc', 1), physicalUrl: mkPhysical('GBC Cart', 'gbc', 1), videoUrl: null },
    { id: 'gbc-mario-tennis', name: 'Mario Tennis', system_id: 'gbc', rom_basename: 'MarioTennis', extension: '.gbc', rom_path: 'D:/fixtures/gbc/MarioTennis.gbc', description: 'RPG-driven tennis tour starring Alex. Train stats, master topspin and slice, win the Island Open, then challenge Mario himself in surprisingly deep sports progression.', developer: 'Camelot', publisher: 'Nintendo', genre: 'Sports RPG', year: '2000', players: '1', rating: 4.2, releasedate: '20001101', favorite: false, play_count: 4, last_played: isoDaysAgo(12), coverUrl: mkCover('Mario Tennis', 'gbc', 2), marqueeUrl: mkMarquee('Mario Tennis'), screenshotUrl: mkScreen('Mario Tennis', 'gbc', 2), physicalUrl: mkPhysical('GBC Cart', 'gbc', 2), videoUrl: null },
    { id: 'gbc-wario-land3', name: 'Wario Land 3', system_id: 'gbc', rom_basename: 'WarioLand3', extension: '.gbc', rom_path: 'D:/fixtures/gbc/WarioLand3.gbc', description: 'Puzzle-platform twist – Wario is invulnerable, transformations are keys. Explore day-night cycles, music-box worlds, and a sprawling interconnected map full of secrets.', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Platformer', year: '2000', players: '1', rating: 4.5, releasedate: '20000321', favorite: false, play_count: 9, last_played: isoDaysAgo(5), coverUrl: mkCover('Wario Land 3', 'gbc', 3), marqueeUrl: mkMarquee('Wario Land 3'), screenshotUrl: mkScreen('Wario Land 3', 'gbc', 3), physicalUrl: mkPhysical('GBC Cart', 'gbc', 3), videoUrl: null },
    { id: 'gbc-metroid2', name: 'Metroid II – Return of Samus', system_id: 'gbc', rom_basename: 'MetroidII', extension: '.gb', rom_path: 'D:/fixtures/gbc/MetroidII.gb', description: 'Exterminate Metroids on SR388. Stark atmospheric exploration with evolving level design, Spider Ball climbs, and tense isolation as Samus descends alone.', developer: 'Nintendo R&D1', publisher: 'Nintendo', genre: 'Action', year: '1991', players: '1', rating: 4.0, releasedate: '19911101', favorite: false, play_count: 2, last_played: isoDaysAgo(20), coverUrl: mkCover('Metroid II', 'gbc', 4), marqueeUrl: mkMarquee('Metroid II'), screenshotUrl: mkScreen('Metroid II', 'gbc', 4), physicalUrl: mkPhysical('GB Cart', 'gbc', 4), videoUrl: null },
    { id: 'gbc-shantae', name: 'Shantae', system_id: 'gbc', rom_basename: 'Shantae', extension: '.gbc', rom_path: 'D:/fixtures/gbc/Shantae.gbc', description: 'Half-genie hero whips hair and dances to transform. Razor-sharp platforming showcase for late Game Boy Color, with labyrinths, magic, and bold sprite work.', developer: 'WayForward', publisher: 'Capcom', genre: 'Platformer', year: '2002', players: '1', rating: 4.4, releasedate: '20020602', favorite: true, play_count: 7, last_played: isoDaysAgo(8), coverUrl: mkCover('Shantae', 'gbc', 5), marqueeUrl: mkMarquee('Shantae'), screenshotUrl: mkScreen('Shantae', 'gbc', 5), physicalUrl: mkPhysical('GBC Cart', 'gbc', 5), videoUrl: null },
    { id: 'gbc-mario-deluxe', name: 'Super Mario Bros. Deluxe', system_id: 'gbc', rom_basename: 'SMBDeluxe', extension: '.gbc', rom_path: 'D:/fixtures/gbc/SMBDeluxe.gbc', description: 'Expanded NES classic with 32 extra stages, Challenge mode, Toy Box, and versus race. Precise platforming preserved with vibrant color upgrades for Game Boy.', developer: 'Nintendo', publisher: 'Nintendo', genre: 'Platformer', year: '1999', players: '2', rating: 4.3, releasedate: '19990430', favorite: false, play_count: 11, last_played: isoHoursAgo(18), coverUrl: mkCover('Mario Deluxe', 'gbc', 6), marqueeUrl: mkMarquee('Mario Deluxe'), screenshotUrl: mkScreen('Mario Deluxe', 'gbc', 6), physicalUrl: mkPhysical('GBC Cart', 'gbc', 6), videoUrl: null },
  ],
  ps2: [
    { id: 'ps2-gt4', name: 'Gran Turismo 4', system_id: 'ps2', rom_basename: 'GT4', extension: '.iso', rom_path: 'D:/fixtures/ps2/GT4.iso', description: 'The real driving simulator at its peak. 721 cars, 51 tracks, Photo Mode debut, and B-Spec directing. Unmatched physics, presentation, and depth for a generation.', developer: 'Polyphony Digital', publisher: 'Sony', genre: 'Racing Sim', year: '2004', players: '2', rating: 4.9, releasedate: '20041228', favorite: true, play_count: 41, last_played: isoHoursAgo(0.5), coverUrl: mkCover('Gran Turismo 4', 'ps2', 0), marqueeUrl: mkMarquee('Gran Turismo 4'), screenshotUrl: mkScreen('GT4 Race', 'ps2', 0), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 0), videoUrl: null },
    { id: 'ps2-mgs3', name: 'Metal Gear Solid 3: Snake Eater', system_id: 'ps2', rom_basename: 'MGS3', extension: '.iso', rom_path: 'D:/fixtures/ps2/MGS3.iso', description: '1964 jungle stealth survival. Camouflage index, CQC, stamina, and injury systems layer onto a tragic Cold War story of loyalty – theatrical and unrivaled.', developer: 'KCEJ', publisher: 'Konami', genre: 'Stealth Action', year: '2004', players: '1', rating: 4.9, releasedate: '20041117', favorite: true, play_count: 31, last_played: isoHoursAgo(6), coverUrl: mkCover('MGS3 Snake Eater', 'ps2', 1), marqueeUrl: mkMarquee('MGS3'), screenshotUrl: mkScreen('MGS3 Jungle', 'ps2', 1), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 1), videoUrl: null },
    { id: 'ps2-fFX', name: 'Final Fantasy X', system_id: 'ps2', rom_basename: 'FFX', extension: '.iso', rom_path: 'D:/fixtures/ps2/FFX.iso', description: 'Spira pilgrimage with sphere grid growth and conditional turn battles. First voice-acted Final Fantasy, blending cinematic summoning with enduring themes.', developer: 'Square', publisher: 'Square', genre: 'RPG', year: '2001', players: '1', rating: 4.7, releasedate: '20010719', favorite: false, play_count: 28, last_played: isoDaysAgo(1), coverUrl: mkCover('Final Fantasy X', 'ps2', 2), marqueeUrl: mkMarquee('Final Fantasy X'), screenshotUrl: mkScreen('FFX Battle', 'ps2', 2), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 2), videoUrl: null },
    { id: 'ps2-gow', name: 'God of War', system_id: 'ps2', rom_basename: 'GodOfWar', extension: '.iso', rom_path: 'D:/fixtures/ps2/GodOfWar.iso', description: 'Spartan Kratos rails against Ares with chained Blades. Brutal combos, massive scale, and mythic set-pieces tuned to relentless aggression.', developer: 'SCEA', publisher: 'Sony', genre: 'Action', year: '2005', players: '1', rating: 4.7, releasedate: '20050322', favorite: false, play_count: 22, last_played: isoDaysAgo(4), coverUrl: mkCover('God of War', 'ps2', 3), marqueeUrl: mkMarquee('God of War'), screenshotUrl: mkScreen('GoW Combat', 'ps2', 3), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 3), videoUrl: null },
    { id: 'ps2-kh2', name: 'Kingdom Hearts II', system_id: 'ps2', rom_basename: 'KH2', extension: '.iso', rom_path: 'D:/fixtures/ps2/KH2.iso', description: 'Drive Forms, Reaction Commands, and mid-air finales elevate this Disney crossover. Team attacks and deep combat make it the action peak of the series.', developer: 'Square Enix', publisher: 'Square Enix', genre: 'ARPG', year: '2005', players: '1', rating: 4.6, releasedate: '20051222', favorite: false, play_count: 16, last_played: isoDaysAgo(9), coverUrl: mkCover('KH II', 'ps2', 4), marqueeUrl: mkMarquee('KH II'), screenshotUrl: mkScreen('KH2 Drive', 'ps2', 4), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 4), videoUrl: null },
    { id: 'ps2-dmc3', name: 'Devil May Cry 3', system_id: 'ps2', rom_basename: 'DMC3', extension: '.iso', rom_path: 'D:/fixtures/ps2/DMC3.iso', description: 'Style ranks, on-the-fly weapon switching, and punishing bosses define this prequel. Combos, taunts, and spectacle set the genre standard.', developer: 'Capcom', publisher: 'Capcom', genre: 'Spectacle Fighter', year: '2005', players: '1', rating: 4.8, releasedate: '20050217', favorite: true, play_count: 12, last_played: isoDaysAgo(15), coverUrl: mkCover('DMC3', 'ps2', 5), marqueeUrl: mkMarquee('DMC3'), screenshotUrl: mkScreen('DMC3 Style', 'ps2', 5), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 5), videoUrl: null },
    { id: 'ps2-sotc', name: 'Shadow of the Colossus', system_id: 'ps2', rom_basename: 'SOTC', extension: '.iso', rom_path: 'D:/fixtures/ps2/SOTC.iso', description: 'Sixteen colossi roam a forbidden land. Climb, stab, and solve each giant as architecture. Minimalist, melancholic, and mechanically pure adventure.', developer: 'Team Ico', publisher: 'Sony', genre: 'Action-Adventure', year: '2005', players: '1', rating: 4.8, releasedate: '20051018', favorite: false, play_count: 19, last_played: isoDaysAgo(3), coverUrl: mkCover('SOTC', 'ps2', 6), marqueeUrl: mkMarquee('SOTC'), screenshotUrl: mkScreen('SOTC Climb', 'ps2', 6), physicalUrl: mkPhysical('PS2 DVD', 'ps2', 6), videoUrl: null },
  ],
  gc: [
    { id: 'gc-melee', name: 'Super Smash Bros. Melee', system_id: 'gc', rom_basename: 'Melee', extension: '.iso', rom_path: 'D:/fixtures/gc/Melee.iso', description: 'Nintendo all-stars brawler scaled for competition – 26 fighters, advanced movement tech, and ultimate longevity.', developer: 'HAL Laboratory', publisher: 'Nintendo', genre: 'Fighting', year: '2001', players: '4', rating: 4.9, releasedate: '20011121', favorite: true, play_count: 88, last_played: isoHoursAgo(5), coverUrl: mkCover('Melee', 'gc', 0), marqueeUrl: mkMarquee('Melee'), screenshotUrl: mkScreen('Melee Fight', 'gc', 0), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 0), videoUrl: null },
    { id: 'gc-windwaker', name: 'The Wind Waker', system_id: 'gc', rom_basename: 'WindWaker', extension: '.iso', rom_path: 'D:/fixtures/gc/WindWaker.iso', description: 'Cel-shaded sea epic – sailing, wind, discovery. Expressionist dungeons and intimate scale with charming orchestral voyage.', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-Adventure', year: '2002', players: '1', rating: 4.8, releasedate: '20021213', favorite: false, play_count: 34, last_played: isoDaysAgo(6), coverUrl: mkCover('Wind Waker', 'gc', 1), marqueeUrl: mkMarquee('Wind Waker'), screenshotUrl: mkScreen('Wind Waker Sea', 'gc', 1), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 1), videoUrl: null },
    { id: 'gc-metroidprime', name: 'Metroid Prime', system_id: 'gc', rom_basename: 'MetroidPrime', extension: '.iso', rom_path: 'D:/fixtures/gc/MetroidPrime.iso', description: 'First-person adventure locked to visor scans, atmosphere, morph ball – no HUD clutter. Isolation and discovery remain masterful.', developer: 'Retro Studios', publisher: 'Nintendo', genre: 'FPA', year: '2002', players: '1', rating: 4.9, releasedate: '20021117', favorite: true, play_count: 27, last_played: isoDaysAgo(3), coverUrl: mkCover('Metroid Prime', 'gc', 2), marqueeUrl: mkMarquee('Metroid Prime'), screenshotUrl: mkScreen('Prime Scan', 'gc', 2), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 2), videoUrl: null },
    { id: 'gc-fzero', name: 'F-Zero GX', system_id: 'gc', rom_basename: 'FZeroGX', extension: '.iso', rom_path: 'D:/fixtures/gc/FZeroGX.iso', description: 'Seismic speed, custom builds, story difficulty notorious – uncompromised futuristic racer tuned by Amusement Vision at its peak.', developer: 'Amusement Vision', publisher: 'Nintendo', genre: 'Racing', year: '2003', players: '2', rating: 4.6, releasedate: '20030725', favorite: false, play_count: 19, last_played: isoDaysAgo(11), coverUrl: mkCover('F-Zero GX', 'gc', 3), marqueeUrl: mkMarquee('F-Zero GX'), screenshotUrl: mkScreen('F-Zero GX', 'gc', 3), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 3), videoUrl: null },
    { id: 'gc-pikmin2', name: 'Pikmin 2', system_id: 'gc', rom_basename: 'Pikmin2', extension: '.iso', rom_path: 'D:/fixtures/gc/Pikmin2.iso', description: 'Cave delves, trinket economy, no time pressure – co-op-adjacent charm with strategic onion management and delightful risk.', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Strategy', year: '2004', players: '2', rating: 4.5, releasedate: '20040429', favorite: false, play_count: 8, last_played: isoDaysAgo(14), coverUrl: mkCover('Pikmin 2', 'gc', 4), marqueeUrl: mkMarquee('Pikmin 2'), screenshotUrl: mkScreen('Pikmin 2 Cave', 'gc', 4), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 4), videoUrl: null },
    { id: 'gc-papers', name: 'Paper Mario TTYD', system_id: 'gc', rom_basename: 'TTYD', extension: '.iso', rom_path: 'D:/fixtures/gc/TTYD.iso', description: 'Stagey RPG wit – partners, badges, audience heat system. Seven chapters of inventive battle writing and crisp theatrical set design.', developer: 'Intelligent Systems', publisher: 'Nintendo', genre: 'RPG', year: '2004', players: '1', rating: 4.8, releasedate: '20040722', favorite: true, play_count: 21, last_played: isoHoursAgo(10), coverUrl: mkCover('TTYD', 'gc', 5), marqueeUrl: mkMarquee('TTYD'), screenshotUrl: mkScreen('TTYD Battle', 'gc', 5), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 5), videoUrl: null },
    { id: 'gc-luigi', name: "Luigi's Mansion", system_id: 'gc', rom_basename: 'LuigiMansion', extension: '.iso', rom_path: 'D:/fixtures/gc/LuigiMansion.iso', description: 'Vacuum ghosts with the Poltergust 3000. Puzzle mansion, portrait ghosts, and atmospheric lighting – nervous Luigi charms with clever exploration.', developer: 'Nintendo EAD', publisher: 'Nintendo', genre: 'Action-Adventure', year: '2001', players: '1', rating: 4.4, releasedate: '20010914', favorite: false, play_count: 13, last_played: isoDaysAgo(7), coverUrl: mkCover("Luigi Mansion", 'gc', 6), marqueeUrl: mkMarquee("Luigi Mansion"), screenshotUrl: mkScreen("Luigi Mansion", 'gc', 6), physicalUrl: mkPhysical('GC Mini DVD', 'gc', 6), videoUrl: null },
  ],
}

export function getFixtureSystems() {
  return Object.keys(goldenFixtures)
}

export function getFixtureGames(systemId: string): FixtureGame[] {
  return goldenFixtures[systemId] ? [...goldenFixtures[systemId]] : []
}

/** Convert FixtureGame -> minimal GameEntry shape used by AppInner */
export function toGameEntry(f: FixtureGame): any {
  const y = f.year || (f.releasedate ? f.releasedate.slice(0, 4) : undefined)
  return {
    id: f.id,
    system_id: f.system_id,
    name: f.name,
    rom_basename: f.rom_basename,
    extension: f.extension,
    rom_path: f.rom_path,
    description: f.description,
    developer: f.developer,
    publisher: f.publisher,
    genre: f.genre,
    players: f.players,
    rating: f.rating,
    releasedate: f.releasedate,
    year: y,
    favorite: !!f.favorite,
    play_count: f.play_count ?? 0,
    last_played: f.last_played || null,
    // pre-resolved cover for web fixture path
    _fixtureCoverUrl: f.coverUrl,
    _fixtureLogoUrl: f.marqueeUrl || f.logoUrl || undefined,
    _fixtureScreenshotUrl: f.screenshotUrl || f.coverUrl,
    _fixturePhysicalUrl: f.physicalUrl || f.coverUrl,
  }
}

/** Helper to get fixture summary – now returns 7 total per V8.2 */
export function getFixtureSummary(systemId: string) {
  const list = goldenFixtures[systemId] || []
  const fav = list.filter(g => g.favorite).length
  const recent = list
    .slice()
    .sort((a, b) => {
      const da = a.last_played ? Date.parse(a.last_played) : 0
      const db = b.last_played ? Date.parse(b.last_played) : 0
      return db - da
    })[0]
  const most = list.slice().sort((a, b) => (b.play_count || 0) - (a.play_count || 0))[0]
  const surprise = list.length ? list[Math.floor(list.length / 2)] : undefined
  return { total: list.length, favoriteCount: fav, recent, most, surprise, continuePlaying: recent, list }
}

export function fixtureMediaForGame(gameId: string): { screenshot?: string; cover?: string; physical?: string; marquee?: string } | null {
  for (const sys of Object.keys(goldenFixtures)) {
    const found = goldenFixtures[sys].find(g => g.id === gameId)
    if (found) {
      return {
        screenshot: found.screenshotUrl || found.coverUrl,
        cover: found.coverUrl,
        physical: found.physicalUrl || found.coverUrl,
        marquee: found.marqueeUrl || found.logoUrl || undefined,
      }
    }
  }
  return null
}

