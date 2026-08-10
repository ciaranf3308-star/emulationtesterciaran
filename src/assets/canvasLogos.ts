import type { ThemeAssetSet } from './types'

const systemIds = [
  'gb', 'gbc', 'gba', 'nds', 'n3ds', 'psp', 'snes', 'n64', 'gc',
  'wii', 'wiiu', 'genesis', 'megadrive', 'dreamcast', 'psx', 'ps2',
  'xbox', 'xbox360', 'steam',
] as const

export const canvasLogoAssets: ThemeAssetSet = Object.fromEntries(
  systemIds.map(systemId => [
    systemId,
    { logoLight: `${systemId}.svg`, logoDark: `${systemId}.svg` },
  ])
) as ThemeAssetSet

export const CANVAS_LOGO_BASE = '/assets/Canvas-System-Logos'
