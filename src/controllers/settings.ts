/**
 * Settings controller – ThemeMode, focus handling, writable root verification
 */

export type ThemeMode = 'dark' | 'light'

type SettingsState = {
  theme: ThemeMode
  writableRootOk: boolean | null
  safeMode: boolean
}

export function toggleTheme(prev: ThemeMode): ThemeMode {
  return prev === 'dark' ? 'light' : 'dark'
}

export function resolveThemeFromSystem(prefersLight: boolean): ThemeMode {
  return prefersLight ? 'light' : 'dark'
}

export function shouldFollowFocusToSettings(focusedRoute: string, previousRoute: string): boolean {
  return focusedRoute === 'settings' && previousRoute !== 'settings'
}

// Auto extractor / acquisition settings are managed in acquisition_watch module, not here
// This controller only owns UI-state shape; persistence is via Tauri commands.
export const DEFAULT_SETTINGS: SettingsState = {
  theme: 'dark',
  writableRootOk: null,
  safeMode: false,
}
