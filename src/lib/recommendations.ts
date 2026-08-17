/**
 * Recommendations For You – local scoring, no server ML.
 * All local scoring in src/lib/recommendations.ts
 * Scoring function recommendForUser(allGames, favorites, last10, curated) -> sorted.
 * For You scoring: system affinity (count favorites/played per system) × genre match (parse gamelist genre tag) × unplayed (playCount==0)
 * Last 10 played + favorites as seed. Trending = curatedPopular cross-system top. New = least played / recent addition.
 * Show reason line Because you loved X (pick highest seed scorer).
 */

import type { GameEntry } from '../runtime/backend'
import { getCuratedCrossSystemTop } from '../data/curatedPopular'

type GameLike = GameEntry & {
  genre?: string | null
  play_count?: number | string | null
  playcount?: number | string | null
  last_played?: string | null
  lastplayed?: string | null
  playtime?: number | string | null
}

function parsePlayCount(g: GameLike): number {
  const raw = (g as any).play_count ?? (g as any).playcount ?? (g as any).play_count
  if (raw == null) return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  return isNaN(n) ? 0 : n
}

function parseLastMs(g: GameLike): number | null {
  const raw = (g as any).last_played ?? (g as any).lastplayed
  if (!raw) return null
  const t = String(raw).trim()
  const m = t.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    return d.getTime() || null
  }
  const ms = Date.parse(t)
  return isNaN(ms) ? null : ms
}

export type Recommendation = {
  game: GameLike
  score: number
  reason: string // "Because you loved X"
  seedId?: string
  tags: string[]
}

function normalizeGenre(g?: string | null): string {
  if (!g) return ''
  return String(g).trim().toLowerCase()
}

export function buildAffinity(favorites: GameLike[], last10: GameLike[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const g of [...favorites, ...last10]) {
    const sys = (g as any).system_id || (g as any).systemId || 'unknown'
    map.set(sys, (map.get(sys) || 0) + 1)
  }
  // boost favorites double
  for (const g of favorites) {
    const sys = (g as any).system_id || 'unknown'
    map.set(sys, (map.get(sys) || 0) + 1)
  }
  return map
}

export function buildGenreAffinity(favorites: GameLike[], last10: GameLike[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const g of [...favorites, ...last10]) {
    const genre = normalizeGenre((g as any).genre)
    if (!genre) continue
    // split on /, comma
    const parts = genre.split(/[\/,;|]/).map(s=>s.trim().toLowerCase()).filter(Boolean)
    for (const p of parts) map.set(p, (map.get(p)||0)+1)
    // also whole
    map.set(genre, (map.get(genre)||0)+1)
  }
  return map
}

