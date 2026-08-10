/**
 * Typed frontend/backend API – Tauri v2 real runtime (V6)
 * Bridges frontend to Rust commands: get_machine_config, ROM enumeration, gamelist join, media verification, launch.
 * Browser dev gracefully degrades to sanitized example where Tauri unavailable.
 */

import { getTauriInvoker, getTauriInvokerSync } from './tauri'
import { isTauriEnvironment } from './environment'

export interface GameEntry {
  id: string
  system_id: string
  system_full_name?: string
  name: string
  rom_path: string
  rom_basename: string
  extension: string
  file_size?: number
  favorite?: boolean
  play_count?: number
  last_played?: string
  description?: string
  developer?: string
  publisher?: string
  genre?: string
  players?: string
  rating?: number
  releasedate?: string
  playtime?: number
  cover_path?: string
  marquee_path?: string
  has_media?: boolean
}

export interface MediaCheck {
  exists: boolean
  path?: string
  candidates: string[]
}

export interface MediaVerificationResult {
  system_id: string
  rom_basename: string
  media: Record<string, MediaCheck>
}

export async function invokeBackend<T>(command: string, args?: Record<string, any>): Promise<T> {
  const invoker = await getTauriInvoker()
  if (!invoker) {
    throw new Error(`Tauri invoke unavailable – attempted ${command} outside installed mode`)
  }
  // Tauri v2 invoke signature: invoke(command, args)
  return invoker(command, args) as Promise<T>
}

export function invokeBackendSync<T>(command: string, args?: Record<string, any>): T | null {
  const invoker = getTauriInvokerSync()
  if (!invoker) return null
  try {
    // sync variant may not be available in all Tauri builds – attempt
    // @ts-ignore – invokeSync exists in some bindings
    const res = (invoker as any)(command, args)
    return res as T
  } catch {
    return null
  }
}

// Machine config is handled by MachineConfigProvider – but expose helper for tests
export async function fetchMachineConfig(): Promise<any> {
  return invokeBackend<any>('get_machine_config')
}

// ROM enumeration
export async function listGames(systemId: string): Promise<GameEntry[]> {
  if (!isTauriEnvironment()) {
    throw new Error('listGames requires Tauri installed mode')
  }
  return invokeBackend<GameEntry[]>('list_games', { systemId })
}

export async function listAllGames(): Promise<GameEntry[]> {
  if (!isTauriEnvironment()) {
    throw new Error('listAllGames requires Tauri installed mode')
  }
  return invokeBackend<GameEntry[]>('list_all_games')
}

export async function getFavorites(): Promise<GameEntry[]> {
  if (!isTauriEnvironment()) {
    throw new Error('getFavorites requires Tauri installed mode')
  }
  return invokeBackend<GameEntry[]>('get_favorites')
}

export async function getRecentlyPlayed(): Promise<GameEntry[]> {
  if (!isTauriEnvironment()) {
    throw new Error('getRecentlyPlayed requires Tauri installed mode')
  }
  return invokeBackend<GameEntry[]>('get_recently_played')
}

export async function verifyMedia(systemId: string, romBasename: string, mediaTypes?: string[]): Promise<MediaVerificationResult> {
  if (!isTauriEnvironment()) {
    throw new Error('verifyMedia requires Tauri installed mode')
  }
  return invokeBackend<MediaVerificationResult>('verify_media', { systemId, romBasename, mediaTypes: mediaTypes || [] })
}

// Launch helper – wraps existing capability checks already done in resolver, but backend is source of truth
export async function launchBackendGame(request: any): Promise<void> {
  return invokeBackend<void>('launch_game', { request })
}

// V8.7 – handoff path: spawns watcher BEFORE exit, returns session guard
export async function launchBackendGameWithHandoff(request: any): Promise<any> {
  return invokeBackend<any>('launch_game_with_handoff', { request })
}

export async function getLaunchRestoreState(): Promise<any | null> {
  return invokeBackend<any | null>('get_launch_restore_state', {})
}

export async function saveLaunchRestoreState(systemId: string, romPath: string, romBasename: string): Promise<any> {
  return invokeBackend<any>('save_launch_restore_state', { systemId, romPath, romBasename } as any)
}

export async function clearLaunchRestoreState(): Promise<void> {
  return invokeBackend<void>('clear_launch_restore_state', {})
}

export async function exitCrystalAfterHandoff(): Promise<void> {
  return invokeBackend<void>('exit_crystal_after_handoff', {})
}

