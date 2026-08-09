export type Theme = 'light' | 'dark'

export interface RomEntry {
  systemId: string
  path: string
  basename: string
  name: string
  favorite?: boolean
  lastPlayed?: string
}

export interface ScanResult {
  root: string
  discoveredSystems: { systemId: string; romCount: number; roms: RomEntry[] }[]
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

export function getDefaultEmulationRoot(): string {
  return 'C:\\Emulation'
}

export async function scanEmuDeckRoms(rootPath: string): Promise<ScanResult> {
  if (isTauri()) {
    try {
      // @ts-ignore - tauri api only available in desktop shell
      const tauri = await import('@tauri-apps/api/core')
      return await (tauri as any).invoke('scan_emu_deck_roms', { rootPath })
    } catch (e) {
      console.warn('Tauri scan invoke failed', e)
    }
  }
  return { root: rootPath, discoveredSystems: [] }
}

export async function getSystemList(): Promise<string[]> {
  if (isTauri()) {
    try {
      // @ts-ignore
      const tauri = await import('@tauri-apps/api/core')
      return await (tauri as any).invoke('get_system_list')
    } catch {}
  }
  return []
}

export async function launchGame(systemId: string, romPath: string): Promise<void> {
  if (isTauri()) {
    // @ts-ignore
    const tauri = await import('@tauri-apps/api/core')
    return (tauri as any).invoke('launch_game', { systemId, romPath })
  }
  console.log(`[mock launch] system=${systemId} rom=${romPath}`)
  alert(`Mock launch — would launch ${systemId}: ${romPath}\n(Real launch requires Tauri desktop build with EmuDeck path configured)`)
}

export async function readSaveStates(systemId?: string): Promise<any[]> {
  if (isTauri()) {
    // @ts-ignore
    const tauri = await import('@tauri-apps/api/core')
    return (tauri as any).invoke('read_save_states', { systemId: systemId ?? null })
  }
  return []
}

export async function getBackgroundPath(systemId: string, theme: Theme): Promise<string | null> {
  if (isTauri()) {
    try {
      // @ts-ignore
      const tauri = await import('@tauri-apps/api/core')
      return await (tauri as any).invoke('get_background_path', { systemId, theme })
    } catch {}
  }
  return null
}

export async function getLogoPath(systemId: string, theme: Theme): Promise<string | null> {
  if (isTauri()) {
    try {
      // @ts-ignore
      const tauri = await import('@tauri-apps/api/core')
      return await (tauri as any).invoke('get_logo_path', { systemId, theme })
    } catch {}
  }
  return null
}

export const Desktop = {
  scanEmuDeckRoms,
  getSystemList,
  launchGame,
  readSaveStates,
  getBackgroundPath,
  getLogoPath,
  isTauri,
  getDefaultEmulationRoot,
}
