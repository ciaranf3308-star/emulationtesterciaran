import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'megadrive',
  fullName: 'Mega Drive',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'megadrive/megadrive.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/megadrive/megadrive.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 36.5,
      y: 9.7,
      width: 33.2,
      height: 32.8,
      aspectRatio: 4/3,
      label: 'MD TV',
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
      rest: { x: 30.5, y: 81.7, scale: 0.30, rotation: 2 },
      insertTarget: { x: 42, y: 52, scale: 0.26 },
      durationMs: 500,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 30.5, y: 81.7, scale: 0.30, rotation: 2 },
      insertTarget: { x: 42, y: 52, scale: 0.26 },
      durationMs: 500,
    },
    slotTarget: { x: 38, y: 62, scale: 0.25 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 14 },
}
export default config
