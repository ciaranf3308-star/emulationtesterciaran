import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'steam',
  fullName: 'Steam',
  presentationType: 'desktop',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'steam/steam-01.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/steam/steam-01.png',
    alternateUrl: '/assets/hardware/steam/steam.png',
    alternates: ['/assets/hardware/steam/steam-01.png','/assets/hardware/steam/steam.png'],
  } as any,
  // Steam uses transparent monitor / PC-style version, not the opaque one with baked-in UI.
  hardwareForegroundAlternate: '/assets/hardware/steam/steam.png',
  hardwareForegroundAlternates: ['/assets/hardware/steam/steam-01.png','/assets/hardware/steam/steam-transparent.png'],
  gameplayRegions: [
    {
      id: 'main',
      x: 4.5,
      y: 8.2,
      width: 54.7,
      height: 45.4,
      aspectRatio: 16/9,
      label: 'Steam Monitor',
      fit: 'contain',
      cornerRadius: 8,
      zIndex: 2,
    } as any,
  ],
  screenCount: 1,
  hasPhysicalMedia: false,
  physicalMedia: {
    type: 'none',
    transform: {
      rest: { x: 50, y: 50, scale: 0 },
      insertTarget: { x: 50, y: 50, scale: 0 },
    },
  } as any,
  physicalMediaPlacement: {
    type: 'none',
    transform: {
      rest: { x: 50, y: 50, scale: 0 },
      insertTarget: { x: 50, y: 50, scale: 0 },
    },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 0,
  },
  foregroundZIndex: 4,
  mediaZIndex: 2,
  uiSafe: { top: 6, bottom: 16 },
}
export default config
