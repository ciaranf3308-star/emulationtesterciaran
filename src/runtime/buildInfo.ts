/**
 * Build info – exposes version + commit SHA for Settings panel
 * Dev builds show commit SHA for update debugging – not on Golden Screens
 */
// @ts-ignore json import handled by Vite
import versionJson from '../../version.json'

// Package version from version.json milestone or package.json fallback
export const CURRENT_VERSION: string = (versionJson as any).packageVersion || (versionJson as any).semver || '4.3.0'

// Commit SHA – try multiple sources: Vite env, window injected, localStorage dev cache, unknown fallback
function resolveCommit(): string {
  // 1. Vite env replacement – injected by vite.config.ts define or .env
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GIT_COMMIT_SHA) {
      // @ts-ignore
      return String((import.meta as any).env.VITE_GIT_COMMIT_SHA).slice(0, 12)
    }
  } catch {}
  // 2. window injected by Tauri / build script
  try {
    // @ts-ignore
    const w = (typeof window !== 'undefined' ? (window as any).__CRYSTAL_COMMIT__ : null)
    if (w) return String(w).slice(0, 12)
  } catch {}
  // 3. Try meta tag injected at build
  try {
    if (typeof document !== 'undefined') {
      const el = document.querySelector('meta[name="crystal-commit"]')
      const c = el?.getAttribute('content')
      if (c) return c.slice(0, 12)
    }
  } catch {}
  // 4. Last runtime persisted SHA from earlier
  try {
    if (typeof localStorage !== 'undefined') {
      const s = localStorage.getItem('crystal-commit-sha')
      if (s) return s.slice(0, 12)
    }
  } catch {}
  return 'unknown'
}

export const COMMIT_SHA: string = resolveCommit()
export const FULL_VERSION_LABEL = `${CURRENT_VERSION} + ${COMMIT_SHA}`

// Also expose updater endpoint for diagnostics
export const UPDATER_ENDPOINT = 'https://github.com/ciaranf3308-star/emulationtesterciaran/releases/latest/download/latest.json'
