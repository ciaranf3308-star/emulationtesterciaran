/**
 * DEV-ONLY visual fixtures – V8 Golden Screen QA
 *
 * Strict rules:
 * - DEV only
 * - never used as product fallback
 * - never loaded automatically
 * - clearly isolated under src/dev/fixtures
 * - production / real Tauri must continue using machine truth only
 *
 * Exists ONLY so agent can render complete layout for visual inspection when
 * ROG media unavailable in web engineering env.
 *
 * Small representative sample to prove composition – 3 systems, 5-7 games each.
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
  players?: string
  rating?: number
  releasedate?: string
  favorite?: boolean
  play_count?: number
  last_played?: string
  coverUrl?: string
  logoUrl?: string
}

export const goldenFixtures: Record<string, FixtureGame[]> = {
  gbc: [
    { id: 'gbc-pokemon-tcg', name: 'Pokémon Trading Card Game', system_id: 'gbc', rom_basename: 'PokemonTCG', extension: '.gbc', rom_path: 'D:/fixtures/gbc/PokemonTCG.gbc', description: 'Build decks, battle trainers, collect 226 cards. Based on Wizards of the Coast TCG.', developer: 'Hudson Soft', publisher: 'Nintendo', genre: 'Card Battle', players: '1', rating: 4.6, releasedate: '19981218', favorite: true, play_count: 23, last_played: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(), coverUrl: '/assets/crystal/gbc/placeholder-cover-01.png' },
    { id: 'gbc-zelda-dx', name: 'Links Awakening DX', system_id: 'gbc', rom_basename: 'ZeldaDX', extension: '.gbc', rom_path: 'D:/fixtures/gbc/ZeldaDX.gbc', description: 'Link stranded on Koholint Island. Color dungeon exclusive to DX.', developer: 'Nintendo', publisher: 'Nintendo', genre: 'Action-Adventure', players: '1', rating: 4.8, releasedate: '19981212', play_count: 18, last_played: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() },
    { id: 'gbc-mario-tennis', name: 'Mario Tennis', system_id: 'gbc', rom_basename: 'MarioTennis', extension: '.gbc', rom_path: 'D:/fixtures/gbc/MarioTennis.gbc', genre: 'Sports', rating: 4.2, releasedate: '20001101', play_count: 4 },
    { id: 'gbc-wario-land3', name: 'Wario Land 3', system_id: 'gbc', rom_basename: 'WarioLand3', extension: '.gbc', rom_path: 'D:/fixtures/gbc/WarioLand3.gbc', genre: 'Platformer', rating: 4.5, play_count: 9, last_played: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString() },
    { id: 'gbc-metroid2', name: 'Metroid II – Return of Samus', system_id: 'gbc', rom_basename: 'MetroidII', extension: '.gbc', rom_path: 'D:/fixtures/gbc/MetroidII.gb', genre: 'Action', rating: 4.0, play_count: 2 },
  ],
  ps2: [
    { id: 'ps2-gt4', name: 'Gran Turismo 4', system_id: 'ps2', rom_basename: 'GT4', extension: '.iso', rom_path: 'D:/fixtures/ps2/GT4.iso', description: 'The real driving simulator. 721 cars, 51 tracks, Photo Mode and B-Spec director.', developer: 'Polyphony Digital', publisher: 'Sony', genre: 'Racing Sims', players: '2', rating: 4.9, releasedate: '20041228', favorite: true, play_count: 41, last_played: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    { id: 'ps2-mgs3', name: 'Metal Gear Solid 3: Snake Eater', system_id: 'ps2', rom_basename: 'MGS3', extension: '.iso', rom_path: 'D:/fixtures/ps2/MGS3.iso', description: 'Cold War stealth in the jungle. Survival, camouflage, close-quarters combat.', developer: 'KCEJ', publisher: 'Konami', genre: 'Stealth Action', rating: 4.9, releasedate: '20041117', play_count: 31 },
    { id: 'ps2-fFX', name: 'Final Fantasy X', system_id: 'ps2', rom_basename: 'FFX', extension: '.iso', rom_path: 'D:/fixtures/ps2/FFX.iso', genre: 'RPG', rating: 4.7, play_count: 28, last_played: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: 'ps2-gow', name: 'God of War', system_id: 'ps2', rom_basename: 'GodOfWar', extension: '.iso', rom_path: 'D:/fixtures/ps2/GodOfWar.iso', genre: 'Action', rating: 4.7, play_count: 22 },
    { id: 'ps2-kh2', name: 'Kingdom Hearts II', system_id: 'ps2', rom_basename: 'KH2', extension: '.iso', rom_path: 'D:/fixtures/ps2/KH2.iso', genre: 'ARPG', rating: 4.6, play_count: 16 },
    { id: 'ps2-dmc3', name: 'Devil May Cry 3', system_id: 'ps2', rom_basename: 'DMC3', extension: '.iso', rom_path: 'D:/fixtures/ps2/DMC3.iso', genre: 'Spectacle Fighter', rating: 4.8, play_count: 12 },
  ],
  gc: [
    { id: 'gc-melee', name: 'Super Smash Bros. Melee', system_id: 'gc', rom_basename: 'Melee', extension: '.iso', rom_path: 'D:/fixtures/gc/Melee.iso', description: 'Nintendo all-stars brawler. Speed, depth, 26 fighters.', developer: 'HAL Laboratory', publisher: 'Nintendo', genre: 'Fighting', players: '4', rating: 4.9, releasedate: '20011121', favorite: true, play_count: 88, last_played: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'gc-windwaker', name: 'The Wind Waker', system_id: 'gc', rom_basename: 'WindWaker', extension: '.iso', rom_path: 'D:/fixtures/gc/WindWaker.iso', genre: 'Action-Adventure', rating: 4.8, play_count: 34 },
    { id: 'gc-metroidprime', name: 'Metroid Prime', system_id: 'gc', rom_basename: 'MetroidPrime', extension: '.iso', rom_path: 'D:/fixtures/gc/MetroidPrime.iso', genre: 'FPA', rating: 4.9, play_count: 27, last_played: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() },
    { id: 'gc-fzero', name: 'F-Zero GX', system_id: 'gc', rom_basename: 'FZeroGX', extension: '.iso', rom_path: 'D:/fixtures/gc/FZeroGX.iso', genre: 'Racing', rating: 4.6, play_count: 19 },
    { id: 'gc-pikmin2', name: 'Pikmin 2', system_id: 'gc', rom_basename: 'Pikmin2', extension: '.iso', rom_path: 'D:/fixtures/gc/Pikmin2.iso', genre: 'Strategy', rating: 4.5, play_count: 8 },
  ],
}

/** Helper to get fixture summary */
export function getFixtureSummary(systemId: string) {
  const list = goldenFixtures[systemId] || []
  const fav = list.filter(g => g.favorite).length
  const recent = list.slice().sort((a, b) => {
    const da = a.last_played ? Date.parse(a.last_played) : 0
    const db = b.last_played ? Date.parse(b.last_played) : 0
    return db - da
  })[0]
  const most = list.slice().sort((a, b) => (b.play_count || 0) - (a.play_count || 0))[0]
  const surprise = list.length ? list[Math.floor(list.length / 2)] : undefined
  return { total: list.length, favoriteCount: fav, recent, most, surprise, continuePlaying: recent }
}
