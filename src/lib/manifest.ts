export type Theme = 'light' | 'dark'

export interface SystemAsset {
  backgroundLight?: string
  backgroundDark?: string
  logoLight?: string
  logoDark?: string
  carouselIcon?: string
}

export type Manifest = Record<string, SystemAsset>

let cachedManifest: Manifest | null = null

export async function loadManifest(): Promise<Manifest> {
  if (cachedManifest) return cachedManifest
  try {
    const res = await fetch('/assets/manifest.json')
    if (!res.ok) throw new Error(`manifest fetch ${res.status}`)
    cachedManifest = await res.json()
    return cachedManifest!
  } catch (e) {
    // fallback to inline copy if fetch fails (e.g. file:// tauri)
    try {
      const mod = await import('../assets-fallback/manifest.json')
      cachedManifest = (mod as any).default || mod
      return cachedManifest!
    } catch {
      console.error('manifest load failed', e)
      return {}
    }
  }
}

export function getPrimarySystems(manifest: Manifest): string[] {
  // Systems that have both backgrounds and logos are considered primary for carousel
  // Based on asset pack inventory: gc, wii, wiiu, ps2, psx, psp, snes, nes, n64, genesis, gb, gba, gbc, nds, n3ds, xbox, xbox360, windows, dreamcast, pokemon, auto-allgames + _default fallback
  const primaryCandidates = [
    'auto-allgames',
    'dreamcast',
    'gb',
    'gba',
    'gbc',
    'gc',
    'genesis',
    'n3ds',
    'n64',
    'nds',
    'nes',
    'pokemon',
    'ps2',
    'psp',
    'psx',
    'snes',
    'wii',
    'wiiu',
    'windows',
    'xbox',
    'xbox360',
    'steam', // dark only, fallback needed for light
  ]
  return primaryCandidates.filter(id => manifest[id])
}

export function resolveAssetPath(
  base: string // e.g. "public/assets/Crystal-Frontend-Asset-Pack/" prefix handled by Vite public
): string {
  // manifest entries already are relative like "backgrounds/light/ps2.png"
  // Our public/assets layout will be: /assets/Crystal-Frontend-Asset-Pack/<entry>
  // plus manifest itself at /assets/manifest.json holds same relative paths
  // So we want to prefix with /assets/Crystal-Frontend-Asset-Pack/
  if (base.startsWith('/')) return base
  return `/assets/Crystal-Frontend-Asset-Pack/${base}`
}

export function getBackground(
  manifest: Manifest,
  systemId: string,
  theme: Theme
): string | undefined {
  const entry = manifest[systemId]
  if (!entry) return manifest['_default']?.[theme === 'light' ? 'backgroundLight' : 'backgroundDark']
  if (theme === 'light') return entry.backgroundLight || entry.backgroundDark
  return entry.backgroundDark || entry.backgroundLight
}

export function getLogo(
  manifest: Manifest,
  systemId: string,
  theme: Theme
): string | undefined {
  const entry = manifest[systemId]
  if (!entry) return undefined
  // steam missing light -> fallback to dark
  if (theme === 'light') return entry.logoLight || entry.logoDark
  return entry.logoDark || entry.logoLight
}

export function getCarouselIcon(
  manifest: Manifest,
  systemId: string
): string | undefined {
  return manifest[systemId]?.carouselIcon
}