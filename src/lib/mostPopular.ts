/**
 * Most Popular scoring – getMostPlayed per system
 * Sort by playCount*0.6 + playTime weighted + last_played recency, returns 3-5 top.
 * Curated fallback when <5.
 */

import { getCuratedForSystem } from '../data/curatedPopular'
import type { GameEntry } from '../runtime/backend'

type GameLike = GameEntry & {
  play_count?: number | string | null
  playcount?: number | string | null
  playCount?: number | string | null
  last_played?: string | null
  lastplayed?: string | null
  lastPlay?: string | null
  playtime?: number | string | null
  playTime?: number | string | null
}

function parsePlayCount(g: GameLike): number {
  const raw = (g as any).play_count ?? (g as any).playcount ?? (g as any).playCount ?? (g as any).play_count
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  const n = Number(raw)
  return isNaN(n) ? 0 : n
}

function parsePlayTimeMinutes(g: GameLike): number {
  const raw = (g as any).playtime ?? (g as any).playTime ?? (g as any).play_time
  if (raw == null) return 0
  let n = typeof raw === 'number' ? raw : Number(raw)
  if (isNaN(n)) return 0
  // Heuristic: if > 1000 assume seconds, convert to minutes
  if (n > 5000) return n / 60
  // If <= 5000 assume minutes? ES-DE stores seconds often. We'll treat as seconds if > 180 => likely minutes? Safer divide >300?
  // We'll assume seconds if > 600 (10h in minutes would be 600). Actually use minutes normalized: seconds/60.
  // Keep simple: if n> 1000 seconds already handled; else if n> 0 assume minutes -> keep
  // We'll convert seconds heuristic: if original likely seconds, n/60 < ~600, use n/60 when n> 180?
  // For simplicity: if n> 10000 it's seconds -> convert; else treat n as seconds? Let's treat uniform seconds->minutes for > 0
  // To avoid overweight, we cap.
  if (n > 0 && n < 10000) {
    // assume seconds if n > 300? We'll treat as seconds when > 60 to get minutes small
    return n > 60 ? n / 60 : n
  }
  return n / 60
}

function parseLastPlayedMs(g: GameLike): number | null {
  const raw = (g as any).last_played ?? (g as any).lastplayed ?? (g as any).lastPlayed ?? (g as any).last_played
  if (!raw) return null
  const t = String(raw).trim()
  // ES-DE format YYYYMMDDTHHMMSS
  const m = t.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    return d.getTime() || null
  }
  const ms = Date.parse(t)
  if (!isNaN(ms)) return ms
  return null
}

function recencyScore(ms: number | null): number {
  if (ms == null) return 0
  const now = Date.now()
  const diffDays = (now - ms) / (1000*60*60*24)
  if (diffDays < 0) return 8 // future -> high recent
  // Decay: 10 / (days+1) * 2
  return Math.max(0, (10 / (diffDays + 1)) * 1.8)
}

export type ScoredGame<T> = { game: T; score: number; reasonParts: string[] }

function scoreGame(g: GameLike): number {
  const pc = parsePlayCount(g)
  const pt = parsePlayTimeMinutes(g)
  const lpMs = parseLastPlayedMs(g)
  const rec = recencyScore(lpMs)

  // weights: playCount 0.6, playTime 0.25, recency 1.0
  // playCount up to maybe 100 => 60
  const s = pc * 0.6 * 2.5 + pt * 0.25 + rec
  // small boost if both pc and recency exist
  const bonus = pc > 0 && rec > 2 ? 2 : 0
  return s + bonus
}

export function getMostPlayed<T extends GameLike>(_systemId: string, games: T[]): T[] {
  if (!games || games.length === 0) return []
  const scored = games.map(g => ({ game: g, score: scoreGame(g) })) as Array<{game:T; score:number}>
  scored.sort((a,b) => b.score - a.score)
  // return 3-5 top only if they have some signal, but still return up to 5 even low scored
  const top = scored.slice(0, 5).filter(s => s.score > 0)
  if (top.length >= 3) return top.map(s => s.game)
  // if not enough scored >0, include zero-scored but sorted to fill 3
  if (scored.length >= 3) {
    const fill = scored.slice(0, Math.min(5, Math.max(3, scored.length)))
    return fill.map(s => s.game)
  }
  return scored.map(s => s.game)
}

export function getMostPlayedWithScore<T extends GameLike>(_systemId: string, games: T[]) {
  if (!games || games.length === 0) return [] as ScoredGame<T>[]
  const scored = games.map(g => ({ game: g, score: scoreGame(g), reasonParts: [] as string[] }))
  scored.sort((a,b)=> b.score - a.score)
  return scored.slice(0,5)
}

export function getCuratedFallbackGames(systemId: string, existingGamesCount: number): string[] {
  const need = Math.max(0, 5 - existingGamesCount)
  if (need <= 0) return []
  const curated = getCuratedForSystem(systemId)
  // Return first N not duplicative check caller handles
  return curated.slice(0, need)
}

export function getMostPlayedOrCurated<T extends GameLike>(systemId: string, games: T[]): { played: T[]; fallbackTitles: string[] } {
  const played = getMostPlayed(systemId, games)
  if (played.length >= 3) return { played, fallbackTitles: [] }
  const fallback = getCuratedFallbackGames(systemId, played.length)
  return { played, fallbackTitles: fallback }
}
