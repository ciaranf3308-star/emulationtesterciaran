import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'xbox360',
  fullName: 'Xbox 360',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'xbox360/xbox360.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/xbox360/xbox360.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 29.3,
      y: 6.2,
      width: 53.3,
      height: 43.9,
      aspectRatio: 16/9,
      label: '360 TV',
      fit: 'contain',
      cornerRadius: 10,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'disc',
    transform: {
      rest: { x: 34, y: 82, scale: 0.34, rotation: -6 },
      insertTarget: { x: 52, y: 56, scale: 0.30 },
      durationMs: 580,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 34, y: 82, scale: 0.34, rotation: -6 },
      insertTarget: { x: 52, y: 56, scale: 0.30 },
      durationMs: 580,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
    slotTarget: { x: 50, y: 58, scale: 0.27 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 5, bottom: 14 },
}
export default config
