/**
 * Asset resolver — composable multi-provider merging with provider-specific roots
 *
 * Primary source: /assets/Crystal-Frontend-Asset-Pack/manifest.json  base /assets/Crystal-Frontend-Asset-Pack
 * Secondary sources (future): hardware fg / screen mask / slot mask packs – e.g. /assets/hardware/
 *
 * Key rules:
 * - Preserve Crystal URLs exactly: `/assets/Crystal-Frontend-Asset-Pack/<rel>`
 * - No recompress/rename.
 * - genesis and megadrive are distinct systemIds — do NOT alias.
 * - Missing artwork returns undefined, never throws.
 * - Theme fallback: light -> dark, dark -> light, then _default.
 * - steam light fallback to dark logo is supported explicitly via same rule.
 * - V4 provider roots: each provider owns baseRoot; per-field override wins but url uses provider's root.
 */

import type { Theme, ThemeAsset, ThemeAssetSet, ResolvedThemeAssets, ResolvedAsset } from './types'
import { resolveAssetUrl as resolveUrlWithRoot } from './types'

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

export function resolveAssetUrl(baseRoot: string, rel: string): string | undefined {
  if (!rel) return undefined
  if (rel.startsWith('/') || rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:')) {
    return rel
  }
  return resolveUrlWithRoot(baseRoot, rel)
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

/** Internal provider entry with root tracking */
interface ProviderEntry {
  id: string
  baseRoot: string
  set: ThemeAssetSet
}

/** Core resolution with provider-aware roots */
function resolveThemeAssetsWithProviders(
  providers: ProviderEntry[],
  systemId: string,
  theme: Theme
): ResolvedThemeAssets {
  // Build per-system field map tracking latest provider that defined each field
  const fieldMap = new Map<string, { rel: string; providerId: string; baseRoot: string }>()

  // Also track _default field maps similarly
  const defaultFieldMap = new Map<string, { rel: string; providerId: string; baseRoot: string }>()

  // Providers iterated in order – later overrides earlier per field
  for (const prov of providers) {
    const set = prov.set
    if (!set) continue
    const sys = set[systemId]
    if (sys) {
      for (const [field, rel] of Object.entries(sys)) {
        if (rel !== undefined) {
          fieldMap.set(field, { rel: rel as string, providerId: prov.id, baseRoot: prov.baseRoot })
        }
      }
    }
    const def = set._default
    if (def) {
      for (const [field, rel] of Object.entries(def)) {
        if (rel !== undefined) {
          defaultFieldMap.set(field, { rel: rel as string, providerId: prov.id, baseRoot: prov.baseRoot })
        }
      }
    }
  }

  const bgThemeKey = theme === 'light' ? 'backgroundLight' : 'backgroundDark'
  const bgAltKey = theme === 'light' ? 'backgroundDark' : 'backgroundLight'
  const logoThemeKey = theme === 'light' ? 'logoLight' : 'logoDark'
  const logoAltKey = theme === 'light' ? 'logoDark' : 'logoLight'

  const origins: Record<string, ResolvedAsset> = {}

  function resolveField(primaryKey: string, altKey: string, friendly: string): string | undefined {
    // chain: system primary -> system alt -> default primary -> default alt
    const candidates = [
      fieldMap.get(primaryKey),
      fieldMap.get(altKey),
      defaultFieldMap.get(primaryKey),
      defaultFieldMap.get(altKey),
    ]
    for (const c of candidates) {
      if (c?.rel) {
        const url = resolveUrlWithRoot(c.baseRoot, c.rel)
        origins[friendly] = { url, providerId: c.providerId, relativePath: c.rel, baseRoot: c.baseRoot }
        origins[primaryKey] = origins[friendly]
        origins[altKey] = origins[friendly]
        return url
      }
    }
    return undefined
  }

  // Resolve carouselIcon – no theme, system first then default
  function resolveDirect(field: string, friendly?: string): string | undefined {
    const fromSystem = fieldMap.get(field)
    const fromDef = defaultFieldMap.get(field)
    const chosen = fromSystem ?? fromDef
    const outKey = friendly || field
    if (chosen?.rel) {
      const url = resolveUrlWithRoot(chosen.baseRoot, chosen.rel)
      origins[outKey] = { url, providerId: chosen.providerId, relativePath: chosen.rel, baseRoot: chosen.baseRoot }
      origins[field] = origins[outKey]
      return url
    }
    return undefined
  }

  const background = resolveField(bgThemeKey, bgAltKey, 'background')
  const logo = resolveField(logoThemeKey, logoAltKey, 'logo')

  const carouselIcon = resolveDirect('carouselIcon')
  const hardwareForeground = resolveDirect('hardwareForeground')
  const screenMask = resolveDirect('screenMask')
  const slotMask = resolveDirect('slotMask')

  // Build merged raw (theme-agnostic) – for compat, include fields from fieldMap + defaultFieldMap merged
  const mergedRaw: ThemeAsset = {}
  for (const [k, v] of defaultFieldMap.entries()) {
    mergedRaw[k] = v.rel
  }
  for (const [k, v] of fieldMap.entries()) {
    mergedRaw[k] = v.rel
  }

  return {
    systemId,
    theme,
    raw: mergedRaw,
    background,
    logo,
    carouselIcon,
    hardwareForeground,
    screenMask,
    slotMask,
    origins,
  }
}

/** Legacy single-manifest resolver delegating to provider-aware logic with crystal root */
export function getThemeAssetsForSystem(
  manifest: ThemeAssetSet,
  systemId: string,
  theme: Theme
): ResolvedThemeAssets {
  // legacy path: single provider = crystal
  const prov: ProviderEntry = { id: 'crystal', baseRoot: CRYSTAL_BASE, set: manifest }
  return resolveThemeAssetsWithProviders([prov], systemId, theme)
}

/** Imperative resolver class for App/use-cases needing composition */
export class ComposableAssetResolver {
  private providers: ProviderEntry[] = []

  constructor(initial: ThemeAssetSet = {} as ThemeAssetSet) {
    if (initial && Object.keys(initial).length > 0) {
      this.providers.push({ id: 'crystal', baseRoot: CRYSTAL_BASE, set: initial })
    }
  }

  setManifest(m: ThemeAssetSet) {
    // replace crystal provider, keep others after
    const idx = this.providers.findIndex(p => p.id === 'crystal')
    if (idx >= 0) {
      this.providers[idx] = { id: 'crystal', baseRoot: CRYSTAL_BASE, set: m }
    } else {
      this.providers.unshift({ id: 'crystal', baseRoot: CRYSTAL_BASE, set: m })
    }
  }

  mergeProvider(set: ThemeAssetSet, providerId?: string, baseRoot?: string) {
    const pid = providerId || `provider-${this.providers.length}`
    const root = baseRoot || CRYSTAL_BASE
    // if same providerId exists, merge per-field inside provider's set, latest wins but keep root
    const existingIdx = this.providers.findIndex(p => p.id === pid)
    if (existingIdx >= 0) {
      const existing = this.providers[existingIdx].set
      const merged = mergeAssetSets(existing as ThemeAssetSet, set)
      this.providers[existingIdx] = { id: pid, baseRoot: root, set: merged }
    } else {
      this.providers.push({ id: pid, baseRoot: root, set })
    }
  }

  getAssetUrl = (rel?: string) => getAssetUrl(rel)

  resolveAssetUrl = (baseRoot: string, rel: string) => resolveAssetUrl(baseRoot, rel)

  getThemeAssetsForSystem(systemId: string, theme: Theme) {
    if (this.providers.length === 0) {
      return resolveThemeAssetsWithProviders([{ id:'crystal', baseRoot:CRYSTAL_BASE, set:{} as any }], systemId, theme)
    }
    return resolveThemeAssetsWithProviders(this.providers, systemId, theme)
  }

  getBackground(systemId: string, theme: Theme): string | undefined {
    return this.getThemeAssetsForSystem(systemId, theme).background
  }

  getLogo(systemId: string, theme: Theme): string | undefined {
    return this.getThemeAssetsForSystem(systemId, theme).logo
  }

  getCarouselIcon(systemId: string): string | undefined {
    // direct field lookup to avoid theme messing – use same logic as provider-aware
    const all = this.getThemeAssetsForSystem(systemId, 'dark') // theme irrelevant for carouselIcon
    return all.carouselIcon
  }

  getHardwareForeground(systemId: string, _theme: Theme): string | undefined {
    const res = this.getThemeAssetsForSystem(systemId, _theme || 'dark')
    return res.hardwareForeground
  }

  getScreenMask(systemId: string): string | undefined {
    const res = this.getThemeAssetsForSystem(systemId, 'dark')
    return res.screenMask
  }

  getSlotMask(systemId: string): string | undefined {
    const res = this.getThemeAssetsForSystem(systemId, 'dark')
    return res.slotMask
  }

  /** Expose providers for testing */
  __getProviders() { return this.providers }
}

/** Shared singleton (optional) */
export const assetResolver = new ComposableAssetResolver()

/* Convenience standalone helpers that match AssetResolver interface without class */
export function makeResolver(manifest: ThemeAssetSet) {
  const r = new ComposableAssetResolver(manifest)
  return r
}
