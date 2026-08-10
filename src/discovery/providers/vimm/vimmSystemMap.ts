/**
 * vimmSystemMap – Crystal ID -> Vimm vault token (LIVE VERIFIED 2026-08-10)
 *
 * Source: docs/VIMM-VAULT-SCHEMA.md live audit 2026-08-10 – authoritative.
 * Vault root lists 34 classic systems; Crystal maps 19 IDs except steam unsupported.
 * Genesis & Megadrive remain distinct Crystal keys even if they resolve to same Vimm token (Genesis).
 *
 * Crystal psx -> Vimm PS1 (not PSX) per live verified token.
 * Crystal n3ds -> Vimm 3DS.
 */

export type CrystalSystemId =
  | 'n3ds' | 'dreamcast' | 'gb' | 'gba' | 'gbc'
  | 'gc' | 'genesis' | 'megadrive' | 'n64' | 'nds'
  | 'ps2' | 'psp' | 'psx' | 'snes' | 'steam'
  | 'wii' | 'wiiu' | 'xbox' | 'xbox360'
  | string;

type VimmTokenMap = Record<string, string | null>;

/**
 * Canonical mapping – null = explicitly unsupported / steam only.
 * Values are exact Vimm tokens observed live.
 */
const CRYSTAL_TO_VIMM: VimmTokenMap = {
  // Nintendo handhelds / consoles
  'n3ds': '3DS',
  'gb': 'GB',
  'gba': 'GBA',
  'gbc': 'GBC',
  'gc': 'GameCube',
  'n64': 'N64',
  'nds': 'DS',
  'snes': 'SNES',
  'wii': 'Wii',
  'wiiu': 'WiiU',

  // Sega
  'genesis': 'Genesis',
  'megadrive': 'Genesis', // distinct Crystal entry, same Vimm token – kept separate deliberately
  'dreamcast': 'Dreamcast',

  // Sony – psx -> PS1 is the live token (PSX is alt tool alias but vault uses PS1)
  'ps2': 'PS2',
  'psp': 'PSP',
  'psx': 'PS1',

  // Microsoft
  'xbox': 'Xbox',
  'xbox360': 'Xbox360',

  // Explicit unsupported – no PC/Steam vault
  'steam': null,
};

// Reverse / alias tokens we accept for robust incoming data.
// Keys are exact Vimm tokens as seen in URLs / docs, including alt forms.
const ALT_TOKENS: Record<string, string> = {
  // GC variants -> gc
  'GC': 'gc',
  'NGC': 'gc',
  'GameCube': 'gc',
  // DS/NDS
  'NDS': 'nds',
  'DS': 'nds',
  // 3DS – crystal n3ds
  '3DS': 'n3ds',
  'n3ds': 'n3ds',
  // Dreamcast
  'DC': 'dreamcast',
  'Dreamcast': 'dreamcast',
  // Genesis / MD
  'GEN': 'genesis',
  'Genesis': 'genesis',
  'MD': 'megadrive',
  'MegaDrive': 'megadrive',
  // PS1 / PSX both resolve to Crystal psx; vault token canonical is PS1
  'PS1': 'psx',
  'PSX': 'psx',
  'PS': 'psx', // some older references
  // Sony others canonical
  'PS2': 'ps2',
  'PSP': 'psp',
  // Nintendo others
  'N64': 'n64',
  'SNES': 'snes',
  'GB': 'gb',
  'GBC': 'gbc',
  'GBA': 'gba',
  'Wii': 'wii',
  'WiiU': 'wiiu',
  'Xbox': 'xbox',
  'Xbox360': 'xbox360',
};

export function crystalToVimmToken(systemId: string): string | null {
  if (!systemId) return null;
  const sid = systemId.toLowerCase().trim();
  if (sid in CRYSTAL_TO_VIMM) {
    // explicit lookup includes null for unsupported (steam)
    return CRYSTAL_TO_VIMM[sid] ?? null;
  }
  // Also allow passing Vimm token directly? No – only Crystal IDs map.
  return null;
}

export function isSupportedCrystalSystem(systemId: string): boolean {
  const token = crystalToVimmToken(systemId);
  return token !== null && token !== undefined;
}

export function listSupportedCrystalSystems(): string[] {
  return Object.keys(CRYSTAL_TO_VIMM).filter(k => CRYSTAL_TO_VIMM[k] !== null);
}

export function listUnsupportedExplicit(): string[] {
  return Object.keys(CRYSTAL_TO_VIMM).filter(k => CRYSTAL_TO_VIMM[k] === null);
}

export function vimmTokenToCrystal(vimmToken: string): string | null {
  if (!vimmToken) return null;
  if (ALT_TOKENS[vimmToken]) return ALT_TOKENS[vimmToken];
  const lower = vimmToken.toLowerCase();
  // brute force reverse via CRYSTAL_TO_VIMM (first key whose value case-insensitively matches)
  for (const [crystal, token] of Object.entries(CRYSTAL_TO_VIMM)) {
    if (!token) continue;
    if (token.toLowerCase() === lower) return crystal;
  }
  for (const [alt, crystal] of Object.entries(ALT_TOKENS)) {
    if (alt.toLowerCase() === lower) return crystal;
  }
  return null;
}

export function getFullMapping(): Record<string, string | null> {
  return { ...CRYSTAL_TO_VIMM };
}
