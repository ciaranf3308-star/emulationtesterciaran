import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'gbc',
  fullName: 'Game Boy Color',
  presentationType: 'handheld',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'gbc/gbc.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/gbc/gbc.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 26.4,
      y: 10.7,
      width: 47.5,
      height: 28.5,
      aspectRatio: 10/9,
      label: 'GBC LCD',
      fit: 'contain',
      cornerRadius: '4%',
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'cart',
    transform: {
      rest: { x: 26, y: 86, scale: 0.36, rotation: 6 },
      insertTarget: { x: 49, y: 46, scale: 0.30, rotation: 0 },
      durationMs: 500,
      easing: 'ease-out',
    },
  } as any,
  physicalMediaPlacement: {
    type: 'cart',
    transform: {
      rest: { x: 26, y: 86, scale: 0.36, rotation: 6 },
      insertTarget: { x: 49, y: 46, scale: 0.30, rotation: 0 },
      durationMs: 500,
      easing: 'ease-out',
    },
    slotTarget: { x: 50, y: 12, scale: 0.33 },
    insertionAxis: 'y',
    insertionPath: 'vertical',
    zIndex: 3,
  } as any,
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 16 },
}
export default config
