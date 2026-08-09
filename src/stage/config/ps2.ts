import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'ps2',
  fullName: 'PlayStation 2',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'ps2/ps2.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/ps2/ps2.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 17.9,
      y: 10.8,
      width: 64.0,
      height: 45.5,
      aspectRatio: 4/3,
      label: 'PS2 TV',
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
      rest: { x: 70, y: 84, scale: 0.34, rotation: 5 },
      insertTarget: { x: 52, y: 56, scale: 0.30 },
      durationMs: 580,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 70, y: 84, scale: 0.34, rotation: 5 },
      insertTarget: { x: 52, y: 56, scale: 0.30 },
      durationMs: 580,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
    slotTarget: { x: 52, y: 58, scale: 0.26 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 14 },
}
export default config
