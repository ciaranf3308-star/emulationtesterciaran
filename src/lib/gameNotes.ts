/**
 * Game Notes – frontend wrapper invoking Tauri backend
 * Mirrors backend.ts pattern via getTauriInvoker()
 */
import { invokeBackend } from '../runtime/backend'
import { isTauriEnvironment } from '../runtime/environment'

export interface GameNote {
  system_id: string
  rom_basename: string
  text: string
  progress: number
  last_edit: string
  created_at?: string
  notes?: string // legacy alias
}

export async function getAllGameNotes(): Promise<GameNote[]> {
  if (!isTauriEnvironment()) {
    // Browser dev: return empty – never invented truth, but tolerate local storage fallback
    try {
      const raw = localStorage.getItem('crystal:gameNotesFallback')
      if (raw) return JSON.parse(raw) as GameNote[]
    } catch {}
    return []
  }
  try {
    return await invokeBackend<GameNote[]>('get_all_game_notes')
  } catch (e) {
    console.warn('[gameNotes] get_all failed', e)
    return []
  }
}

export async function getGameNote(systemId: string, romBasename: string): Promise<GameNote | null> {
  if (!isTauriEnvironment()) {
    try {
      const raw = localStorage.getItem('crystal:gameNotesFallback')
      if (raw) {
        const arr = JSON.parse(raw) as GameNote[]
        return arr.find(n => n.system_id === systemId && n.rom_basename === romBasename) || null
      }
    } catch {}
    return null
  }
  try {
    const res = await invokeBackend<GameNote | null>('get_game_note', {
      system_id: systemId,
      rom_basename: romBasename,
    })
    return res
  } catch (e) {
    console.warn('[gameNotes] get one failed', e)
    return null
  }
}

export async function setGameNote(
  systemId: string,
  romBasename: string,
  text: string,
  progress: number,
): Promise<GameNote | null> {
  const boundedText = (text || '').slice(0, 4000)
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress || 0)))
  if (!isTauriEnvironment()) {
    // Local fallback for browser preview – store in localStorage
    try {
      const now = new Date().toISOString()
      const fallback: GameNote = {
        system_id: systemId,
        rom_basename: romBasename,
        text: boundedText,
        progress: clampedProgress,
        last_edit: now,
        created_at: now,
      }
      const raw = localStorage.getItem('crystal:gameNotesFallback')
      const arr: GameNote[] = raw ? JSON.parse(raw) : []
      const idx = arr.findIndex(n => n.system_id === systemId && n.rom_basename === romBasename)
      if (idx >= 0) {
        const prev = arr[idx]
        fallback.created_at = prev.created_at || now
        arr[idx] = fallback
      } else {
        arr.push(fallback)
      }
      localStorage.setItem('crystal:gameNotesFallback', JSON.stringify(arr))
      return fallback
    } catch {
      return null
    }
  }
  try {
    const note = await invokeBackend<GameNote>('set_game_note', {
      system_id: systemId,
      rom_basename: romBasename,
      text: boundedText,
      progress: clampedProgress,
    })
    return note
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('SAFE_MODE_BLOCKED')) {
      throw new Error('SAFE_MODE_BLOCKED')
    }
    console.error('[gameNotes] set failed', e)
    throw e
  }
}

export async function deleteGameNote(systemId: string, romBasename: string): Promise<boolean> {
  if (!isTauriEnvironment()) {
    try {
      const raw = localStorage.getItem('crystal:gameNotesFallback')
      if (raw) {
        const arr = JSON.parse(raw) as GameNote[]
        const filtered = arr.filter(n => !(n.system_id === systemId && n.rom_basename === romBasename))
        localStorage.setItem('crystal:gameNotesFallback', JSON.stringify(filtered))
        return filtered.length !== arr.length
      }
    } catch {}
    return false
  }
  try {
    const res = await invokeBackend<boolean>('delete_game_note', {
      system_id: systemId,
      rom_basename: romBasename,
    })
    return !!res
  } catch (e) {
    console.warn('[gameNotes] delete failed', e)
    return false
  }
}

export function gameNoteKey(systemId: string, romBasename: string): string {
  return `${systemId}:${romBasename}`
}
