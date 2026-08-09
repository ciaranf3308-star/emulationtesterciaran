import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'nds',
  fullName: 'Nintendo DS',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'nds/nds.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/nds/nds.png',
  } as any,
  gameplayRegions: [
    {
      id: 'top',
      x: 26.1,
      y: 17.4,
      width: 47.5,
      height: 23.0,
      aspectRatio: 4/3,
      label: 'top screen',
      fit: 'contain',
      cornerRadius: 6,
      zIndex: 2,
    } as any,
    {
      id: 'bottom',
      x: 27.8,
      y: 53.7,
      width: 43.9,
      height: 23.6,
      aspectRatio: 4/3,
      label: 'touch screen',
      fit: 'contain',
      cornerRadius: 6,
      zIndex: 2,
    } as any,
  ],
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 72, y: 88, scale: 0.32, rotation: -6 },
      insertTarget: { x: 50, y: 42, scale: 0.28 },
      durationMs: 540,
      easing: 'ease-out',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 72, y: 88, scale: 0.32, rotation: -6 },
      insertTarget: { x: 50, y: 42, scale: 0.28 },
      durationMs: 540,
      easing: 'ease-out',
    },
    slotTarget: { x: 50, y: 16, scale: 0.3 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 4, bottom: 10 },
}
export default config
