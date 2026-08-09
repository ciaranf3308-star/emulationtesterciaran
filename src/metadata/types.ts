export interface GameMetadata {
  id?: string
  name: string
  description?: string
  developer?: string
  publisher?: string
  genre?: string
  players?: string
  rating?: number
  releaseDate?: string
  favorite?: boolean
  playCount?: number
  playTime?: number
  lastPlayed?: string
  /** Path from gamelist.xml <path>, e.g. "./My Game.zip" or "./Game.iso" */
  romPath: string
  systemId: string
  // raw source xml snippet preserved for debugging (optional)
  raw?: string
}

export type GameList = GameMetadata[]

export interface MetadataParseResult {
  games: GameMetadata[]
  parseErrors: Array<{ path: string; message: string }>
}

export interface GamelistInfo {
  systemId: string
  gamelistPath: string
  gameCount: number
}

export const GAMELIST_FIELDS = [
  'name',
  'desc',
  'developer',
  'publisher',
  'genre',
  'players',
  'rating',
  'releasedate',
  'favorite',
  'playcount',
  'playtime',
  'lastplayed',
  'path',
] as const
