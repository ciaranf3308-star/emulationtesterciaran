import type { SystemPresentationConfig } from '../../presentation/types'

const config: SystemPresentationConfig = {
  systemId: 'wiiu',
  fullName: 'Wii U',
  presentationType: 'hybrid',
  hardwareForeground: {
    providerId: 'crystal-hardware',
    path: 'wiiu/wiiu.png',
    baseRoot: '/assets/hardware/',
    url: '/assets/hardware/wiiu/wiiu.png',
  } as any,
  gameplayRegions: [
    {
      id: 'main',
      x: 19.6,
      y: 4.5,
      width: 73.4,
      height: 39.4,
      aspectRatio: 16/9,
      label: 'Wii U TV',
      fit: 'contain',
      cornerRadius: 12,
      zIndex: 2,
    } as any,
    {
      id: 'gamepad',
      x: 62.2,
      y: 65.9,
      width: 24.7,
      height: 17.5,
      aspectRatio: 16/9,
      label: 'GamePad',
      fit: 'contain',
      cornerRadius: 8,
      zIndex: 3,
    } as any,
  ],
  screenCount: 2,
  hasPhysicalMedia: true,
  physicalMedia: {
    type: 'disc',
    transform: {
      rest: { x: 28, y: 78, scale: 0.30, rotation: -4 },
      insertTarget: { x: 52, y: 50, scale: 0.26 },
      durationMs: 560,
    },
  } as any,
  physicalMediaPlacement: {
    type: 'disc',
    transform: {
      rest: { x: 28, y: 78, scale: 0.30, rotation: -4 },
      insertTarget: { x: 52, y: 50, scale: 0.26 },
      durationMs: 560,
    },
    slotTarget: { x: 48, y: 58, scale: 0.24 },
    insertionAxis: 'z',
    insertionPath: 'slot',
    zIndex: 3,
  },
  foregroundZIndex: 5,
  mediaZIndex: 2,
  uiSafe: { top: 5, bottom: 12 },
}
export default config
