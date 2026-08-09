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
 */

export type Theme = 'light' | 'dark'

export interface GameplayRegion {
  id: string
  /** Position in % (0-100) relative to stage, or px if >100 — we normalize to % via CSS */
  x: number
  y: number
  width: number
  height: number
  aspectRatio?: number // e.g. 4/3, 16/9
  maskId?: string
  /** Optional label for dev guides */
  label?: string
}

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
  physicalMedia?: {
    type: 'cart' | 'disc' | 'board'
    url?: string
  }
  hardwareForeground?: string
  screenMask?: string
  slotMask?: string
  mediaTransform?: MediaTransform
  animation?: AnimationConfig
}

/** Minimal media stub if media domain not yet available */
export interface GameMedia {
  screenshotUrl?: string
  videoUrl?: string
  posterUrl?: string
}

export interface SystemStageProps {
  config: SystemStageConfig
  theme: Theme
  media?: GameMedia
  selected?: boolean
  /** Optional explicit background url override (resolved asset) */
  backgroundUrl?: string
  /** Show region outlines for DS/3DS dev debugging */
  showGuides?: boolean
  /** UI chrome above all layers */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
