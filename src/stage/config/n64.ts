import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'n64',
  fullName: 'Nintendo 64',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'n64/n64.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/n64/n64.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 29.3,
      y: 8.8,
      width: 39.8,
      height: 39.6,
      aspectRatio: 4/3,
      label: 'N64 TV',
      fit: 'contain',
      cornerRadius: 10,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 70, y: 82, scale: 0.34, rotation: 6 },
      insertTarget: { x: 50, y: 54, scale: 0.30 },
      durationMs: 520,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 70, y: 82, scale: 0.34, rotation: 6 },
      insertTarget: { x: 50, y: 54, scale: 0.30 },
      durationMs: 520,
    },
    slotTarget: { x: 49, y: 58, scale: 0.28 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 5, bottom: 14 },
}
export default config
