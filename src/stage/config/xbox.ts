import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'xbox',
  fullName: 'Xbox',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'xbox/xbox.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/xbox/xbox.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 32.6,
      y: 9.7,
      width: 36.7,
      height: 35.4,
      aspectRatio: 4/3,
      label: 'Xbox TV',
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
      rest: { x: 68, y: 84, scale: 0.32, rotation: 6 },
      insertTarget: { x: 52, y: 56, scale: 0.28 },
      durationMs: 560,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 68, y: 84, scale: 0.32, rotation: 6 },
      insertTarget: { x: 52, y: 56, scale: 0.28 },
      durationMs: 560,
    },
    slotTarget: { x: 54, y: 60, scale: 0.24 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 16 },
}
export default config
