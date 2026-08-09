import type { MachineConfig, MachineSystem, SystemCommand, SystemMediaSummary, MediaCategory } from './types'
import type { ThemeAssetSet } from '../assets/types'
import { getThemeAssetsForSystem } from '../assets/resolver'

export function getPopulatedSystems(config: MachineConfig): MachineSystem[] {
  // per spec, machine systems is source of truth; populated defined by matchingRomFileCount >0 and system exists
  return config.systems.filter(s => s.matchingRomFileCount > 0)
}

export function getSystemById(config: MachineConfig, id: string): MachineSystem | undefined {
  return config.systems.find(s => s.id === id)
}

export function getSelectedCommand(system: MachineSystem): SystemCommand | undefined {
  const label = system.launchSelection?.selectedLabel
  if (!label) return system.commands[0]
  return system.commands.find(c => c.label === label) ?? system.commands[0]
}

export function getSelectedCommandByLabel(system: MachineSystem, label: string): SystemCommand | undefined {
  return system.commands.find(c => c.label === label)
}

export function getSystemMediaSummary(system: MachineSystem): SystemMediaSummary {
  const categories = Object.entries(system.media || {})
    .filter(([, v]) => v !== undefined)
    .map(([type, cat]) => {
      const c = cat as MediaCategory
      return { type, fileCount: c.fileCount ?? 0, exists: !!c.exists, directMatches: c.directRomBasenameMatches ?? 0 }
    })
  const totalFiles = categories.reduce((a, c) => a + c.fileCount, 0)
  return {
    systemId: system.id,
    totalFiles,
    categoriesPresent: categories.filter(c => c.exists).length,
    categories,
  }
}

/** Asset join: machine -> theme manifest -> presentation */
export function getThemeAssetsForSystemJoined(manifest: ThemeAssetSet | null, systemId: string, theme: 'light'|'dark') {
  if (!manifest) return undefined
  return getThemeAssetsForSystem(manifest, systemId, theme)
}

export function getAllSystemIds(config: MachineConfig): string[] {
  return config.systems.map(s => s.id)
}

export function getSystemFullName(system: MachineSystem): string {
  return system.fullName || system.id
}
