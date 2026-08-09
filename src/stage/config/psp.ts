import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'psp',
  fullName: 'PSP',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'psp/psp.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/psp/psp.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 21.7,
      y: 45.0,
      width: 49.3,
      height: 31.4,
      aspectRatio: 16/9,
      label: 'PSP LCD',
      fit: 'contain',
      cornerRadius: '4%',
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: false,
  physicalMedia: {
    type: 'umd',
    transform: {
      rest: { x: 50, y: 82, scale: 0.30, rotation: 0 },
      insertTarget: { x: 50, y: 52, scale: 0.26 },
      durationMs: 520,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'umd',
    transform: {
      rest: { x: 50, y: 82, scale: 0.30 },
      insertTarget: { x: 50, y: 52, scale: 0.26 },
      durationMs: 520,
    },
    slotTarget: { x: 50, y: 48, scale: 0.26 },
    insertionAxis: 'x',
    insertionPath: 'horizontal',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 8, bottom: 16 },
}
export default config
