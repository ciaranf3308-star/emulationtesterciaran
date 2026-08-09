/**
 * System metadata registry – compact visual facts
 * 19 systems, 2-3 concise rows max per system, boutique visual flavour
 * V8.3: premium 12-20 word editorial taglines, 2 facts max per system
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
    tagline: "Nintendo's iconic monochrome handheld, pioneering portable play with Tetris, link-cable battles and enduring battery life.",
    facts: ['Dot Matrix', '8KB RAM'],
  },
  gbc: {
    maker: 'Nintendo',
    year: 1998,
    form: 'Portable',
    tagline: "Nintendo's vibrant color evolution, with translucent shells, infrared linking and a dazzling late portable renaissance.",
    facts: ['Color breakthrough', 'Infrared'],
  },
  gba: {
    maker: 'Nintendo',
    year: 2001,
    form: 'Portable 32-bit',
    tagline: "Nintendo's sleek 32-bit landscape revolution, delivering vibrant Advance exclusives, shoulder-button depth and link-cable continuity.",
    facts: ['32-bit Portable', 'Link Cable'],
  },
  nds: {
    maker: 'Nintendo',
    year: 2004,
    form: 'Dual Screen',
    tagline: "Nintendo's dual-screen touch revelation, folding clamshell design, microphone whimsy and Wi-Fi connectivity redefining handheld interaction.",
    facts: ['Touch', 'Mic + WiFi'],
  },
  n3ds: {
    maker: 'Nintendo',
    year: 2011,
    form: 'Stereoscopic 3D',
    tagline: "Nintendo's glasses-free stereoscopic leap, layering depth-slider immersion, StreetPass serendipity and dual-analog refinement for portable worlds.",
    facts: ['Glasses-free 3D', 'StreetPass'],
  },
  snes: {
    maker: 'Nintendo',
    year: 1990,
    form: 'Home Console 16-bit',
    tagline: "Nintendo's 16-bit masterpiece, celebrated for Mode 7 scaling, Super FX ambition and timeless first-party symphonies of play.",
    facts: ['Mode 7', 'Super FX'],
  },
  n64: {
    maker: 'Nintendo',
    year: 1996,
    form: '64-bit',
    tagline: "Nintendo's bold 64-bit frontier, introducing analog precision, four-port chaos and Rumble Pak immersion that reshaped 3D adventure.",
    facts: ['Analog revolution', 'Rumble Pak'],
  },
  gc: {
    maker: 'Nintendo',
    year: 2001,
    form: 'Optical Disc',
    tagline: "Nintendo's compact purple powerhouse, pairing Mini-DVD innovation, ergonomic handle and daring first-party masterpieces.",
    facts: ['Mini-DVD', 'Handle + Purple Cube'],
  },
  wii: {
    maker: 'Nintendo',
    year: 2006,
    form: 'Motion',
    tagline: "Nintendo's motion-control phenomenon, inviting living-room waggle, Virtual Console nostalgia and inclusive design that expanded audiences worldwide.",
    facts: ['Motion control', 'Virtual Console'],
  },
  wiiu: {
    maker: 'Nintendo',
    year: 2012,
    form: 'Hybrid GamePad',
    tagline: "Nintendo's ambitious second-screen experiment, blending Off-TV freedom, asymmetric GamePad play and Miiverse charm before its time.",
    facts: ['Off-TV Play', 'Miiverse'],
  },
  genesis: {
    maker: 'Sega',
    year: 1988,
    form: '16-bit Blast',
    tagline: "Sega's blast-processing 16-bit icon, fueled by Motorola power, edgy attitude and arcade-perfect swagger for the MTV era.",
    facts: ['Motorola 68000', 'Blast Processing'],
  },
  megadrive: {
    maker: 'Sega',
    year: 1988,
    form: 'PAL Identity',
    tagline: "Sega's European-Japanese PAL identity, carrying Mega Drive prestige, Mega CD expansion dreams and distinct regional box-art charisma.",
    facts: ['Distinct EU/JP', 'Mega CD era'],
  },
  dreamcast: {
    maker: 'Sega',
    year: 1998,
    form: 'Innovative',
    tagline: "Sega's visionary swansong, pioneering GD-ROM ambition, VMU memory innovation and online foresight that still feels futuristic today.",
    facts: ['GD-ROM', 'VMU Memory'],
  },
  psx: {
    maker: 'Sony',
    year: 1994,
    form: 'CD Pioneer',
    tagline: "Sony's polygon-pioneering debut, transforming CDs into sprawling 3D worlds, memory-card devotion and a new era's soundtrack.",
    facts: ['Granular 3D', 'Memory Cards'],
  },
  ps2: {
    maker: 'Sony',
    year: 2000,
    form: 'Emotion Engine',
    tagline: "Sony's landmark sixth-generation console, known for its enormous library, DVD playback and genre-defining classics.",
    facts: ['DVD era', 'DualShock 2'],
  },
  psp: {
    maker: 'Sony',
    year: 2004,
    form: 'Handheld Power',
    tagline: "Sony's sleek UMD-powered handheld powerhouse, delivering console-grade visuals, Wi-Fi multiplayer and multimedia ambition on the go.",
    facts: ['UMD', 'WiFi handheld'],
  },
  xbox: {
    maker: 'Microsoft',
    year: 2001,
    form: 'Raw Power',
    tagline: "Microsoft's heavyweight console debut, embedding hard-drive convenience, Xbox Live's online dawn and raw green-lit power.",
    facts: ['Hard drive built-in', 'Xbox Live debut'],
  },
  xbox360: {
    maker: 'Microsoft',
    year: 2005,
    form: 'HD Online',
    tagline: "Microsoft's HD-era online revolution, introducing Achievements, Ring of Light charisma and marketplace-driven multiplayer dominance worldwide.",
    facts: ['Achievements', 'Ring of Light'],
  },
  steam: {
    maker: 'Valve',
    year: 2003,
    form: 'Open PC',
    tagline: "Valve's ever-evolving open PC universe, curating infinite libraries, SteamOS experimentation and community-shaped longevity beyond generations.",
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
