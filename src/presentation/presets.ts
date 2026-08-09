/**
 * Presentation presets – V7 hardware-calibrated
 * Now wired to src/stage/config per-system calibration with real hardware foregrounds.
 * Keeps genesis vs megadrive distinct, preserves V5 API (getPreset, allPresets).
 */

import type { SystemPresentationConfig, PhysicalMediaTransform } from './types'
import { calibratedConfigs, getCalibrated } from '../stage/config/index'

function singleRegion() {
  return [{ id: 'main', x: 18, y: 18, width: 64, height: 64, aspectRatio: 4 / 3, label: 'main', fit: 'contain' as const }]
}

function defaultPhysicalTransform(): PhysicalMediaTransform {
  return {
    rest: { x: 50, y: 70, scale: 0.9 },
    insertTarget: { x: 50, y: 45, scale: 0.6, rotation: 0 },
    durationMs: 420,
    easing: 'ease-out',
    depth: 3,
  }
}

export const SINGLE_SCREEN: SystemPresentationConfig = getCalibrated('ps2') || {
  systemId: 'ps2',
  fullName: 'PlayStation 2',
  presentationType: 'tv',
  hardwareForeground: { providerId: 'crystal-hardware', path: 'ps2/ps2.png', baseRoot: '/assets/hardware/', url: '/assets/hardware/ps2/ps2.png' } as any,
  gameplayRegions: singleRegion() as any,
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'disc', transform: defaultPhysicalTransform() },
}

export const DUAL_SCREEN_NDS: SystemPresentationConfig = getCalibrated('nds') || {
  systemId: 'nds',
  fullName: 'Nintendo DS',
  presentationType: 'handheld',
  hardwareForeground: { providerId: 'crystal-hardware', path: 'nds/nds.png', baseRoot: '/assets/hardware/', url: '/assets/hardware/nds/nds.png' } as any,
  gameplayRegions: [
    { id: 'top', x: 26.1, y: 17.4, width: 47.5, height: 23, aspectRatio: 4/3, label: 'top screen', fit: 'contain' as const },
    { id: 'bottom', x: 27.8, y: 53.7, width: 43.9, height: 23.6, aspectRatio: 4/3, label: 'touch screen', fit: 'contain' as const },
  ] as any,
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

export const DUAL_SCREEN_3DS: SystemPresentationConfig = getCalibrated('n3ds') || {
  systemId: 'n3ds',
  fullName: 'Nintendo 3DS',
  presentationType: 'handheld',
  hardwareForeground: { providerId: 'crystal-hardware', path: 'n3ds/n3ds.png', baseRoot: '/assets/hardware/', url: '/assets/hardware/n3ds/n3ds.png' } as any,
  gameplayRegions: [
    { id: 'top', x: 31.6, y: 9.1, width: 36.7, height: 33.7, aspectRatio: 5/3, label: 'top 3D', fit: 'contain' as const },
    { id: 'bottom', x: 33.2, y: 55.7, width: 33.6, height: 29.9, aspectRatio: 4/3, label: 'bottom touch', fit: 'contain' as const },
  ] as any,
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: { rest:{x:50,y:72,scale:0.88}, insertTarget:{x:50,y:48,scale:0.58}, durationMs:480, easing:'cubic-bezier(0.2,0,0,1)'} as any },
}

export const GENESIS: SystemPresentationConfig = getCalibrated('genesis') || {
  systemId: 'genesis',
  fullName: 'Genesis',
  presentationType: 'tv',
  hardwareForeground: { providerId: 'crystal-hardware', path: 'genesis/genesis.png', baseRoot: '/assets/hardware/', url: '/assets/hardware/genesis/genesis.png' } as any,
  gameplayRegions: singleRegion() as any,
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

export const MEGADRIVE: SystemPresentationConfig = getCalibrated('megadrive') || {
  systemId: 'megadrive',
  fullName: 'Mega Drive',
  presentationType: 'tv',
  hardwareForeground: { providerId: 'crystal-hardware', path: 'megadrive/megadrive.png', baseRoot: '/assets/hardware/', url: '/assets/hardware/megadrive/megadrive.png' } as any,
  gameplayRegions: singleRegion() as any,
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

// Full V7 preset map – now delegates to calibratedConfigs for all 19
const presetMap: Record<string, SystemPresentationConfig> = {
  ...calibratedConfigs,
  // ensure backward aliases still present
  ps2: calibratedConfigs['ps2'] || SINGLE_SCREEN,
  nds: calibratedConfigs['nds'] || DUAL_SCREEN_NDS,
  n3ds: calibratedConfigs['n3ds'] || DUAL_SCREEN_3DS,
  genesis: calibratedConfigs['genesis'] || GENESIS,
  megadrive: calibratedConfigs['megadrive'] || MEGADRIVE,
}

export function getPreset(systemId: string): SystemPresentationConfig | undefined {
  if (presetMap[systemId]) return presetMap[systemId]
  // dynamic fallback via calibrated
  return getCalibrated(systemId)
}

export function allPresets(): SystemPresentationConfig[] {
  return Object.values(presetMap)
}

export { calibratedConfigs as calibrated }
