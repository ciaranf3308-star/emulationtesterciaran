import type { GameMetadata, MetadataParseResult } from './types'

function getTagText(node: Element, tag: string): string | undefined {
  const el = node.getElementsByTagName(tag)[0]
  if (!el) return undefined
  return el.textContent?.trim() || undefined
}

function parseBool(v?: string): boolean | undefined {
  if (v === undefined) return undefined
  const low = v.toLowerCase()
  if (low === 'true' || low === '1') return true
  if (low === 'false' || low === '0') return false
  return undefined
}

function parseIntField(v?: string): number | undefined {
  if (v === undefined) return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function parseFloatField(v?: string): number | undefined {
  if (v === undefined) return undefined
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

function normalizeTagExtract(block: string, tag: string): string | undefined {
  const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const mm = r.exec(block)
  if (!mm) return undefined
  // strip CDATA wrapper if present
  let v = mm[1].trim()
  if (v.startsWith('<![CDATA[') && v.endsWith(']]>')) {
    v = v.slice(9, -3)
  }
  return v || undefined
}

/** Architecture note: gamelist location is <gamelists root>/<system>/gamelist.xml – machine config supplies authoritative root */
export function getGamelistPath(gamelistRoot: string, systemId: string): string {
  const sep = gamelistRoot.includes('\\') ? '\\' : '/'
  const cleanRoot = gamelistRoot.replace(/[\/\\]+$/g, '')
  return `${cleanRoot}${sep}${systemId}${sep}gamelist.xml`
}

/**
 * Core parser – DOMParser path with fallback regex minimal.
 * Returns GameMetadata[] directly for spec compatibility.
 * For richer error handling, use parseGamelistXmlDetailed.
 */
export function parseGamelistXml(xmlString: string, systemId: string = ''): GameMetadata[] {
  const detailed = parseGamelistXmlDetailed(xmlString, systemId)
  return detailed.games
}

/** Detailed version returning parse errors – used by metadata tooling */
export function parseGamelistXmlDetailed(xmlString: string, systemId: string = ''): MetadataParseResult {
  const parseErrors: MetadataParseResult['parseErrors'] = []
  const games: GameMetadata[] = []

  // Browser path
  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser()
      const parsed = parser.parseFromString(xmlString, 'text/xml')
      const err = parsed.getElementsByTagName('parsererror')[0]
      if (err) {
        parseErrors.push({ path: `gamelist.xml@${systemId}`, message: `XML parse error: ${err.textContent?.slice(0, 200) ?? 'unknown'}` })
        // fallback to regex still for resilience
      } else {
        const gameNodes = parsed.getElementsByTagName('game')
        for (let i = 0; i < gameNodes.length; i++) {
          const node = gameNodes[i]
          try {
            const name = node.getElementsByTagName('name')[0]?.textContent?.trim()
            if (!name) {
              parseErrors.push({ path: `game[${i}]@${systemId}`, message: 'missing <name>' })
              continue
            }
            const pathTag = getTagText(node, 'path') ?? ''
            // ES-DE may include id attribute or <id> etc – handle gracefully
            const idAttr = (node as Element).getAttribute('id') || getTagText(node, 'id') || undefined
            games.push({
              id: idAttr,
              systemId,
              name,
              romPath: pathTag,
              description: getTagText(node, 'desc'),
              developer: getTagText(node, 'developer'),
              publisher: getTagText(node, 'publisher'),
              genre: getTagText(node, 'genre'),
              players: getTagText(node, 'players'),
              rating: parseFloatField(getTagText(node, 'rating')),
              releaseDate: getTagText(node, 'releasedate'),
              favorite: parseBool(getTagText(node, 'favorite')),
              playCount: parseIntField(getTagText(node, 'playcount')),
              playTime: parseIntField(getTagText(node, 'playtime')),
              lastPlayed: getTagText(node, 'lastplayed'),
            })
          } catch (e) {
            parseErrors.push({ path: `game[${i}]@${systemId}`, message: String(e) })
          }
        }
        return { games, parseErrors }
      }
    }
  } catch (e) {
    parseErrors.push({ path: `gamelist.xml@${systemId}`, message: `exception ${String(e)}` })
  }

  // Fallback minimal regex – works in Node / tests and when DOMParser fails
  try {
    const gameRe = /<game[\s\S]*?>([\s\S]*?)<\/game>/gi
    let m: RegExpExecArray | null
    let idx = 0
    while ((m = gameRe.exec(xmlString)) !== null) {
      const block = m[1]
      try {
        const name = normalizeTagExtract(block, 'name')
        if (!name) {
          parseErrors.push({ path: `game[${idx}]@${systemId}`, message: 'missing <name>' })
          idx++
          continue
        }
        const idMatch = /<game[^>]*\sid=["']([^"']+)["']/.exec(m[0])
        const idVal = idMatch ? idMatch[1] : normalizeTagExtract(block, 'id')
        games.push({
          id: idVal,
          systemId,
          name,
          romPath: normalizeTagExtract(block, 'path') ?? '',
          description: normalizeTagExtract(block, 'desc'),
          developer: normalizeTagExtract(block, 'developer'),
          publisher: normalizeTagExtract(block, 'publisher'),
          genre: normalizeTagExtract(block, 'genre'),
          players: normalizeTagExtract(block, 'players'),
          rating: parseFloatField(normalizeTagExtract(block, 'rating')),
          releaseDate: normalizeTagExtract(block, 'releasedate'),
          favorite: parseBool(normalizeTagExtract(block, 'favorite')),
          playCount: parseIntField(normalizeTagExtract(block, 'playcount')),
          playTime: parseIntField(normalizeTagExtract(block, 'playtime')),
          lastPlayed: normalizeTagExtract(block, 'lastplayed'),
          raw: m[0].slice(0, 500),
        })
      } catch (e) {
        parseErrors.push({ path: `game[${idx}]@${systemId}`, message: String(e) })
      }
      idx++
    }
  } catch (e) {
    parseErrors.push({ path: `gamelist.xml@${systemId}`, message: `regex fallback failed ${String(e)}` })
  }

  return { games, parseErrors }
}

