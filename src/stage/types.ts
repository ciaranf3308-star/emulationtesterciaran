/**
 * SystemStage types — 5-layer architecture
 *
 * Layers (render order, independent DOM):
 *  1. environment/background
 *  2. gameplay video/screenshot
 *  3. physical media (cart/disc/board)
 *  4. transparent console/hardware foreground
 *  5. UI chrome (children)
 *
 * Must support multiple gameplay regions for DS/3DS dual-screen.
 * Do NOT flatten into one artwork image.
 *
 * V4 refactor:
 * - GameMedia duplicate removed – canonical import from media/types.ts
 * - physicalMedia geometry vs runtime content separated
 * - screenMask/slotMask are real CSS masks, not display:none
 * - DS/3DS gameplaySources per region, truthful single-source handling
 * - PhysicalMediaTransform ready for insertion animation
 */

import type { GameMedia as CanonicalGameMedia } from '../media/types'

export type Theme = 'light' | 'dark'

/* -------------------------------------------------------------------------
 * Geometry
 * -----------------------------------------------------------------------*/

export type MediaFitMode = 'contain' | 'cover' | 'stretch' | 'calibrated'
export type PresentationType = 'handheld' | 'tv' | 'hybrid' | 'desktop' | 'board'

export interface UISafeRegion {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export interface GameplayRegion {
  id: string
  /** Position in % (0-100) relative to stage */
  x: number
  y: number
  width: number
  height: number
  aspectRatio?: number // e.g. 4/3, 16/9
  maskId?: string
  /** Optional label for dev guides */
  label?: string
  // V7 calibrated extensions
  fit?: MediaFitMode
  cornerRadius?: number | string // e.g. 8 or "6%"
  maskUrl?: string
  zIndex?: number
  mediaTransform?: MediaTransform
}

/** Alias for presentation contract – same shape */
export type GameplayRegionDefinition = GameplayRegion

export interface MediaTransform {
  scale?: number
  rotate?: number // degrees
  perspective?: number // px for perspective
}

export interface AnimationConfig {
  entrance?: 'fade' | 'slide' | 'insert'
  durationMs?: number
  easing?: string
}

/* -------------------------------------------------------------------------
 * Physical media – geometry vs runtime separation
 * -----------------------------------------------------------------------*/

export interface PhysicalMediaTransform {
  /** Rest pose inside stage */
  rest: {
    x: number // % or pxnormalized? keep number as % for stage; renderer interprets
    y: number
    scale: number
    rotation?: number // degrees
    depth?: number // z-index tweak
  }
  /** Insertion target when cartridge goes in */
  insertTarget: {
    x: number
    y: number
    scale: number
    rotation?: number
    depth?: number
  }
  durationMs?: number
  easing?: string
  depth?: number // global depth layer
}

/** Variant used by presentation contract – insertion specific */
export interface InsertionAnimationConfig extends PhysicalMediaTransform {
  type?: 'insert' | 'slide' | 'fade'
}

/** Physical media config – geometry only, no content URL */
export interface PhysicalMediaConfig {
  type: 'cart' | 'disc' | 'board' | 'none'
  transform?: PhysicalMediaTransform
  /** Optional entrance animation overriding transform timing */
  animation?: InsertionAnimationConfig
}

/* -------------------------------------------------------------------------
 * Canonical media – single source of truth
 * -----------------------------------------------------------------------*/

/** Re-export canonical GameMedia – single source */
export type { GameMedia as CanonicalGameMedia } from '../media/types'

/**
 * PresentationGameMedia extends canonical GameMedia for Stage runtime.
 * Canonical fields: cover, physicalMedia, screenshot, titleScreen, video, marquee, mixImage
 * Stage convenience aliases (deprecated but supported for compat): screenshotUrl, videoUrl, posterUrl
 */
export interface PresentationGameMedia extends CanonicalGameMedia {
  /** Compat alias for screenshot */
  screenshotUrl?: string
  videoUrl?: string
  posterUrl?: string
  /** Also allow physical media alias */
  physicalMediaUrl?: string
  /** cover alias */
  coverUrl?: string
}

/** Legacy name – keep for import compat, points to PresentationGameMedia */
export type GameMedia = PresentationGameMedia

/* -------------------------------------------------------------------------
 * Gameplay sources per region – DS/3DS truthful rendering
 * -----------------------------------------------------------------------*/

export interface GameplaySource {
  regionId: string
  url?: string
  posterUrl?: string
  mediaType: 'video' | 'screenshot'
  alt?: string
}

/* -------------------------------------------------------------------------
 * SystemStageConfig – stage-time geometry (no runtime URLs for physical media)
 * -----------------------------------------------------------------------*/

export interface SystemStageConfig {
  systemId: string
  fullName: string
  /** background can be explicit url OR theme-mapped light/dark */
  background?: {
    light?: string
    dark?: string
    url?: string
  }
  /** One or more gameplay regions — DS/3DS uses 2 */
  gameplayRegions: GameplayRegion[]
  /** Geometry of physical media slot */
  physicalMediaConfig?: PhysicalMediaConfig
  /** Legacy field – still read but physicalMediaConfig takes precedence */
  physicalMedia?: {
    type: 'cart' | 'disc' | 'board' | 'umd' | 'none'
    url?: string
    transform?: PhysicalMediaTransform
  }
  hardwareForeground?: string
  /** Optional alternate hardware foreground asset (e.g. Wii red vs white, Steam transparent vs fallback) */
  hardwareForegroundAlternate?: string
  hardwareForegroundAlternates?: string[]
  /** Single mask applied to all gameplay regions (simple consoles) */
  screenMask?: string
  /** Slot occlusion mask for physical media */
  slotMask?: string
  /** Per-region masks – presentation contract uses Record<regionId,string> */
  screenMasks?: Record<string, string>
  slotMasks?: Record<string, string>
  mediaTransform?: MediaTransform
  animation?: AnimationConfig

