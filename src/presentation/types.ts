/**
 * Presentation contract – hardware asset + stage geometry – V7 calibrated
 *
 * Keep generic, no hardcoded GBA dimensions in types themselves.
 * Stage geometry defined in per-system configs, content supplied at runtime.
 * V7 extends to support full hardware calibration.
 */

import type { GameplayRegionDefinition } from '../stage/types'

export type ScreenCount = 1 | 2

// ──────────────────────────────────────────────────────────────
// V7 additions – media fitting / presentation typing
// ──────────────────────────────────────────────────────────────

export type MediaFitMode = 'contain' | 'cover' | 'stretch' | 'calibrated'
export type PresentationType = 'handheld' | 'tv' | 'hybrid' | 'desktop' | 'board'

export interface UISafeRegion {
  /** top chrome (header / countdown) safe inset % */
  top?: number
  /** bottom chrome (carousel / system switcher) safe inset % */
  bottom?: number
  left?: number
  right?: number
}

export interface PhysicalMediaTransform {
  rest: {
    x: number // %
    y: number
    scale: number
    rotation?: number
    depth?: number
  }
  insertTarget: {
    x: number
    y: number
    scale: number
    rotation?: number
    depth?: number
  }
  durationMs?: number
  easing?: string
  depth?: number
}

export interface InsertionAnimationConfig extends PhysicalMediaTransform {
  type?: 'insert' | 'slide' | 'fade'
}

export interface MaskRef {
  url: string
  regionId?: string
}

export interface AssetRef {
  providerId: string
  relativePath: string
  baseRoot: string
  url?: string // resolved
}

export interface HardwareAssetDefinition {
  providerId: string
  path: string // relative path inside provider root
  baseRoot?: string // e.g. "/assets/hardware/" or "/assets/Crystal-Frontend-Asset-Pack/"
  assetRef?: AssetRef
  url?: string // resolved url for direct use
  alternateUrl?: string
  alternates?: string[]
}

export type HardwareForegroundAsset = string | HardwareAssetDefinition

export interface GameplayRegionDefinitionExtended extends GameplayRegionDefinition {
  fit?: MediaFitMode
  cornerRadius?: number | string // e.g. 8 or "6%" or "12px"
  maskUrl?: string
  zIndex?: number
  /** intrinsic media transform per region (rare) */
  mediaTransform?: { scale?: number; rotate?: number }
  /** label still supported */
  label?: string
}

export { type GameplayRegionDefinition } from '../stage/types'

export interface PhysicalMediaPlacement {
  type: 'cart' | 'disc' | 'umd' | 'none'
  transform: PhysicalMediaTransform
  /** Optional slot/tray target – more explicit than insertTarget */
  slotTarget?: { x: number; y: number; scale?: number; rotation?: number }
  insertionAxis?: 'x' | 'y' | 'z' | 'xy' | 'arc' | 'vertical' | 'horizontal'
  insertionPath?: 'straight' | 'arc' | 'vertical' | 'horizontal' | 'slot'
  /** optional relative z ordering */
  zIndex?: number
  slotMask?: string
}

export interface SystemPresentationConfig {
  systemId: string
  fullName?: string
  // legacy single system kept + new union for alternates
  hardwareForeground?: HardwareForegroundAsset
  /** Optional alternate hardware foreground (e.g. Wii red vs white) */
  hardwareForegroundAlternate?: string
  /** All hardware alternates preserved if useful (Steam has 2, Wii has 2) */
  hardwareForegroundAlternates?: string[]
  gameplayRegions: GameplayRegionDefinitionExtended[]
  /** Legacy single optional for backward compat – new code should use physicalMediaPlacement */
  physicalMedia?: {
    type: 'cart' | 'disc' | 'board' | 'none' | 'umd'
    transform: PhysicalMediaTransform
  }
  /** V7 canonical physical media placement */
  physicalMediaPlacement?: PhysicalMediaPlacement
  screenMasks?: Record<string, string> // regionId -> mask url/provider ref path
  slotMasks?: Record<string, string>
  screenCount: ScreenCount
  hasPhysicalMedia: boolean
  aspect?: string
  /** Optional: single screenMask/slotMask shorthand – presented as Record under hood */
  screenMask?: string
  slotMask?: string

  // ── V7 explicit fields ──
  /** Presentation category – handheld / tv / hybrid / desktop */
  presentationType?: PresentationType
  /** Foreground hardware z-index (default 4) */
  foregroundZIndex?: number
  /** Gameplay media z-index (default 2) */
  mediaZIndex?: number
  /** UI safe region insets */
  uiSafe?: UISafeRegion
  /** Optional tags for future insertion animation */
  insertionAnimation?: InsertionAnimationConfig
}