/** Previously named parseGamelistXml expecting (xmlString, systemId) => MetadataParseResult – keep alias for compat */
export const parseGamelistXmlForSystem = parseGamelistXmlDetailed

// ---- Selectors – no fake data, pure filtering of parsed data ----

export function getFavorites(games: GameMetadata[]): GameMetadata[] {
  return games.filter(g => g.favorite === true)
}

export function getRecentlyPlayed(games: GameMetadata[], limit: number = 50): GameMetadata[] {
  return games
    .filter(g => g.lastPlayed && g.lastPlayed.trim().length > 0)
    .sort((a, b) => (b.lastPlayed || '').localeCompare(a.lastPlayed || ''))
    .slice(0, limit)
}

export function getAllGames(games: GameMetadata[]): GameMetadata[] {
  return [...games].sort((a, b) => a.name.localeCompare(b.name))
}

export function getGamesBySystem(games: GameMetadata[], systemId: string): GameMetadata[] {
  return games.filter(g => g.systemId === systemId)
}

export function getFavoriteCount(games: GameMetadata[]): number {
  return getFavorites(games).length
}

export function getGamesWithPlayCount(games: GameMetadata[]): GameMetadata[] {
  return games.filter(g => typeof g.playCount === 'number' && (g.playCount as number) > 0)
}

export function getGamesByGenre(games: GameMetadata[], genre: string): GameMetadata[] {
  const low = genre.toLowerCase()
  return games.filter(g => g.genre?.toLowerCase().includes(low))
}

export function searchGames(games: GameMetadata[], query: string): GameMetadata[] {
  const q = query.toLowerCase().trim()
  if (!q) return getAllGames(games)
  return games.filter(g =>
    g.name.toLowerCase().includes(q) ||
    g.description?.toLowerCase().includes(q) ||
    g.genre?.toLowerCase().includes(q) ||
    g.developer?.toLowerCase().includes(q)
  )
}

