/**
 * System metadata registry – compact visual facts
 * 19 systems, 2-3 concise rows max per system, boutique visual flavour
 * not Wikipedia dump. Used for storefront/library chrome.
 */

export interface SystemMeta {
  maker?: string
  year?: string | number
  form?: string
  tagline?: string
  facts: string[]
}

export const systemMetaRegistry: Record<string, SystemMeta> = {
  gb: {
    maker: 'Nintendo',
    year: 1989,
    form: 'Portable',
    tagline: 'Dot Matrix World',
    facts: ['Dot Matrix', '8KB RAM'],
  },
  gbc: {
    maker: 'Nintendo',
    year: 1998,
    form: 'Portable',
    tagline: 'Atomic Purple / Crystal',
    facts: ['Color breakthrough', 'Infrared'],
  },
  gba: {
    maker: 'Nintendo',
    year: 2001,
    form: 'Portable 32-bit',
    tagline: 'Landscape era',
    facts: ['Landscape era', 'Link Cable'],
  },
  nds: {
    maker: 'Nintendo',
    year: 2004,
    form: 'Dual Screen',
    tagline: 'Touch & Fold',
    facts: ['Touch', 'Mic + WiFi'],
  },
  n3ds: {
    maker: 'Nintendo',
    year: 2011,
    form: 'Stereoscopic 3D',
    tagline: 'Depth without glasses',
    facts: ['Dual Screen 3D', 'StreetPass'],
  },
  snes: {
    maker: 'Nintendo',
    year: 1990,
    form: 'Home Console 16-bit',
    tagline: 'Mode 7 Magic',
    facts: ['Mode 7', 'Super FX'],
  },
  n64: {
    maker: 'Nintendo',
    year: 1996,
    form: '64-bit',
    tagline: 'Analog frontier',
    facts: ['Analog revolution', 'Rumble Pak'],
  },
  gc: {
    maker: 'Nintendo',
    year: 2001,
    form: 'Optical Disc',
    tagline: 'Cube sharp',
    facts: ['Purple cube', 'Handle + Mini-DVD'],
  },
  wii: {
    maker: 'Nintendo',
    year: 2006,
    form: 'Motion',
    tagline: 'Waggle era',
    facts: ['Wii Remote', 'Virtual Console'],
  },
  wiiu: {
    maker: 'Nintendo',
    year: 2012,
    form: 'Hybrid GamePad',
    tagline: 'Second screen',
    facts: ['Off-TV Play', 'Miiverse'],
  },
  genesis: {
    maker: 'Sega',
    year: 1988,
    form: '16-bit Blast',
    tagline: 'Blast Processing',
    facts: ['Motorola 68000', 'Blast Processing'],
  },
  megadrive: {
    maker: 'Sega',
    year: 1988,
    form: 'PAL Identity',
    tagline: 'EU / JP icon',
    facts: ['Distinct EU/JP', 'Mega CD era'],
  },
  dreamcast: {
    maker: 'Sega',
    year: 1998,
    form: 'Innovative',
    tagline: "Think beyond",
    facts: ['GD-ROM', 'VMU Memory'],
  },
  psx: {
    maker: 'Sony',
    year: 1994,
    form: 'CD Pioneer',
    tagline: 'Polygon pioneer',
    facts: ['Granular 3D', 'Memory Cards'],
  },
  ps2: {
    maker: 'Sony',
    year: 2000,
    form: 'Emotion Engine',
    tagline: 'DVD generation',
    facts: ['DVD era', 'DualShock 2'],
  },
  psp: {
    maker: 'Sony',
    year: 2004,
    form: 'Handheld Power',
    tagline: 'Portable PlayStation',
    facts: ['UMD', 'WiFi handheld'],
  },
  xbox: {
    maker: 'Microsoft',
    year: 2001,
    form: 'Raw Power',
    tagline: 'Heavyweight debut',
    facts: ['Hard drive built-in', 'Xbox Live debut'],
  },
  xbox360: {
    maker: 'Microsoft',
    year: 2005,
    form: 'HD Online',
    tagline: 'Achievements unlocked',
    facts: ['Achievements', 'Ring of Light'],
  },
  steam: {
    maker: 'Valve',
    year: 2003,
    form: 'Open PC',
    tagline: 'Library forever',
    facts: ['Library evolution', 'SteamOS'],
  },
}

/**
 * Get metadata for a system id, fallback to generic when unknown.
 * Generic keeps UI intact – caller collapses or shows neutral copy.
 */
export function getSystemMeta(id: string): SystemMeta {
  const key = id?.toLowerCase?.() ?? id
  const found = systemMetaRegistry[key] ?? systemMetaRegistry[id]
  if (found) return found

  // Fallback generic – still shaped correctly
  return {
    maker: 'Unknown',
    year: '',
    form: 'System',
    tagline: id,
    facts: ['Unknown System', id],
  }
}
