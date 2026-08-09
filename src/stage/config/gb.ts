import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'gb',
  fullName: 'Game Boy',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'gb/gb.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/gb/gb.png',
  } as any,
  hardwareForegroundAlternates: [],
  gameplayRegions: [
    {
      id: 'main',
      x: 25.2,
      y: 15.4,
      width: 49.5,
      height: 31.4,
      aspectRatio: 10/9,
      label: 'GB LCD',
      fit: 'contain',
      cornerRadius: '3%',
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 74, y: 82, scale: 0.34, rotation: -8, depth: 3 },
      insertTarget: { x: 50, y: 52, scale: 0.28, rotation: 0, depth: 2 },
      durationMs: 520,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 74, y: 82, scale: 0.34, rotation: -8 },
      insertTarget: { x: 50, y: 52, scale: 0.28, rotation: 0 },
      durationMs: 520,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
    slotTarget: { x: 50, y: 14, scale: 0.32 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  } as any,
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 18 },
}
export default config