  // V7 calibration extensions
  presentationType?: PresentationType
  foregroundZIndex?: number
  mediaZIndex?: number
  uiSafe?: UISafeRegion
  /** V7 canonical physical media placement (new) – preferred over legacy physicalMediaConfig */
  physicalMediaPlacement?: {
    type: 'cart' | 'disc' | 'umd' | 'none'
    transform: PhysicalMediaTransform
    slotTarget?: { x: number; y: number; scale?: number; rotation?: number }
    insertionAxis?: 'x' | 'y' | 'z' | 'xy' | 'arc' | 'vertical' | 'horizontal'
    insertionPath?: 'straight' | 'arc' | 'vertical' | 'horizontal' | 'slot'
    zIndex?: number
    slotMask?: string
  }
  insertionAnimation?: InsertionAnimationConfig
}

/* -------------------------------------------------------------------------
 * Stage props – runtime
 * -----------------------------------------------------------------------*/

export interface SystemStageProps {
  config: SystemStageConfig
  theme: Theme
  /** Legacy single media (canonical or compat) – if gameplaySources not supplied, fallback to this */
  media?: PresentationGameMedia
  /** Per-region gameplay sources – DS/3DS main contract */
  gameplaySources?: GameplaySource[]
  selected?: boolean
  /** Optional explicit background url override (resolved asset) */
  backgroundUrl?: string
  /** Runtime URL for physical media (cart/disc image for selected game) */
  physicalMediaUrl?: string
  /** Legacy alias – same as physicalMediaUrl */
  physicalMediaImageUrl?: string
  /** Show region outlines for DS/3DS dev debugging */
  showGuides?: boolean
  /** UI chrome above all layers */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Visual hierarchy – storefront (browsing) vs library (entered console) */
  isEntered?: boolean
  mode?: 'storefront' | 'library'
}

/* Re-export for external consumers */
export type {
  GameplayRegion as Region,
}
