import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'psx',
  fullName: 'PlayStation',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'psx/psx.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/psx/psx.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 29.9,
      y: 10.3,
      width: 41.0,
      height: 42.8,
      aspectRatio: 4/3,
      label: 'PSX TV',
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
      rest: { x: 72, y: 80, scale: 0.32, rotation: 4 },
      insertTarget: { x: 52, y: 54, scale: 0.28 },
      durationMs: 560,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 72, y: 80, scale: 0.32, rotation: 4 },
      insertTarget: { x: 52, y: 54, scale: 0.28 },
      durationMs: 560,
    },
    slotTarget: { x: 55, y: 62, scale: 0.23 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 14 },
}
export default config
