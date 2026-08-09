/**
 * Asset Provider types — composable per-field override model.
 *
 * Crystal pack currently provides: background, logo, carouselIcon.
 * Future packs may provide: hardwareForeground, screenMask, slotMask.
 *
 * URLs are kept as `/assets/Crystal-Frontend-Asset-Pack/<rel>` exactly
 * as in manifest.json — never recompress/rename.
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

/** Resolved per-theme view for a single system */
export interface ResolvedThemeAssets {
  systemId: string
  theme: Theme
  /** original merged raw asset (theme-agnostic) */
  raw: ThemeAsset
  background?: string // resolved url or undefined
  logo?: string
  carouselIcon?: string
  hardwareForeground?: string
  screenMask?: string
  slotMask?: string
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
  /** merge another provider's set into this resolver (composable override) */
  mergeProvider(set: ThemeAssetSet): void
}

/** A generic provider source */
export interface AssetProvider {
  id: string
  getAssetSet(): ThemeAssetSet | Promise<ThemeAssetSet>
}
