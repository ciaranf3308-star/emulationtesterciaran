/**
 * Presentation presets – migrated from src/stage/config.ts
 * Now using SystemPresentationConfig contract.
 * Keep genesis vs megadrive distinct ids.
 */

import type { SystemPresentationConfig, PhysicalMediaTransform } from './types'

function singleRegion() {
  return [{ id: 'main', x: 18, y: 18, width: 64, height: 64, aspectRatio: 4 / 3, label: 'main' }]
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

export const SINGLE_SCREEN: SystemPresentationConfig = {
  systemId: 'ps2',
  fullName: 'PlayStation 2',
  gameplayRegions: singleRegion(),
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'disc', transform: defaultPhysicalTransform() },
}

export const DUAL_SCREEN_NDS: SystemPresentationConfig = {
  systemId: 'nds',
  fullName: 'Nintendo DS',
  gameplayRegions: [
    { id: 'top', x: 25, y: 10, width: 50, height: 35, aspectRatio: 4 / 3, label: 'top screen' },
    { id: 'bottom', x: 25, y: 52, width: 50, height: 35, aspectRatio: 4 / 3, label: 'touch screen' },
  ],
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

export const DUAL_SCREEN_3DS: SystemPresentationConfig = {
  systemId: 'n3ds',
  fullName: 'Nintendo 3DS',
  gameplayRegions: [
    { id: 'top', x: 22, y: 8, width: 56, height: 38, aspectRatio: 5 / 3, label: 'top 3D' },
    { id: 'bottom', x: 28, y: 52, width: 44, height: 32, aspectRatio: 4 / 3, label: 'bottom touch' },
  ],
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: { rest:{x:50,y:72,scale:0.88}, insertTarget:{x:50,y:48,scale:0.58}, durationMs:480, easing:'cubic-bezier(0.2,0,0,1)'} as any },
}

export const GENESIS: SystemPresentationConfig = {
  systemId: 'genesis',
  fullName: 'Genesis',
  gameplayRegions: singleRegion(),
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

export const MEGADRIVE: SystemPresentationConfig = {
  systemId: 'megadrive',
  fullName: 'Mega Drive',
  gameplayRegions: singleRegion(),
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: { type: 'cart', transform: defaultPhysicalTransform() },
}

const presetMap: Record<string, SystemPresentationConfig> = {
  ps2: SINGLE_SCREEN,
  nds: DUAL_SCREEN_NDS,
  n3ds: DUAL_SCREEN_3DS,
  genesis: GENESIS,
  megadrive: MEGADRIVE,
}

export function getPreset(systemId: string): SystemPresentationConfig | undefined {
  return presetMap[systemId]
}

export function allPresets(): SystemPresentationConfig[] {
  return Object.values(presetMap)
}
