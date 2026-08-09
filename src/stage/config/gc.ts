import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'gc',
  fullName: 'GameCube',
  presentationType: 'tv',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'gc/gc.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/gc/gc.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 38.5,
      y: 10.5,
      width: 35.5,
      height: 34.9,
      aspectRatio: 4/3,
      label: 'GC TV',
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
      rest: { x: 48, y: 78, scale: 0.30, rotation: 0 },
      insertTarget: { x: 52, y: 52, scale: 0.26 },
      durationMs: 560,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 48, y: 78, scale: 0.30 },
      insertTarget: { x: 52, y: 52, scale: 0.26 },
      durationMs: 560,
    },
    slotTarget: { x: 56, y: 64, scale: 0.22 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 16 },
}
export default config
