/**
 * V3.1 – System accent token map for aura idle pulse.
 * Graphite / silver / cyan base, but per-system tint for premium recognition.
 * Colors are cool electric, not warm orange – boutique gaming OS adherence.
 *
 * ps2 blue #2e8cff, gc purple #a66cff, snes #8a5cff, n64 red #ff4d5a etc.
 */

export type SystemAccent = {
  color: string
  glow: string        // softer for outer 60px
  tintBg: string      // subtle wash rgba
  lightX: number      // default light bias %
  lightY: number
}

export const SYSTEM_ACCENT_MAP: Record<string, SystemAccent> = {
  // Sony – electric blue family
  ps2:   { color: '#2e8cff', glow: '#5aa6ff', tintBg: 'rgba(46,140,255,0.10)', lightX: 6, lightY: -4 },
  psx:   { color: '#3b82f6', glow: '#6ea8ff', tintBg: 'rgba(59,130,246,0.10)', lightX: 5, lightY: -3 },
  ps3:   { color: '#2e8cff', glow: '#5aa6ff', tintBg: 'rgba(46,140,255,0.09)', lightX: 7, lightY: -5 },
  ps4:   { color: '#3b9eff', glow: '#7ab8ff', tintBg: 'rgba(59,158,255,0.09)', lightX: 6, lightY: -4 },
  psp:   { color: '#4ea1ff', glow: '#82c2ff', tintBg: 'rgba(78,161,255,0.10)', lightX: 4, lightY: -3 },

  // Nintendo GC – purple electric
  gc:    { color: '#a66cff', glow: '#c49aff', tintBg: 'rgba(166,108,255,0.11)', lightX: -4, lightY: -6 },
  gamecube: { color: '#a66cff', glow: '#c49aff', tintBg: 'rgba(166,108,255,0.11)', lightX: -4, lightY: -6 },
  wii:   { color: '#8cc8ff', glow: '#aedcff', tintBg: 'rgba(140,200,255,0.10)', lightX: -2, lightY: -5 },
  wiiu:  { color: '#7ab8ff', glow: '#a6d0ff', tintBg: 'rgba(122,184,255,0.10)', lightX: -3, lightY: -4 },

  // SNES / SFAM – boutique violet
  snes:  { color: '#8a5cff', glow: '#ad88ff', tintBg: 'rgba(138,92,255,0.12)', lightX: -5, lightY: -3 },
  sfam:  { color: '#8a5cff', glow: '#ad88ff', tintBg: 'rgba(138,92,255,0.12)', lightX: -5, lightY: -3 },

  // N64 – premium red (cool, not hot orange)
  n64:   { color: '#ff4d5a', glow: '#ff7a86', tintBg: 'rgba(255,77,90,0.10)', lightX: 5, lightY: 4 },
  n64dd: { color: '#ff4d5a', glow: '#ff7a86', tintBg: 'rgba(255,77,90,0.10)', lightX: 5, lightY: 4 },

  // Game Boy family – aqua / mint premium
  gb:    { color: '#5cdca9', glow: '#8af0c6', tintBg: 'rgba(92,220,169,0.10)', lightX: -6, lightY: 3 },
  gbc:   { color: '#5cdca9', glow: '#8af0c6', tintBg: 'rgba(92,220,169,0.11)', lightX: -6, lightY: 3 },
  gba:   { color: '#6be6b8', glow: '#96f2cc', tintBg: 'rgba(107,230,184,0.11)', lightX: -4, lightY: 2 },

  // DS / NDS – dual cyan
  ds:    { color: '#5ce1ff', glow: '#8befff', tintBg: 'rgba(92,225,255,0.10)', lightX: -2, lightY: 5 },
  nds:   { color: '#47b1ff', glow: '#7cc6ff', tintBg: 'rgba(71,177,255,0.10)', lightX: -2, lightY: 6 },

  // Megadrive / Genesis – graphite electric indigo
  megadrive: { color: '#6b8cff', glow: '#95aeff', tintBg: 'rgba(107,140,255,0.10)', lightX: 4, lightY: 3 },
  genesis:   { color: '#6b8cff', glow: '#95aeff', tintBg: 'rgba(107,140,255,0.10)', lightX: 4, lightY: 3 },
  saturn:  { color: '#9ba0ff', glow: '#bcbfff', tintBg: 'rgba(155,160,255,0.10)', lightX: 3, lightY: 2 },

  // Dreamcast – cyan swirl
  dreamcast: { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.10)', lightX: 2, lightY: -2 },
  dc:        { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.10)', lightX: 2, lightY: -2 },

  // Xbox family – precision green stricly desaturated premium (not neon lime)
  xbox:  { color: '#7ad67a', glow: '#a6eaa6', tintBg: 'rgba(122,214,122,0.09)', lightX: 6, lightY: 5 },
  xbox360:{ color: '#8be28b', glow: '#b2f0b2', tintBg: 'rgba(139,226,139,0.09)', lightX: 5, lightY: 6 },
  xboxone:{ color: '#8be28b', glow: '#b2f0b2', tintBg: 'rgba(139,226,139,0.09)', lightX: 5, lightY: 6 },

  // Arcade / general
  arcade: { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.10)', lightX: 0, lightY: 0 },
  mame:   { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.10)', lightX: 0, lightY: 0 },
  neogeo:{ color: '#ff5c8a', glow: '#ff8fb0', tintBg: 'rgba(255,92,138,0.10)', lightX: 4, lightY: -2 },

  // PC / Steam – cool steel
  steam: { color: '#8ea8c4', glow: '#b4c9dd', tintBg: 'rgba(142,168,196,0.09)', lightX: 0, lightY: 3 },
  pc:    { color: '#8ea8c4', glow: '#b4c9dd', tintBg: 'rgba(142,168,196,0.09)', lightX: 0, lightY: 3 },
}

export function getSystemAccent(systemId: string): SystemAccent {
  if (!systemId) return { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.10)', lightX: 0, lightY: 0 }
  const key = systemId.toLowerCase().trim()
  return SYSTEM_ACCENT_MAP[key] || SYSTEM_ACCENT_MAP[key.replace(/[^a-z0-9]/g,'')] || { color: '#7df9ff', glow: '#a8ffff', tintBg: 'rgba(125,249,255,0.12)', lightX: 0, lightY: 0 }
}

export default SYSTEM_ACCENT_MAP
