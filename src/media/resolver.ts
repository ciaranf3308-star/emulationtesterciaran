import type { MediaCategoryDetails, GameMedia, MediaType, MediaResolverConfig, ResolvedMediaCandidate, ResolvedMediaPath, SystemMediaSummary, MediaAvailability } from './types'
import { MEDIA_TYPE_EXTENSIONS } from './types'
import type { MachineSystem } from '../machine/types'

/**
 * Media Resolver – boundary for path/file resolution logic.
 * React components must NOT compute media paths directly; call these functions.
 * No hardcoded default Windows emulation root (hardcoded path) – caller provides mediaRoot from roots.scrapedMedia.
 *
 * Pattern authoritative: <root>/<system>/<media-type>/<ROM basename>.<ext>
 * Exception handling: some ROMs have translation tags causing non-direct matches.
 *   audit shows exceptionSamples e.g. "Pokemon Moon (USA) (En,Ja,Fr,De,Es,It,Zh,Ko).jpg"
 *   vs ROM basename that may be truncated in FS. We expose exceptionSamples for backend verification.
 */

// ---- helpers ----

function usesBackslash(root: string): boolean {
  return root.includes('\\')
}

export function normalizeSep(path: string): string {
  // preserve incoming separator style for display; normalization here for consistency helper.
  return path.replace(/\//g, '\\')
}

function joinMediaRoot(root: string, ...segments: string[]): string {
  const sep = usesBackslash(root) ? '\\' : '/'
  // trim trailing seps from root, trim both sides from segments
  let out = root.replace(/[\/\\]+$/g, '')
  for (const seg of segments) {
    const clean = seg.replace(/^[\/\\]+/, '').replace(/[\/\\]+$/g, '')
    if (clean.length === 0) continue
    out += sep + clean
  }
  return out
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx > 0) return name.slice(0, idx)
  return name
}

function getFileNameFromPath(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const last = norm.split('/').pop() || p
  return last
}

function getBasenameFromMediaPath(fullPath: string): string {
  const file = getFileNameFromPath(fullPath)
  return stripExtension(file)
}

function sanitizeBasenameForFs(basename: string): string {
  // Minimal sanitizing – keep original otherwise (ES-DE preserves special chars)
  return basename.trim()
}

// Primary extension per type (first in MEDIA_TYPE_EXTENSIONS)
function primaryExtensionForType(mediaType: MediaType): string {
  const exts = MEDIA_TYPE_EXTENSIONS[mediaType]
  return exts && exts.length > 0 ? exts[0] : ''
}

// All candidates with extensions
export function getMediaCandidates(
  mediaRoot: string,
  systemId: string,
  mediaType: MediaType,
  romBasename: string
): string[] {
  const base = joinMediaRoot(mediaRoot, systemId, mediaType, sanitizeBasenameForFs(romBasename))
  const exts = MEDIA_TYPE_EXTENSIONS[mediaType] || ['.jpg']
  return exts.map(ext => base + ext)
}

// ---- spec-required function ----

/**
 * Compute expected media path.
 * Returns primary path with likely extension (first in ext list).
 * Backend will verify existence – extension unknown without FS.
 */
export function resolveMediaPath(
  mediaRoot: string,
  systemId: string,
  mediaType: MediaType,
  romBasename: string,
  categoryDetails?: MediaCategoryDetails
): string {
  const primaryExt = primaryExtensionForType(mediaType)
  const base = joinMediaRoot(mediaRoot, systemId, mediaType, sanitizeBasenameForFs(romBasename))
  const primary = base + primaryExt
  void categoryDetails // retained for API compatibility, used in detailed resolver
  return primary
}

/**
 * Detailed resolver exposing exception risk for backend verification.
 */
export function resolveMediaPathDetailed(
  mediaRoot: string,
  systemId: string,
  mediaType: MediaType,
  romBasename: string,
  categoryDetails?: MediaCategoryDetails
): ResolvedMediaPath {
  const baseWithoutExtension = joinMediaRoot(mediaRoot, systemId, mediaType, sanitizeBasenameForFs(romBasename))
  const candidates = getMediaCandidates(mediaRoot, systemId, mediaType, romBasename)
  const primary = candidates[0] || baseWithoutExtension

  const exceptionSamples = categoryDetails?.exceptionSamples ?? []
  const hasExceptionRisk = (categoryDetails?.nonDirectBasenameCount ?? 0) > 0 || exceptionSamples.length > 0

  const exceptionBasenameAlts = exceptionSamples.map(getBasenameFromMediaPath).filter(b => b !== romBasename).slice(0, 5)

  return {
    primary,
    baseWithoutExtension,
    candidates,
    basename: romBasename,
    mediaType,
    hasExceptionRisk,
    exceptionSamples,
    exceptionBasenameAlts,
    categoryExists: categoryDetails?.exists ?? true,
  }
}

export function expectedMediaPath(
  mediaRoot: string,
  systemId: string,
  mediaType: MediaType,
  romBasename: string,
  extensionHint: string = '.*'
): string {
  const root = mediaRoot.endsWith('\\') || mediaRoot.endsWith('/') ? mediaRoot.slice(0, -1) : mediaRoot
  const sep = usesBackslash(root) ? '\\' : '/'
  const cleanHint = extensionHint.replace(/^\./, '')
  return `${root}${sep}${systemId}${sep}${mediaType}${sep}${sanitizeBasenameForFs(romBasename)}.${cleanHint}`
}

