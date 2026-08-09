import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'wii',
  fullName: 'Wii',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'wii/wii.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/wii/wii.png',
    alternateUrl: '/assets/hardware/wii/wii-01.png',
    alternates: ['/assets/hardware/wii/wii.png','/assets/hardware/wii/wii-01.png'],
  } as any,
  hardwareForegroundAlternate: '/assets/hardware/wii/wii-01.png',
  hardwareForegroundAlternates: ['/assets/hardware/wii/wii.png','/assets/hardware/wii/wii-01.png'],
  gameplayRegions: [
    {
      id: 'main',
      x: 9.6,
      y: 8.8,
      width: 62.5,
      height: 51.3,
      aspectRatio: 16/9,
      label: 'Wii TV',
      fit: 'cover',
      cornerRadius: 10,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'disc',
    transform: {
      rest: { x: 74, y: 82, scale: 0.28, rotation: 4 },
      insertTarget: { x: 52, y: 56, scale: 0.24 },
      durationMs: 560,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 74, y: 82, scale: 0.28, rotation: 4 },
      insertTarget: { x: 52, y: 56, scale: 0.24 },
      durationMs: 560,
    },
    slotTarget: { x: 55, y: 62, scale: 0.22 },
    insertionAxis: 'x',
    insertionPath: 'horizontal',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 16 },
}
export default config
