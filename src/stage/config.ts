/**
 * Preset SystemStage configs — demonstrates dual-screen support and single-screen defaults.
 * Real configs would be sourced from machine/config validation, this is a lightweight preset for UI dev.
 */

import type { SystemStageConfig } from './types'

function singleRegion(): SystemStageConfig['gameplayRegions'] {
  return [
    { id: 'main', x: 18, y: 18, width: 64, height: 64, aspectRatio: 4 / 3, label: 'main' },
  ]
}

export const SINGLE_SCREEN: SystemStageConfig = {
  systemId: 'ps2',
  fullName: 'PlayStation 2',
  gameplayRegions: singleRegion(),
}

export const DUAL_SCREEN_NDS: SystemStageConfig = {
  systemId: 'nds',
  fullName: 'Nintendo DS',
  gameplayRegions: [
    { id: 'top', x: 25, y: 10, width: 50, height: 35, aspectRatio: 4 / 3, label: 'top screen' },
    { id: 'bottom', x: 25, y: 52, width: 50, height: 35, aspectRatio: 4 / 3, label: 'touch screen' },
  ],
  animation: { entrance: 'fade', durationMs: 320, easing: 'ease-out' },
}

export const DUAL_SCREEN_3DS: SystemStageConfig = {
  systemId: 'n3ds',
  fullName: 'Nintendo 3DS',
  gameplayRegions: [
    { id: 'top', x: 22, y: 8, width: 56, height: 38, aspectRatio: 5 / 3, label: 'top 3D' },
    { id: 'bottom', x: 28, y: 52, width: 44, height: 32, aspectRatio: 4 / 3, label: 'bottom touch' },
  ],
  mediaTransform: { scale: 1, perspective: 1200 },
}

export function configForSystem(systemId: string, fullName?: string): SystemStageConfig {
  if (systemId === 'nds') return { ...DUAL_SCREEN_NDS, fullName: fullName || DUAL_SCREEN_NDS.fullName }
  if (systemId === 'n3ds') return { ...DUAL_SCREEN_3DS, fullName: fullName || DUAL_SCREEN_3DS.fullName }
  // genesis vs megadrive distinct — same layout but distinct ids preserved
  if (systemId === 'genesis' || systemId === 'megadrive') {
    return {
      systemId,
      fullName: fullName || (systemId === 'genesis' ? 'Genesis' : 'Mega Drive'),
      gameplayRegions: singleRegion(),
    }
  }
  return {
    systemId,
    fullName: fullName || systemId,
    gameplayRegions: singleRegion(),
  }
}
