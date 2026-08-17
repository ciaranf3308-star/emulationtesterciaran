/**
 * V3 launch controller – single launch authority wrapper
 * Routes steam:// systems through safe_steam_launch, otherwise via launch_game_with_handoff
 * Maintains launch guard + crash trampoline.
 */

import { invoke } from '@tauri-apps/api/core'

export type LaunchRequest = {
  systemId: string
  systemFullName?: string
  romPath: string
  romBasename?: string
  romDirectory?: string
  commandTemplate?: string
  commandLabel?: string
  isFirstConfiguredCommand?: boolean
}

let LAUNCH_IN_FLIGHT = false
const LAUNCH_COOLDOWN_MS = 2400

function containsOsShell(template: string): boolean {
  return template.toUpperCase().includes('OS-SHELL') || template.toUpperCase().includes('OS_SHELL')
}

export function isSteamSystem(request: LaunchRequest): boolean {
  const sid = (request.systemId || '').toLowerCase()
  if (sid === 'steam') return true
  if (request.commandTemplate && containsOsShell(request.commandTemplate)) return true
  // fallback – if romPath itself looks like steam:// URL
  if (request.romPath && request.romPath.toLowerCase().startsWith('steam://')) return true
  return false
}

export async function safeSteamLaunch(romPath: string): Promise<void> {
  // Validate ahead of invoking backend – quick regex for frontend too
  const trimmed = romPath.trim()
  if (trimmed.length === 0) throw new Error('STEAM_EMPTY_PATH')
  if (trimmed.length > 512) throw new Error('STEAM_URL_TOO_LONG')
  if (/[;|&`$()<>\\%"]/.test(trimmed) && !trimmed.toLowerCase().startsWith('http')) {
    // Steam URLs shouldn't contain shell metachars
    // For http catalog link we allow query but still block shell
    if (trimmed.toLowerCase().startsWith('steam://') && /[;&|`$()<>]/.test(trimmed)) {
      throw new Error('STEAM_URL_BLOCKED_METACHAR')
    }
  }
  // Delegate to Rust safe path
  await invoke('safe_steam_launch', { romPath: trimmed })
}

export async function safeSteamLaunchFromTemplate(systemId: string, commandTemplate: string, romPath: string): Promise<void> {
  await invoke('safe_steam_launch_from_template', { systemId, commandTemplate, romPath })
}

export async function launchGame(request: LaunchRequest): Promise<void> {
  if (LAUNCH_IN_FLIGHT) {
    console.warn('[crystal-launch] duplicate blocked')
    throw new Error('LAUNCH_ALREADY_IN_PROGRESS')
  }
  LAUNCH_IN_FLIGHT = true
  setTimeout(() => { LAUNCH_IN_FLIGHT = false }, LAUNCH_COOLDOWN_MS)
  try {
    if (isSteamSystem(request)) {
      // Steam path – never goes through generic shell
      await safeSteamLaunch(request.romPath)
      return
    }
    // Standard game launch via Tauri
    await invoke('launch_game_with_handoff', {
      systemId: request.systemId,
      romPath: request.romPath,
      romBasename: request.romBasename,
      romDirectory: request.romDirectory,
      commandLabel: request.commandLabel,
      commandTemplate: request.commandTemplate,
      isFirstConfiguredCommand: request.isFirstConfiguredCommand,
    } as any)
  } catch (e) {
    LAUNCH_IN_FLIGHT = false
    throw e
  }
}

export function resetLaunchGuardForTests() { LAUNCH_IN_FLIGHT = false }
