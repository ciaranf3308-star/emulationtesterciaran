/**
 * Media Domain – authoritative types
 * Pattern: <root>/<system>/<media-type>/<ROM basename>.<ext>
 * No hardcoded default Windows emulation root (hardcoded path) – root supplied via MediaResolverConfig / roots.scrapedMedia
 */
export type MediaType = 'covers' | 'physicalmedia' | 'screenshots' | 'titlescreens' | 'videos' | 'marquees' | 'miximages'

export const MEDIA_TYPES: readonly MediaType[] = [
  'covers',
  'physicalmedia',
  'screenshots',
  'titlescreens',
  'videos',
  'marquees',
  'miximages',
] as const
export const KNOWN_MEDIA_TYPES: readonly MediaType[] = MEDIA_TYPES

export interface MediaCategoryDetails {
  directory: string
  exists: boolean
  fileCount: number
  directRomBasenameMatches: number
  nonDirectBasenameCount: number
  filenamePattern: string
  exceptionSamples: string[]
}

export type MediaAvailability = {
  [K in MediaType]?: MediaCategoryDetails
} & {
  [extra: string]: MediaCategoryDetails | undefined
}

export interface GameMedia {
  cover?: string
  physicalMedia?: string
  screenshot?: string
  titleScreen?: string
  video?: string
  marquee?: string
  mixImage?: string
  // extensible for future types
  [k: string]: string | undefined
}

export interface MediaResolverConfig {
  mediaRoot: string
  systemId: string
}

export interface ResolvedMediaCandidate {
  primaryPath: string
  alternatives: string[]
  directory: string
  expectsExtension: string
  exceptionSamples: string[]
  directMatchLikelihood: number
}

export interface ResolvedMediaPath {
  primary: string
  baseWithoutExtension: string
  candidates: string[]
  basename: string
  mediaType: MediaType
  hasExceptionRisk: boolean
  exceptionSamples: string[]
  exceptionBasenameAlts: string[]
  categoryExists: boolean
}

export interface SystemMediaSummary {
  systemId: string
  totalFiles: number
  categoriesPresent: number
  categoriesMissing: number
  categories: Array<{
    type: MediaType | string
    fileCount: number
    exists: boolean
    directMatches: number
    nonDirectCount: number
    hasExceptions: boolean
  }>
}

export const MEDIA_TYPE_EXTENSIONS: Record<MediaType, readonly string[]> = {
  covers: ['.jpg', '.png', '.jpeg'],
  physicalmedia: ['.png', '.jpg'],
  screenshots: ['.jpg', '.png'],
  titlescreens: ['.png', '.jpg'],
  videos: ['.mp4', '.avi', '.mkv'],
  marquees: ['.png', '.jpg'],
  miximages: ['.png', '.jpg'],
}

export function isMediaType(v: unknown): v is MediaType {
  return typeof v === 'string' && (MEDIA_TYPES as readonly string[]).includes(v)
}

