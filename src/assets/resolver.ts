/**
 * Asset resolver — composable multi-provider merging
 *
 * Primary source: /assets/Crystal-Frontend-Asset-Pack/manifest.json
 * Secondary sources (future): hardware fg / screen mask / slot mask packs
 *
 * Key rules:
 * - Preserve Crystal URLs exactly: `/assets/Crystal-Frontend-Asset-Pack/<rel>`
 * - No recompress/rename.
 * - genesis and megadrive are distinct systemIds — do NOT alias.
 * - Missing artwork returns undefined, never throws.
 * - Theme fallback: light -> dark, dark -> light, then _default.
 * - steam light fallback to dark logo is supported explicitly via same rule.
 */

import type { Theme, ThemeAsset, ThemeAssetSet, ResolvedThemeAssets } from './types'

const CRYSTAL_BASE = '/assets/Crystal-Frontend-Asset-Pack'
const CRYSTAL_MANIFEST_URL = `${CRYSTAL_BASE}/manifest.json`
const FALLBACK_MANIFEST_URL = '/assets/manifest.json'

export function getAssetUrl(rel?: string): string | undefined {
  if (!rel) return undefined
  if (rel.startsWith('/') || rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:')) {
    return rel
  }
  return `${CRYSTAL_BASE}/${rel}`
}

/** Merge N ThemeAssetSets composably per-field (later sets override earlier per field). */
export function mergeAssetSets(...sets: ThemeAssetSet[]): ThemeAssetSet {
  const out: ThemeAssetSet = {} as ThemeAssetSet
  for (const set of sets) {
    if (!set) continue
    for (const [key, asset] of Object.entries(set)) {
      if (!asset) continue
      const existing = out[key] as ThemeAsset | undefined
      if (!existing) {
        out[key] = { ...asset } as ThemeAsset
      } else {
        // per-field override, only if incoming has defined value
        const merged: ThemeAsset = { ...existing }
        for (const [field, val] of Object.entries(asset)) {
          if (val !== undefined) {
            merged[field] = val
          }
        }
        out[key] = merged
      }
    }
  }
  return out
}

/** Load Crystal manifest, fallback to /assets/manifest.json if needed */
export async function loadManifest(): Promise<ThemeAssetSet> {
  try {
    const r = await fetch(CRYSTAL_MANIFEST_URL)
    if (!r.ok) throw new Error(`crystal manifest ${r.status}`)
    const j = (await r.json()) as ThemeAssetSet
    return j
  } catch {
    try {
      const r2 = await fetch(FALLBACK_MANIFEST_URL)
      if (!r2.ok) throw new Error(`fallback manifest ${r2.status}`)
      return (await r2.json()) as ThemeAssetSet
    } catch {
      // also try src/assets-fallback bundled copy (for Tauri file://)
      try {
        const mod = await import('../assets-fallback/manifest.json')
        return ((mod as any).default || mod) as ThemeAssetSet
      } catch {
        return {} as ThemeAssetSet
      }
    }
  }
}

/**
 * Return merged ThemeAsset for systemId, considering _default is NOT auto-merged here
 * (caller decides fallback). This keeps genesis vs megadrive distinct.
 */
export function getRawAsset(manifest: ThemeAssetSet, systemId: string): ThemeAsset | undefined {
  if (!manifest) return undefined
  // Do NOT alias genesis <-> megadrive — they are distinct
  return manifest[systemId]
}

/**
 * Resolve themed background/logo with fallback chain:
 *  primary: manifest[systemId][themeKey]
 *  secondary: manifest[systemId][oppositeThemeKey]
 *  tertiary: manifest[_default][themeKey]
 *  quaternary: manifest[_default][oppositeThemeKey]
 *  else undefined (graceful, never throws)
 */
