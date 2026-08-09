import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'snes',
  fullName: 'Super Nintendo',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'snes/snes.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/snes/snes.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 30.1,
      y: 8.1,
      width: 48.2,
      height: 36.2,
      aspectRatio: 4/3,
      label: 'SNES TV',
      fit: 'contain',
      cornerRadius: 12,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 36, y: 78, scale: 0.32, rotation: -4 },
      insertTarget: { x: 47, y: 56, scale: 0.28 },
      durationMs: 500,
      easing: 'ease-out',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 36, y: 78, scale: 0.32, rotation: -4 },
      insertTarget: { x: 47, y: 56, scale: 0.28 },
      durationMs: 500,
      easing: 'ease-out',
    },
    slotTarget: { x: 32, y: 62, scale: 0.26 },
    insertionAxis: 'y',
    insertionPath: 'arc',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 4, bottom: 12 },
}
export default config
