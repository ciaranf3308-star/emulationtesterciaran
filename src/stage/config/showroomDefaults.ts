/**
 * Showroom placement – V7.3 category defaults + per-system overrides
 * Outer wrapper transform does NOT disturb inner calibrated frame.
 *
 * x = % viewport left->right where showroom centre sits (storefront)
 * y = % viewport top->bottom centre (approx 52-54% for optical centre)
 * scale = storefront hero scale vs library canonical 1
 * translateY = subtle vertical nudge px or %
 * library = where hardware animates to when entering console
 *
 * Category baselines:
 * - TV/home consoles: right-of-centre large hero
 * - Handhelds: tall/bold, slightly right but not as far
 * - Desktop: wide monitor composition
 * - Hybrid (wiiu): GamePad-led slightly lower
 */

import type { ShowroomPlacement } from '../types'

type Category = 'handheld' | 'tv' | 'desktop' | 'hybrid' | 'board'

const categoryDefaults: Record<Category, ShowroomPlacement> = {
  handheld: {
    x: 62,
    y: 52,
    scale: 1.16,
    maxWidth: '64vw',
    maxHeight: '78vh',
    anchor: 'center',
  },
  tv: {
    x: 66,
    y: 52,
    scale: 1.18,
    maxWidth: '72vw',
    maxHeight: '74vh',
    anchor: 'center',
  },
  desktop: {
    x: 68,
    y: 50,
    scale: 1.14,
    maxWidth: '76vw',
    maxHeight: '72vh',
    anchor: 'center',
  },
  hybrid: {
    x: 64,
    y: 56,
    scale: 1.12,
    maxWidth: '68vw',
    maxHeight: '74vh',
    anchor: 'center',
    translateY: 12,
  },
  board: {
    x: 62,
    y: 52,
    scale: 1.1,
    maxWidth: '66vw',
    maxHeight: '70vh',
    anchor: 'center',
  },
}

/**
 * Per-system overrides – only where visually necessary to tune hero composition.
 * Values tuned for 16:9 1920x1080 / 2560x1440 and ROG Ally X.
 */
export const showroomOverrides: Record<string, Partial<ShowroomPlacement>> = {
  // ── Handhelds ──
  gb: { x: 60, y: 54, scale: 1.22, maxWidth: '56vw', translateY: 0 },
  gbc: { x: 60, y: 54, scale: 1.22, maxWidth: '58vw' },
  gba: { x: 62, y: 52, scale: 1.20, maxWidth: '62vw', maxHeight: '76vh' },
  psp: { x: 63, y: 51, scale: 1.14, maxWidth: '66vw' },
  nds: { x: 60, y: 52, scale: 1.18, maxWidth: '54vw', maxHeight: '82vh' }, // dual-screen needs tall read
  n3ds: { x: 60, y: 52, scale: 1.18, maxWidth: '56vw', maxHeight: '84vh' },

  // ── TVs ──
  ps2: { x: 67, y: 52, scale: 1.22, maxWidth: '74vw', maxHeight: '76vh' }, // CRT console large right hero – regression target
  gc: { x: 66, y: 51, scale: 1.20, maxWidth: '70vw' }, // purple TV prominent right hero
  snes: { x: 64, y: 52, scale: 1.16 },
  n64: { x: 65, y: 52, scale: 1.15 },
  genesis: { x: 65, y: 52, scale: 1.15 },
  megadrive: { x: 65, y: 52, scale: 1.15 },
  dreamcast: { x: 67, y: 52, scale: 1.18 },
  psx: { x: 66, y: 52, scale: 1.17 },
  xbox: { x: 67, y: 53, scale: 1.16 },
  xbox360: { x: 67, y: 52, scale: 1.16 },

  // ── Desktop ──
  steam: { x: 69, y: 49, scale: 1.12, maxWidth: '78vw', maxHeight: '70vh' }, // monitor-led wide

  // ── Hybrid ──
  wii: { x: 66, y: 52, scale: 1.14 },
  wiiu: { x: 64, y: 58, scale: 1.10, maxWidth: '66vw', translateY: 18 }, // GamePad-led slightly lower
}

export function getCategoryDefaults(category?: Category | string): ShowroomPlacement {
  const cat = (category as Category) || 'tv'
  return categoryDefaults[cat] || categoryDefaults.tv
}

export function resolveShowroomPlacement(systemId: string, presentationType?: string, explicit?: ShowroomPlacement): ShowroomPlacement {
  const base = getCategoryDefaults((presentationType as Category) || 'tv')
  const over = showroomOverrides[systemId] || {}
  // explicit per-system config wins over overrides wins over category
  return {
    ...base,
    ...over,
    ...(explicit || {}),
    library: {
      ...(base.library || {}),
      ...(over.library || {}),
      ...(explicit?.library || {}),
      // defaults library to centred hero when not specified
      x: explicit?.library?.x ?? over.library?.x ?? base.library?.x ?? 62.5,
      y: explicit?.library?.y ?? over.library?.y ?? base.library?.y ?? 50,
      scale: explicit?.library?.scale ?? over.library?.scale ?? base.library?.scale ?? 1,
    },
  }
}

export default {
  categoryDefaults,
  showroomOverrides,
  resolveShowroomPlacement,
  getCategoryDefaults,
}
