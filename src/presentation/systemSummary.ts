/**
 * System summary derivation – pure functions only
 * Collapse elegantly when no history exists – caller hides missing tiles.
 * Works against minimal GameEntry shape used by both backend and parser.
 */

export interface GameEntry {
  id: string
  name: string
  favorite?: boolean | number | string
  play_count?: number | string
  playcount?: number | string
  playCount?: number | string
  lastplayed?: string
  last_played?: string
  lastPlayed?: string
  rom_basename?: string
  // allow extra backend/metadata fields without any abuse
  system_id?: string
  rom_path?: string
  [k: string]: unknown
}

export type SummaryDerived = {
  total: number
  favoriteCount: number
  continuePlaying?: GameEntry
  recent?: GameEntry
  mostPlayed?: GameEntry
  surprise?: GameEntry
}

// ── favorite ────────────────────────────────────────────────────────────────

function isFavorite(g: GameEntry): boolean {
  const v = g.favorite
  if (v === true) return true
  if (v === 1) return true
  if (v === '1') return true
  if (v === 'true') return true
  // boolean true already handled, but allow truthy boolean only
  // anything else (0, false, '0', 'false', undefined) => not favorite
  if (typeof v === 'boolean') return v
  return false
}

// ── last played parsing ───────────────────────────────────────────────────

function getLastPlayedRaw(g: GameEntry): string | undefined {
  // supports backend (last_played), gamelist parser (lastPlayed / lastplayed), legacy
  return (
    (g.last_played as string | undefined) ??
    (g.lastplayed as string | undefined) ??
    (g.lastPlayed as string | undefined)
  )
}

function parseLastPlayedMs(g: GameEntry): number | null {
  const raw = getLastPlayedRaw(g)
  if (!raw) return null
  // ISO, EmulationStation ISO-like "20240214T165600", or numeric
  const ms = Date.parse(raw)
  if (!Number.isNaN(ms)) return ms

  // Try EmulationStation compact format YYYYMMDDThhmmss
  // e.g. 20240214T165600 -> 2024-02-14T16:56:00
  const esMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw)
  if (esMatch) {
    const iso = `${esMatch[1]}-${esMatch[2]}-${esMatch[3]}T${esMatch[4]}:${esMatch[5]}:${esMatch[6]}`
    const ms2 = Date.parse(iso)
    if (!Number.isNaN(ms2)) return ms2
  }
  return null
}

// ── playcount parsing ─────────────────────────────────────────────────────

function parsePlayCount(g: GameEntry): number | null {
  const raw =
    (g as { play_count?: unknown }).play_count ??
    (g as { playcount?: unknown }).playcount ??
    (g as { playCount?: unknown }).playCount

  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return null
}

// ── recent / continuePlaying ──────────────────────────────────────────────

/**
 * Most recently played game.
 * If no play history return undefined – caller collapses UI elegantly.
 */
export function getRecent(games: GameEntry[]): GameEntry | undefined {
  if (!games || games.length === 0) return undefined
  let best: GameEntry | undefined
  let bestMs = -1
  for (const g of games) {
    const ms = parseLastPlayedMs(g)
    if (ms == null) continue
    if (ms > bestMs) {
      bestMs = ms
      best = g
    }
  }
  return best
}

/**
 * Continue playing = most recent last_played.
 * Separate export for semantic clarity, same logic as recent.
 * If no play history return undefined – caller collapses UI elegantly.
 */
export function getContinuePlaying(games: GameEntry[]): GameEntry | undefined {
  return getRecent(games)
}

// ── most played ───────────────────────────────────────────────────────────

/**
 * Most played by playcount.
 * If no play history return undefined – caller collapses UI elegantly.
 */
export function getMostPlayed(games: GameEntry[]): GameEntry | undefined {
  if (!games || games.length === 0) return undefined
  let best: GameEntry | undefined
  let bestCount = -1
  let found = false
  for (const g of games) {
    const c = parsePlayCount(g)
    if (c == null || !Number.isFinite(c)) continue
    found = true
    if (c > bestCount) {
      bestCount = c
      best = g
    }
  }
  // if no valid counts found, collapse
  if (!found) return undefined
  // allow 0 as valid if it's the only count present
  return best
}

// ── surprise ──────────────────────────────────────────────────────────────

function hashCharSum(str: string): number {
  let sum = 0
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i)
  return sum
}

function deterministicIndex(games: GameEntry[]): number {
  // games.length * 31 + sum char codes of all ids (stable, deterministic)
  let sum = 0
  for (const g of games) {
    const s = `${g.id ?? ''}${g.name ?? ''}`
    sum += hashCharSum(s)
  }
  const hash = games.length * 31 + sum
  return hash % games.length
}

/**
 * Deterministic random surprise.
 * - Always returns an actual game from the list (or undefined if empty)
 * - Seed provided => seed % len
 * - No seed => deterministic hash based on content length*31 + char sum,
 *   fallback to Date.now()%len permissible for runtime variety but we keep
 *   deterministic for test stability. If you want runtime variety, pass
 *   Date.now() as seed from caller.
 * - Never synthesizes a fake entry.
 */
export function getSurprise(games: GameEntry[], seed?: number): GameEntry | undefined {
  if (!games || games.length === 0) return undefined
  const len = games.length
  let idx: number
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    idx = ((Math.floor(seed) % len) + len) % len
  } else {
    // deterministic content hash – stable across runs
    idx = deterministicIndex(games)
    // Optional runtime jitter variant:
    // If caller wants true runtime variety, they can call getSurprise(games, Date.now())
  }
  return games[idx]
}

// ── full summary ──────────────────────────────────────────────────────────

export function deriveSystemSummary(games: GameEntry[]): SummaryDerived {
  const total = games?.length ?? 0
  const favoriteCount = games ? games.filter(isFavorite).length : 0

  // collapse elegantly when empty
  if (total === 0) {
    return { total: 0, favoriteCount: 0 }
  }

  const recent = getRecent(games)
  const continuePlaying = getContinuePlaying(games) // alias for UI "continue"
  const mostPlayed = getMostPlayed(games)
  const surprise = getSurprise(games)

  return {
    total,
    favoriteCount,
    continuePlaying,
    recent,
    mostPlayed,
    surprise,
  }
}
