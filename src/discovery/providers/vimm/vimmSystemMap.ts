/**
 * vimmSystemMap – Crystal ID -> Vimm vault token
 *
 * Tokens observed on live vimm.net (best-effort conservative):
 *  PS2, PSX (or PS1), PSP, N64, SNES, GB, GBC, GBA, DS/NDS, 3DS,
 *  NGC/GameCube/GC, Dreamcast/DC, GEN/Genesis, Xbox, Xbox360, Wii, WiiU, etc.
 *
 * Since full audit not yet done, we map conservatively and mark steam unsupported explicitly.
 * Keep genesis & megadrive distinct keys even if they map to same Vimm token – needed for Crystal UI.
 */

export type CrystalSystemId =
  | 'n3ds' | 'dreamcast' | 'gb' | 'gba' | 'gbc'
  | 'gc' | 'genesis' | 'megadrive' | 'n64' | 'nds'
  | 'ps2' | 'psp' | 'psx' | 'snes' | 'steam'
  | 'wii' | 'wiiu' | 'xbox' | 'xbox360'
  | string;

type VimmTokenMap = Record<string, string | null>;

/**
 * Conservative mapping – null means explicitly unsupported / unsure.
 * Comments indicate alternatives observed.
 */
const CRYSTAL_TO_VIMM: VimmTokenMap = {
  // Nintendo
  'n3ds': null, // Vimm may use "3DS" or "n3ds" – unsure without audit, mark unsupported for now (explicit re-enable later)
  'gb': 'GB',
  'gba': 'GBA',
  'gbc': 'GBC',
  'gc': 'GameCube', // observed tokens: GameCube, GC, NGC – using GameCube as canonical
  'n64': 'N64',
  'nds': 'DS', // Vimm uses "DS" for NDS – alternative NDS
  'snes': 'SNES',
  'wii': 'Wii',
  'wiiu': 'WiiU',

  // Sega
  'genesis': 'Genesis', // Vimm token "Genesis" – GEN variant also seen
  'megadrive': 'Genesis', // distinct Crystal entry, same Vimm token logically but kept separate
  'dreamcast': 'Dreamcast', // alt DC

  // Sony
  'ps2': 'PS2',
  'psp': 'PSP',
  'psx': 'PSX', // alt PS1

  // Microsoft
  'xbox': 'Xbox',
  'xbox360': 'Xbox360',

  // Unsupported explicitly
  'steam': null,
};

// Alt tokens we also accept for reverse lookup robustness
const ALT_TOKENS: Record<string, string> = {
  // GC variants -> gc
  'GC': 'gc',
  'NGC': 'gc',
  'GameCube': 'gc',
  // DS/NDS
  'NDS': 'nds',
  'DS': 'nds',
  // 3DS
  '3DS': 'n3ds',
  'n3ds': 'n3ds',
  // Dreamcast
  'DC': 'dreamcast',
  'Dreamcast': 'dreamcast',
  // Genesis
  'GEN': 'genesis',
  'Genesis': 'genesis',
  'MD': 'megadrive',
  'MegaDrive': 'megadrive',
  // PSX variants
  'PS1': 'psx',
  'PSX': 'psx',
  // PS2, PSP, etc canonical uppercase
  'PS2': 'ps2',
  'PSP': 'psp',
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
  const sid = systemId.toLowerCase();
  if (sid in CRYSTAL_TO_VIMM) {
    return CRYSTAL_TO_VIMM[sid] ?? null;
  }
  // also try alt reverse? No – only map known
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
  // direct alt map first (case-sensitive then case-insensitive)
  if (ALT_TOKENS[vimmToken]) return ALT_TOKENS[vimmToken];
  const lower = vimmToken.toLowerCase();
  // brute force reverse via CRYSTAL_TO_VIMM (find first key whose value case-insensitively matches token)
  for (const [crystal, token] of Object.entries(CRYSTAL_TO_VIMM)) {
    if (!token) continue;
    if (token.toLowerCase() === lower) return crystal;
  }
  // handle lowered alts
  for (const [alt, crystal] of Object.entries(ALT_TOKENS)) {
    if (alt.toLowerCase() === lower) return crystal;
  }
  return null;
}

export function getFullMapping(): Record<string, string | null> {
  return { ...CRYSTAL_TO_VIMM };
}