export function getThemeAssetsForSystem(
  manifest: ThemeAssetSet,
  systemId: string,
  theme: Theme
): ResolvedThemeAssets {
  const rawSystem = getRawAsset(manifest, systemId) || {}
  const def = manifest?._default || {}

  // merge default as base, system overrides (but keep raw separate for debugging)
  const mergedRaw = mergeAssetSets({ _tmp: def } as ThemeAssetSet, { _tmp: rawSystem } as ThemeAssetSet)._tmp as ThemeAsset

  const bgThemeKey = theme === 'light' ? 'backgroundLight' : 'backgroundDark'
  const bgAltKey = theme === 'light' ? 'backgroundDark' : 'backgroundLight'
  const logoThemeKey = theme === 'light' ? 'logoLight' : 'logoDark'
  const logoAltKey = theme === 'light' ? 'logoDark' : 'logoLight'

  function resolveField(primaryKey: string, altKey: string): string | undefined {
    // explicit order: system primary -> system alt -> default primary -> default alt
    const chain = [
      rawSystem[primaryKey],
      rawSystem[altKey],
      def[primaryKey],
      def[altKey],
    ]
    for (const rel of chain) {
      if (rel) {
        const url = getAssetUrl(rel)
        if (url) return url
      }
    }
    return undefined
  }

  const background = resolveField(bgThemeKey, bgAltKey)
  const logo = resolveField(logoThemeKey, logoAltKey)

  // carouselIcon has no theme — direct + default fallback
  const carouselRel = rawSystem.carouselIcon || def.carouselIcon
  const carouselIcon = carouselRel ? getAssetUrl(carouselRel) : undefined

  // future providers
  const hwRel = rawSystem.hardwareForeground || def.hardwareForeground
  const maskRel = rawSystem.screenMask || def.screenMask
  const slotRel = rawSystem.slotMask || def.slotMask

  return {
    systemId,
    theme,
    raw: mergedRaw || {},
    background,
    logo,
    carouselIcon,
    hardwareForeground: hwRel ? getAssetUrl(hwRel) : undefined,
    screenMask: maskRel ? getAssetUrl(maskRel) : undefined,
    slotMask: slotRel ? getAssetUrl(slotRel) : undefined,
  }
}

/** Imperative resolver class for App/use-cases needing composition */
export class ComposableAssetResolver {
  private manifest: ThemeAssetSet

  constructor(initial: ThemeAssetSet = {} as ThemeAssetSet) {
    this.manifest = initial
  }

  setManifest(m: ThemeAssetSet) {
    this.manifest = m
  }

  mergeProvider(set: ThemeAssetSet) {
    this.manifest = mergeAssetSets(this.manifest, set)
  }

  getAssetUrl = getAssetUrl

  getThemeAssetsForSystem(systemId: string, theme: Theme) {
    return getThemeAssetsForSystem(this.manifest, systemId, theme)
  }

  getBackground(systemId: string, theme: Theme): string | undefined {
    return this.getThemeAssetsForSystem(systemId, theme).background
  }

  getLogo(systemId: string, theme: Theme): string | undefined {
    return this.getThemeAssetsForSystem(systemId, theme).logo
  }

  getCarouselIcon(systemId: string): string | undefined {
    const raw = getRawAsset(this.manifest, systemId) || this.manifest._default
    if (!raw?.carouselIcon) return undefined
    return getAssetUrl(raw.carouselIcon)
  }

  getHardwareForeground(systemId: string, _theme: Theme): string | undefined {
    const raw = getRawAsset(this.manifest, systemId)
    const def = this.manifest._default
    const rel = raw?.hardwareForeground || def?.hardwareForeground
    return rel ? getAssetUrl(rel) : undefined
  }

  getScreenMask(systemId: string): string | undefined {
    const raw = getRawAsset(this.manifest, systemId)
    const def = this.manifest._default
    const rel = raw?.screenMask || def?.screenMask
    return rel ? getAssetUrl(rel) : undefined
  }

  getSlotMask(systemId: string): string | undefined {
    const raw = getRawAsset(this.manifest, systemId)
    const def = this.manifest._default
    const rel = raw?.slotMask || def?.slotMask
    return rel ? getAssetUrl(rel) : undefined
  }
}

/** Shared singleton (optional) */
export const assetResolver = new ComposableAssetResolver()

/* Convenience standalone helpers that match AssetResolver interface without class */
export function makeResolver(manifest: ThemeAssetSet) {
  const r = new ComposableAssetResolver(manifest)
  return r
}
