/**
 * Presentation contract – hardware asset + stage geometry
 *
 * Keep generic, no hardcoded GBA dimensions.
 * Stage geometry defined here, content supplied at runtime.
 */

import type { GameplayRegionDefinition } from '../stage/types'

export type ScreenCount = 1 | 2

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
}

export interface GameplayRegionDefinitionExtended extends GameplayRegionDefinition {
  // extend if needed; keeps same shape for now
}

export { type GameplayRegionDefinition } from '../stage/types'

export interface SystemPresentationConfig {
  systemId: string
  fullName?: string
  hardwareForeground?: HardwareAssetDefinition | string // allow string legacy
  gameplayRegions: GameplayRegionDefinition[]
  physicalMedia?: {
    type: 'cart' | 'disc' | 'board' | 'none'
    transform: PhysicalMediaTransform
  }
  screenMasks?: Record<string, string> // regionId -> mask url/provider ref path
  slotMasks?: Record<string, string>
  screenCount: ScreenCount
  hasPhysicalMedia: boolean
  aspect?: string
  /** Optional: single screenMask/slotMask shorthand – presented as Record under hood */
  screenMask?: string
  slotMask?: string
}
