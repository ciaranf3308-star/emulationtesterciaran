import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'dreamcast',
  fullName: 'Dreamcast',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'dreamcast/dreamcast.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/dreamcast/dreamcast.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 33.0,
      y: 7.6,
      width: 34.4,
      height: 36.9,
      aspectRatio: 4/3,
      label: 'Dreamcast TV',
      fit: 'contain',
      cornerRadius: 12,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'disc',
    transform: {
      rest: { x: 66, y: 82, scale: 0.30, rotation: 6 },
      insertTarget: { x: 54, y: 54, scale: 0.26 },
      durationMs: 560,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 66, y: 82, scale: 0.30, rotation: 6 },
      insertTarget: { x: 54, y: 54, scale: 0.26 },
      durationMs: 560,
    },
    slotTarget: { x: 56, y: 62, scale: 0.22 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 14 },
}
export default config
