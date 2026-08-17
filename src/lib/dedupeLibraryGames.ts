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

/** Result with dedup count for trust toast */
export type DedupeResult = {
  games: GameEntry[]
  removed: number
  original: number
}

function emitDedupEvent(removed: number, systemId?: string) {
  if (removed <= 0) return
  try {
    if (typeof window !== 'undefined') {
      const detail = { removed, systemId: systemId || null, at: Date.now() }
      window.dispatchEvent(new CustomEvent('crystal:dedup-cleaned', { detail }))
      // also log for diagnostics – bounded, no ROM names
      console.info(`[dedupe] Cleaned ${removed} duplicates${systemId ? ` for ${systemId}` : ''}`)
    }
  } catch {}
}

/** Hide duplicate display entries while preserving the strongest playable source. */
export function dedupeLibraryGames(games: GameEntry[]): GameEntry[] {
  if (!games || games.length === 0) return games
  const order: string[] = []
  const best = new Map<string, GameEntry>()
  for (const game of games) {
    const key = `${game.system_id || ''}\0${titleKey(game.name || game.rom_basename || game.id)}`
    if (!best.has(key)) order.push(key)
    const current = best.get(key)
    if (!current || score(game) > score(current)) best.set(key, game)
  }
  const deduped = order.map(key => best.get(key)!).filter(Boolean)
  const removed = games.length - deduped.length
  if (removed > 0) {
    const sys = games[0]?.system_id
    emitDedupEvent(removed, sys)
  }
  return deduped
}

/** Extended version returning count – useful for callers needing exact removed number */
export function dedupeLibraryGamesWithCount(games: GameEntry[]): DedupeResult {
  const original = games?.length ?? 0
  const deduped = dedupeLibraryGames(games)
  return { games: deduped, removed: original - deduped.length, original }
}
