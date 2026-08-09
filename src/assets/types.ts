/**
 * Asset Provider types — composable per-field override model.
 *
 * Crystal pack currently provides: background, logo, carouselIcon.
 * Future packs may provide: hardwareForeground, screenMask, slotMask.
 *
 * URLs are kept as `/assets/Crystal-Frontend-Asset-Pack/<rel>` exactly
 * as in manifest.json — never recompress/rename.
 *
 * V4: provider-specific roots – Crystal uses /assets/Crystal-Frontend-Asset-Pack/
 * hardware uses /assets/hardware/ etc. Per-field override preserves root origin.
 */

export type Theme = 'light' | 'dark'

export interface ThemeAsset {
  /** Relative path like "backgrounds/light/ps2.png" or absolute /assets/... url */
  backgroundLight?: string
  backgroundDark?: string
  logoLight?: string
  logoDark?: string
  carouselIcon?: string
  hardwareForeground?: string
  screenMask?: string
  slotMask?: string
  // allow extension by future providers without breaking type
  [k: string]: string | undefined
}

export type ThemeAssetSet = Record<string, ThemeAsset> & {
  _default?: ThemeAsset
}

/** Provider root reference */
export interface AssetRef {
  providerId: string
  relativePath: string
  baseRoot: string
}

/** Resolved single asset with origin tracking */
export interface ResolvedAsset {
  url: string
  providerId: string
  relativePath: string
  baseRoot: string
}

/** Resolved per-theme view for a single system – urls include correct baseRoot */
export interface ResolvedThemeAssets {
  systemId: string
  theme: Theme
  /** original merged raw asset (theme-agnostic) */
  raw: ThemeAsset
  background?: string // resolved url or undefined – includes provider baseRoot
  logo?: string
  carouselIcon?: string
  hardwareForeground?: string
  screenMask?: string
  slotMask?: string
  /** Optional detailed origin – for provider-roots testing */
  origins?: Record<string, ResolvedAsset>
}

/** Legacy helper – resolve with explicit baseRoot */
export function resolveAssetUrl(baseRoot: string, rel: string): string {
  if (!rel) return '' as any
  if (rel.startsWith('/') || rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:')) {
    return rel
  }
  const root = baseRoot.replace(/\/+$/g, '')
  const cleaned = rel.replace(/^\/+/g, '')
  return `${root}/${cleaned}`
}

export interface AssetResolver {
  getAssetUrl(rel?: string): string | undefined
  getBackground(systemId: string, theme: Theme): string | undefined
  getLogo(systemId: string, theme: Theme): string | undefined
  getCarouselIcon(systemId: string): string | undefined
  getHardwareForeground(systemId: string, theme: Theme): string | undefined
  getScreenMask(systemId: string): string | undefined
  getSlotMask(systemId: string): string | undefined
  getThemeAssetsForSystem(systemId: string, theme: Theme): ResolvedThemeAssets
  /** merge another provider's set into this resolver (composable override) – supports providerId/baseRoot for V4 */
  mergeProvider(set: ThemeAssetSet, providerId?: string, baseRoot?: string): void
}

/** A generic provider source */
export interface AssetProvider {
  id: string
  baseRoot?: string
  getAssetSet(): ThemeAssetSet | Promise<ThemeAssetSet>
}
