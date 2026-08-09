import type { SystemPresentationConfig } from '../../presentation/types'

import gb from './gb'
import gbc from './gbc'
import gba from './gba'
import nds from './nds'
import n3ds from './n3ds'
import snes from './snes'
import n64 from './n64'
import gc from './gc'
import wii from './wii'
import wiiu from './wiiu'
import genesis from './genesis'
import megadrive from './megadrive'
import dreamcast from './dreamcast'
import psx from './psx'
import ps2 from './ps2'
import psp from './psp'
import xbox from './xbox'
import xbox360 from './xbox360'
import steam from './steam'

export type CalibratedMap = Record<string, SystemPresentationConfig>

export const calibratedConfigs: CalibratedMap = {
  gb,
  gbc,
  gba,
  nds,
  n3ds,
  snes,
  n64,
  gc,
  wii,
  wiiu,
  genesis,
  megadrive,
  dreamcast,
  psx,
  ps2,
  psp,
  xbox,
  xbox360,
  steam,
}

export const prioritizedMustFeelGreat = ['gba','n3ds','ps2','xbox360','steam','gbc'] as const
export const nextPriority = ['gb','nds','psx','dreamcast','gc','xbox'] as const
export const remaining = ['snes','n64','genesis','megadrive','wii','wiiu','psp'] as const

export function getCalibrated(systemId: string): SystemPresentationConfig | undefined {
  return calibratedConfigs[systemId]
}

export function listCalibratedSystemIds(): string[] {
  return Object.keys(calibratedConfigs)
}

export function isCalibrated(systemId: string): boolean {
  return systemId in calibratedConfigs
}

export function allCalibrated(): SystemPresentationConfig[] {
  return Object.values(calibratedConfigs)
}

export default calibratedConfigs
