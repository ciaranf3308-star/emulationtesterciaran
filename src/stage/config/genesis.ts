import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'genesis',
  fullName: 'Genesis',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'genesis/genesis.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/genesis/genesis.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 36.7,
      y: 9.1,
      width: 34.4,
      height: 34.9,
      aspectRatio: 4/3,
      label: 'Genesis TV',
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
      rest: { x: 20.5, y: 61.2, scale: 0.28, rotation: -2 },
      insertTarget: { x: 40, y: 50, scale: 0.24 },
      durationMs: 500,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 20.5, y: 61.2, scale: 0.28, rotation: -2 },
      insertTarget: { x: 40, y: 50, scale: 0.24 },
      durationMs: 500,
    },
    slotTarget: { x: 36, y: 60, scale: 0.24 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 14 },
}
export default config