export function resolveMediaCandidates(
  config: MediaResolverConfig,
  mediaType: MediaType,
  romBasename: string,
  category?: MediaCategoryDetails
): ResolvedMediaCandidate {
  const detailed = resolveMediaPathDetailed(config.mediaRoot, config.systemId, mediaType, romBasename, category)
  const directory = category?.directory ?? joinMediaRoot(config.mediaRoot, config.systemId, mediaType)
  const directMatchLikelihood = category ? category.directRomBasenameMatches / Math.max(1, category.fileCount) : 0
  const alternatives: string[] = []
  if (category?.exceptionSamples && category.exceptionSamples.length > 0) {
    alternatives.push(...category.exceptionSamples.slice(0, 3))
  }
  // also add additional candidate extensions as alternatives beyond primary
  for (const cand of detailed.candidates.slice(1)) {
    if (!alternatives.includes(cand)) alternatives.push(cand)
  }
  return {
    primaryPath: detailed.primary,
    alternatives,
    directory,
    expectsExtension: '*',
    exceptionSamples: category?.exceptionSamples ?? [],
    directMatchLikelihood,
  }
}

// Overload-friendly summary: accepts (system) or (systemId, media) or (systemObject, mediaObject)
export function getSystemMediaSummary(
  system: MachineSystem | { id: string; media?: MediaAvailability | Record<string, MediaCategoryDetails | undefined> } | string,
  mediaArg?: MediaAvailability | Record<string, MediaCategoryDetails | undefined>
): SystemMediaSummary {
  let systemId: string
  let media: Record<string, MediaCategoryDetails | undefined>

  if (typeof system === 'string') {
    systemId = system
    media = (mediaArg ?? {}) as Record<string, MediaCategoryDetails | undefined>
  } else if (system && typeof (system as { media?: unknown }).media === 'object' && mediaArg === undefined) {
    // system object containing media
    const sys = system as { id: string; media?: Record<string, MediaCategoryDetails | undefined> }
    systemId = sys.id
    media = (sys.media ?? {}) as Record<string, MediaCategoryDetails | undefined>
  } else {
    const sys = system as { id: string }
    systemId = sys.id
    media = (mediaArg ?? {}) as Record<string, MediaCategoryDetails | undefined>
  }

  const entries = Object.entries(media).filter(([, v]) => v !== undefined) as Array<[string, MediaCategoryDetails]>
  const totalFiles = entries.reduce((acc, [, c]) => acc + (c.fileCount ?? 0), 0)
  const categoriesPresent = entries.filter(([, c]) => c.exists).length
  const totalKnown = entries.length
  return {
    systemId,
    totalFiles,
    categoriesPresent,
    categoriesMissing: Math.max(0, totalKnown - categoriesPresent),
    categories: entries.map(([type, c]) => ({
      type,
      fileCount: c.fileCount,
      exists: c.exists,
      directMatches: c.directRomBasenameMatches,
      nonDirectCount: c.nonDirectBasenameCount,
      hasExceptions: c.nonDirectBasenameCount > 0 || c.exceptionSamples.length > 0,
    })),
  }
}

/** Build GameMedia resolved paths for a given rom basename (frontend placeholders – backend verifies) */
export function buildGameMedia(
  mediaRoot: string,
  system: MachineSystem | { id: string; media: MediaAvailability | Record<string, MediaCategoryDetails | undefined> },
  romBasename: string
): GameMedia {
  const gm: GameMedia = {}
  const root = mediaRoot
  const media = (system as { media: Record<string, MediaCategoryDetails | undefined> }).media || {}
  if (media.covers) gm.cover = resolveMediaPath(root, system.id, 'covers', romBasename, media.covers)
  if (media.physicalmedia) gm.physicalMedia = resolveMediaPath(root, system.id, 'physicalmedia', romBasename, media.physicalmedia)
  if (media.screenshots) gm.screenshot = resolveMediaPath(root, system.id, 'screenshots', romBasename, media.screenshots)
  if (media.titlescreens) gm.titleScreen = resolveMediaPath(root, system.id, 'titlescreens', romBasename, media.titlescreens)
  if (media.videos) gm.video = resolveMediaPath(root, system.id, 'videos', romBasename, media.videos)
  if (media.marquees) gm.marquee = resolveMediaPath(root, system.id, 'marquees', romBasename, media.marquees)
  if (media.miximages) gm.mixImage = resolveMediaPath(root, system.id, 'miximages', romBasename, media.miximages)
  return gm
}

/** Resolve all media types for ROM into GameMedia with candidate tracking */
export function resolveAllMedia(
  mediaRoot: string,
  systemId: string,
  romBasename: string,
  availability?: MediaAvailability
): { media: GameMedia; detailed: Record<string, ResolvedMediaPath> } {
  const types: MediaType[] = ['covers', 'physicalmedia', 'screenshots', 'titlescreens', 'videos', 'marquees', 'miximages']
  const detailed: Record<string, ResolvedMediaPath> = {}
  const media: GameMedia = {}
  const mapKey: Record<MediaType, keyof GameMedia> = {
    covers: 'cover',
    physicalmedia: 'physicalMedia',
    screenshots: 'screenshot',
    titlescreens: 'titleScreen',
    videos: 'video',
    marquees: 'marquee',
    miximages: 'mixImage',
  }
  for (const t of types) {
    const cat = availability?.[t]
    const det = resolveMediaPathDetailed(mediaRoot, systemId, t, romBasename, cat)
    detailed[t] = det
    if (!cat || cat.exists) {
      ;(media as Record<string, string | undefined>)[mapKey[t] as string] = det.primary
    }
  }
  return { media, detailed }
}

