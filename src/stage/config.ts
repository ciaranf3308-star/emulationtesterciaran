/**
 * Preset SystemStage configs – V7 wired to per-system calibrated presentation contract.
 * Keeps genesis vs megadrive distinct, now with hardware foregrounds.
 */

import type { SystemStageConfig } from './types'
import { getPresentationForSystem } from '../presentation/resolver'
import type { SystemPresentationConfig } from '../presentation/types'

function presentationToStageConfig(pres: SystemPresentationConfig, fullNameOverride?: string): SystemStageConfig {
  const hw = pres.hardwareForeground as any
  let hwUrl: string | undefined
  if (typeof hw === 'string') hwUrl = hw
  else if (hw) {
    hwUrl = hw.url || hw.assetRef?.url || (typeof hw === 'object' ? (hw as any).path ? `/assets/hardware/${(hw as any).path}` : undefined : undefined)
    // If path provided as relative inside hardware pack, ensure leading slash
    if (hwUrl && !hwUrl.startsWith('/') && !hwUrl.startsWith('http')) {
      // hardware pack lives under /assets/hardware/
      if (hw.path) hwUrl = `/assets/hardware/${hw.path}`
      else hwUrl = hwUrl
    }
    // If object contains .path but url missing, construct
    if (!hwUrl && hw.path) {
      hwUrl = `/assets/hardware/${hw.path}`
    }
  }

  const altHw = (pres as any).hardwareForegroundAlternate as string | undefined
  const altHws = (pres as any).hardwareForegroundAlternates as string[] | undefined
  const altFromObj = (hw as any)?.alternateUrl as string | undefined
  const alternatesFromObj = (hw as any)?.alternates as string[] | undefined

  const resolvedAlternate = altHw || altFromObj
  const resolvedAlternates = altHws || alternatesFromObj || (resolvedAlternate ? [resolvedAlternate] : undefined)

  const screenMasks = (pres as any).screenMasks
  const slotMasks = (pres as any).slotMasks
  const singleScreenMask = (pres as any).screenMask as string | undefined
  const singleSlotMask = (pres as any).slotMask as string | undefined

  // V7 extras
  const placement = (pres as any).physicalMediaPlacement
  const insertionAnimation = (pres as any).insertionAnimation
  const presentationType = (pres as any).presentationType
  const foregroundZIndex = (pres as any).foregroundZIndex
  const mediaZIndex = (pres as any).mediaZIndex
  const uiSafe = (pres as any).uiSafe

  // Physical media legacy mapping
  let physicalMediaConfig: SystemStageConfig['physicalMediaConfig'] | undefined
  let physicalMediaLegacy: SystemStageConfig['physicalMedia'] | undefined

  if (placement) {
    physicalMediaConfig = {
      type: (placement.type === 'umd' ? 'board' : placement.type) as any, // map umd -> board? keep generic but stage uses board for umd – we'll keep 'board' alias fallback, better keep original but type widened
      transform: placement.transform,
    } as any
    // preserve original type for downstream
    ;(physicalMediaConfig as any)._originalType = placement.type
  } else if (pres.physicalMedia) {
    physicalMediaConfig = {
      type: pres.physicalMedia.type as any,
      transform: pres.physicalMedia.transform as any,
    }
    physicalMediaLegacy = pres.physicalMedia as any
  }

  // gameplayRegions now includes fit/cornerRadius etc – preserve full
  const regions = pres.gameplayRegions.map((r: any) => ({ ...r }))

  return {
    systemId: pres.systemId,
    fullName: fullNameOverride || pres.fullName || pres.systemId,
    gameplayRegions: regions as any,
    physicalMediaConfig,
    physicalMedia: physicalMediaLegacy as any,
    hardwareForeground: hwUrl,
    hardwareForegroundAlternate: resolvedAlternate,
    hardwareForegroundAlternates: resolvedAlternates,
    screenMask: singleScreenMask,
    slotMask: singleSlotMask,
    screenMasks,
    slotMasks,
    presentationType,
    foregroundZIndex,
    mediaZIndex,
    uiSafe,
    physicalMediaPlacement: placement as any,
    insertionAnimation: insertionAnimation as any,
  } as SystemStageConfig
}

function singleRegion(): SystemStageConfig['gameplayRegions'] {
  return [
    { id: 'main', x: 18, y: 18, width: 64, height: 64, aspectRatio: 4 / 3, label: 'main', fit: 'contain' as const },
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
    { id: 'top', x: 25, y: 10, width: 50, height: 35, aspectRatio: 4 / 3, label: 'top screen', fit: 'contain' as const },
    { id: 'bottom', x: 25, y: 52, width: 50, height: 35, aspectRatio: 4 / 3, label: 'touch screen', fit: 'contain' as const },
  ],
  animation: { entrance: 'fade', durationMs: 320, easing: 'ease-out' },
}

export const DUAL_SCREEN_3DS: SystemStageConfig = {
  systemId: 'n3ds',
  fullName: 'Nintendo 3DS',
  gameplayRegions: [
    { id: 'top', x: 22, y: 8, width: 56, height: 38, aspectRatio: 5 / 3, label: 'top 3D', fit: 'contain' as const },
    { id: 'bottom', x: 28, y: 52, width: 44, height: 32, aspectRatio: 4 / 3, label: 'bottom touch', fit: 'contain' as const },
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

export function getAllStageConfigs(): SystemStageConfig[] {
  // new helper for V7 – enumerate calibrated via dynamic import-safe path
  try {
    // avoid require in ESM – import directly
    // calibratedConfigs is available via preset resolver; reuse getPresentation cascade
    // Fallback: use known 19 ids
    const ids = ['gb','gbc','gba','nds','n3ds','snes','n64','gc','wii','wiiu','genesis','megadrive','dreamcast','psx','ps2','psp','xbox','xbox360','steam']
    const out: SystemStageConfig[] = []
    for (const id of ids) {
      const pres = getPresentationForSystem(id)
      if (pres) out.push(presentationToStageConfig(pres))
    }
    return out
  } catch {
    return []
  }
}
