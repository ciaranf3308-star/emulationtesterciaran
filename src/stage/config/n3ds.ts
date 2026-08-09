import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'n3ds',
  fullName: 'Nintendo 3DS',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'n3ds/n3ds.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/n3ds/n3ds.png',
  } as any,
  gameplayRegions: [
    {
      id: 'top',
      x: 31.6,
      y: 9.1,
      width: 36.7,
      height: 33.7,
      aspectRatio: 5/3,
      label: 'top 3D',
      fit: 'contain',
      cornerRadius: 8,
      zIndex: 2,
    } as any,
    {
      id: 'bottom',
      x: 33.2,
      y: 55.7,
      width: 33.6,
      height: 29.9,
      aspectRatio: 4/3,
      label: 'bottom touch',
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
      rest: { x: 20, y: 84, scale: 0.34, rotation: 8 },
      insertTarget: { x: 50, y: 48, scale: 0.30 },
      durationMs: 480,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 20, y: 84, scale: 0.34, rotation: 8 },
      insertTarget: { x: 50, y: 48, scale: 0.30 },
      durationMs: 480,
      easing: 'cubic-bezier(0.2,0,0,1)',
    },
    slotTarget: { x: 50, y: 8, scale: 0.32 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 3, bottom: 12 },
}
export default config