export function recommendForUser(
  allGames: GameLike[],
  favorites: GameLike[] = [],
  last10: GameLike[] = [],
  _curated?: Array<{ systemId: string; title: string }>
): Recommendation[] {
  if (!allGames || allGames.length === 0) return []

  const seedSet = new Set<string>()
  const seedGames: GameLike[] = []
  for (const g of [...favorites, ...last10]) {
    const id = (g as any).id || `${(g as any).system_id}:${(g as any).rom_basename}`
    if (!seedSet.has(id)) { seedSet.add(id); seedGames.push(g) }
  }

  const affinity = buildAffinity(favorites, last10)
  const genreAff = buildGenreAffinity(favorites, last10)

  // candidate pool: allGames excluding seeds (to recommend unplayed/new)
  const candidates = allGames.filter(g => {
    const id = (g as any).id || `${(g as any).system_id}:${(g as any).rom_basename}`
    return !seedSet.has(id)
  })

  const results: Recommendation[] = candidates.map(cand => {
    const sys = (cand as any).system_id || (cand as any).systemId || 'unknown'
    const sysScore = affinity.get(sys) || 0.2 // base 0.2 if no affinity
    const genreNorm = normalizeGenre((cand as any).genre)
    let genreScore = 0
    let matchingGenre: string | null = null
    if (genreNorm) {
      const parts = genreNorm.split(/[\/,;|]/).map(s=>s.trim()).filter(Boolean)
      for (const p of [...parts, genreNorm]) {
        const gscore = genreAff.get(p) || 0
        if (gscore > genreScore) { genreScore = gscore; matchingGenre = p }
      }
    }
    const hasGenre = genreScore > 0 ? 1 + genreScore*0.4 : 1
    const pc = parsePlayCount(cand)
    const unplayedBonus = pc === 0 ? 1.6 : 0.7 + Math.max(0, 1/(pc+1))*0.3 // unplayed triple weighted per spec

    // system affinity × genre match × unplayed (spec)
    const rawScore = (Math.max(0.3, sysScore) * hasGenre * unplayedBonus) + (genreScore*0.3)

    // pick seed that best explains: highest affinity system match + genre match
    let bestSeed: GameLike | undefined
    let bestExplainScore = -1
    for (const seed of seedGames) {
      let s = 0
      if ((seed as any).system_id === sys) s += 2
      const sg = normalizeGenre((seed as any).genre)
      if (sg && genreNorm && (sg === genreNorm || sg.includes(genreNorm) || genreNorm.includes(sg))) s += 3
      if (s > bestExplainScore) { bestExplainScore = s; bestSeed = seed }
    }
    const reason = bestSeed ? `Because you loved ${(bestSeed as any).name || (bestSeed as any).rom_basename}` : (favorites[0] ? `Because you favorited ${(favorites[0] as any).name}` : `Popular in ${sys}`)
    return {
      game: cand,
      score: rawScore,
      reason,
      seedId: bestSeed ? ((bestSeed as any).id || (bestSeed as any).rom_basename) : undefined,
      tags: [sys, ...(matchingGenre ? [matchingGenre] : []), pc===0?'unplayed':'played'].filter(Boolean) as string[]
    }
  })

  results.sort((a,b)=> b.score - a.score)
  return results
}

export function getTrending(allGames: GameLike[], curatedRaw?: Array<{ systemId: string; title: string }>) {
  // Trending = curatedPopular cross-system top, but if allGames contains matching titles boost them
  const curated = curatedRaw ?? getCuratedCrossSystemTop(20)
  // Map title lower to curated order
  const curatedMap = new Map<string, number>()
  curated.forEach((c,i)=> curatedMap.set(c.title.toLowerCase(), i))

  // Score allGames by curated presence + playCount
  const scored = allGames.map(g => {
    const nameLc = String((g as any).name || (g as any).rom_basename || '').toLowerCase()
    let base = 0
    if (curatedMap.has(nameLc)) base = 20 - (curatedMap.get(nameLc) || 0)
    else {
      // partial match? check curated title contains game name
      for (const [ct, idx] of curatedMap.entries()) {
        if (nameLc.includes(ct) || ct.includes(nameLc)) { base = 10 - idx*0.2; break }
      }
    }
    const pc = parsePlayCount(g)
    base += Math.min(pc*0.3, 4)
    return { game: g, score: base, isCurated: curatedMap.has(nameLc) }
  }).filter(s=> s.score>0)

  scored.sort((a,b)=> b.score - a.score)
  return scored.slice(0, 20).map(s=> ({ game: s.game, score: s.score, reason: s.isCurated ? 'Trending now' : 'Popular in your library' }))
}

export function getNewReleases(allGames: GameLike[]): Array<{ game: GameLike; score: number; reason: string }> {
  // New = least played / recent addition (last_played null, or file modified? use last_played null as proxy + unplayed)
  // Least played: playCount==0 first, then low playCount, then null last_played (never played => newest to user)
  const now = Date.now()
  const scored = allGames.map(g => {
    const pc = parsePlayCount(g)
    const lastMs = parseLastMs(g)
    // least played high score if pc==0
    let score = 0
    if (pc === 0) score += 8
    else score += Math.max(0, 5 - pc)
    if (lastMs == null) score += 6 // never played = recent addition in sense
    else {
      // If added recently but not played? we don't have file mtime, use last_played recency inverse? recent play maybe not new
      // Use recency of last play as low for new, but we want recent addition, so treat lastMs null higher.
      const diffDays = (now - lastMs)/(1000*60*60*24)
      if (diffDays > 180) score += 1 // old but not played recently?
    }
    return { game: g, score, reason: pc===0 ? 'Never played – new to you' : 'Rarely played' }
  })
  scored.sort((a,b)=> b.score - a.score)
  return scored.slice(0, 20)
}
