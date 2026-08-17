import type { GameEntry } from '../runtime/backend'

const ARCHIVES = new Set(['.7z', '.zip', '.rar'])

function titleKey(value: string): string {
  return value.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function score(game: GameEntry): number {
  const ext = String(game.extension || '').toLocaleLowerCase()
  let n = ARCHIVES.has(ext) ? -20 : 20
  if (game.description) n += 3
  if (game.cover_path) n += 2
  if (game.has_media) n += 2
  if (game.play_count) n += 1
  return n
}

/** Hide duplicate display entries while preserving the strongest playable source. */
export function dedupeLibraryGames(games: GameEntry[]): GameEntry[] {
  const order: string[] = []
  const best = new Map<string, GameEntry>()
  for (const game of games) {
    const key = `${game.system_id || ''}\0${titleKey(game.name || game.rom_basename || game.id)}`
    if (!best.has(key)) order.push(key)
    const current = best.get(key)
    if (!current || score(game) > score(current)) best.set(key, game)
  }
  return order.map(key => best.get(key)!).filter(Boolean)
}
