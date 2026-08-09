/**
 * Preset SystemStage configs – now delegates to presentation contract.
 * Keeps genesis vs megadrive distinct.
 */

import type { SystemStageConfig } from './types'
import { getPresentationForSystem } from '../presentation/resolver'
import type { SystemPresentationConfig } from '../presentation/types'

function presentationToStageConfig(pres: SystemPresentationConfig, fullNameOverride?: string): SystemStageConfig {
  const hw = pres.hardwareForeground
  const hwUrl = typeof hw === 'string' ? hw : hw?.url || (hw as any)?.assetRef?.url || undefined

  const screenMasks = pres.screenMasks
  const slotMasks = pres.slotMasks
  const singleScreenMask = (pres as any).screenMask as string | undefined
  const singleSlotMask = (pres as any).slotMask as string | undefined

  return {
    systemId: pres.systemId,
    fullName: fullNameOverride || pres.fullName || pres.systemId,
    gameplayRegions: pres.gameplayRegions.map(r => ({ ...r })),
    physicalMediaConfig: pres.physicalMedia ? {
      type: pres.physicalMedia.type,
      transform: pres.physicalMedia.transform as any,
    } : undefined,
    hardwareForeground: hwUrl,
    screenMask: singleScreenMask,
    slotMask: singleSlotMask,
    screenMasks,
    slotMasks,
  }
}

function singleRegion(): SystemStageConfig['gameplayRegions'] {
  return [
    { id: 'main', x: 18, y: 18, width: 64, height: 64, aspectRatio: 4 / 3, label: 'main' },
  ]
}

// Keep legacy constants for consumers that import directly from stage/config
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
  const pres = getPresentationForSystem(systemId)
  if (pres) {
    return presentationToStageConfig(pres, fullName)
  }
  // fallback – should not reach due to resolver generic fallback but preserve distinct genesis/megadrive
  if (systemId === 'genesis' || systemId === 'megadrive') {
    return {
      systemId,
      fullName: fullName || (systemId === 'genesis' ? 'Genesis' : 'Mega Drive'),
      gameplayRegions: singleRegion(),
    }
  }
  if (systemId === 'nds') return { ...DUAL_SCREEN_NDS, fullName: fullName || DUAL_SCREEN_NDS.fullName }
  if (systemId === 'n3ds') return { ...DUAL_SCREEN_3DS, fullName: fullName || DUAL_SCREEN_3DS.fullName }
  return {
    systemId,
    fullName: fullName || systemId,
    gameplayRegions: singleRegion(),
  }
}
