import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'gba',
  fullName: 'Game Boy Advance',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'gba/gba.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/gba/gba.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      // auto-detected 28.5% 33.7% 42.9% 30.1% slightly refined for GBA 3:2
      x: 28.5,
      y: 33.7,
      width: 42.9,
      height: 30.1,
      aspectRatio: 3/2,
      label: 'GBA LCD',
      fit: 'contain',
      cornerRadius: '2.5%',
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 50, y: 84, scale: 0.38, rotation: 0 },
      insertTarget: { x: 50, y: 50, scale: 0.32 },
      durationMs: 480,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 50, y: 84, scale: 0.38 },
      insertTarget: { x: 50, y: 50, scale: 0.32 },
      durationMs: 480,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
    slotTarget: { x: 50, y: 28, scale: 0.34 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  } as any,
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 8, bottom: 18 },
}
export default config
