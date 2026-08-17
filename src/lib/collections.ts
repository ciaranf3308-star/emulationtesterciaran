/**
 * Collections frontend wrapper – Pinned + Backlog
 * Rust backend parity with localStorage fallback
 */

import { invokeBackend } from '../runtime/backend'
import { isTauriEnvironment } from '../runtime/environment'

export type PinnedItem = {
  system_id: string
  rom_basename: string
  rom_path?: string | null
  name?: string | null
  added_at?: number | null
}

export type BacklogItem = {
  system_id: string
  rom_basename: string
  rom_path?: string | null
  name?: string | null
  queued?: boolean | null
  added_at?: number | null
}

export type CollectionState = {
  pinned: PinnedItem[]
  backlog: BacklogItem[]
  version: number
}

const LS_KEY = 'crystal:collections:v1'

function lsLoad(): CollectionState {
  try {
    if (typeof window === 'undefined') return { pinned: [], backlog: [], version: 1 }
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return { pinned: [], backlog: [], version: 1 }
    const parsed = JSON.parse(raw)
    if (!parsed) return { pinned: [], backlog: [], version: 1 }
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.slice(0,5) : [],
      backlog: Array.isArray(parsed.backlog) ? parsed.backlog : [],
      version: 1
    }
  } catch { return { pinned: [], backlog: [], version: 1 } }
}

function lsSave(state: CollectionState) {
  try {
    if (typeof window === 'undefined') return
    const json = JSON.stringify(state)
    if (json.length > 4096) {
      console.warn('[collections] bounded exceeded localStorage, truncating backlog')
      const trimmed = { ...state, backlog: state.backlog.slice(0, 20) }
      window.localStorage.setItem(LS_KEY, JSON.stringify(trimmed))
      return
    }
    window.localStorage.setItem(LS_KEY, json)
  } catch {}
}

export async function getCollections(): Promise<CollectionState> {
  if (isTauriEnvironment()) {
    try {
      const res = await invokeBackend<CollectionState>('get_collections', {})
      // sync to ls for offline preview
      lsSave(res)
      return res
    } catch (e) {
      console.warn('[collections] backend get failed, fallback ls', e)
      return lsLoad()
    }
  }
  return lsLoad()
}

export async function setPinned(pinned: PinnedItem[]): Promise<CollectionState> {
  if (pinned.length > 5) throw new Error('PINNED_MAX_5')
  if (isTauriEnvironment()) {
    try {
      const res = await invokeBackend<CollectionState>('set_pinned', { pinned } as any)
      lsSave(res)
      return res
    } catch (e:any) { throw e }
  }
  const state = lsLoad()
  state.pinned = pinned.slice(0,5)
  lsSave(state)
  return state
}

export async function togglePinned(item: PinnedItem): Promise<CollectionState> {
  if (isTauriEnvironment()) {
    try { const res = await invokeBackend<CollectionState>('toggle_pinned', { item } as any); lsSave(res); return res }
    catch (e:any){ throw e }
  }
  const state = lsLoad()
  const key = `${item.system_id.toLowerCase()}::${item.rom_basename.toLowerCase()}`
  const idx = state.pinned.findIndex(p=> `${p.system_id.toLowerCase()}::${p.rom_basename.toLowerCase()}`===key)
  if (idx>=0) state.pinned.splice(idx,1)
  else {
    if (state.pinned.length>=5) throw new Error('PINNED_MAX_5_REACHED')
    state.pinned.unshift({ ...item, added_at: Math.floor(Date.now()/1000) })
  }
  lsSave(state)
  return state
}

export async function setBacklog(backlog: BacklogItem[]): Promise<CollectionState> {
  if (isTauriEnvironment()) {
    try { const res = await invokeBackend<CollectionState>('set_backlog', { backlog } as any); lsSave(res); return res }
    catch (e:any){ throw e }
  }
  const state = lsLoad()
  state.backlog = backlog
  lsSave(state)
  return state
}

export async function toggleBacklog(item: BacklogItem): Promise<CollectionState> {
  if (isTauriEnvironment()) {
    try { const res = await invokeBackend<CollectionState>('toggle_backlog', { item } as any); lsSave(res); return res }
    catch (e:any){ throw e }
  }
  const state = lsLoad()
  const key = `${item.system_id.toLowerCase()}::${item.rom_basename.toLowerCase()}`
  const idx = state.backlog.findIndex(b=> `${b.system_id.toLowerCase()}::${b.rom_basename.toLowerCase()}`===key)
  if (idx>=0) state.backlog.splice(idx,1)
  else {
    state.backlog.unshift({ ...item, added_at: Math.floor(Date.now()/1000), queued: (item as any).queued ?? true })
  }
  lsSave(state)
  return state
}

export function isPinned(state: CollectionState, system_id: string, rom_basename: string) {
  const key = `${system_id.toLowerCase()}::${rom_basename.toLowerCase()}`
  return state.pinned.some(p=> `${p.system_id.toLowerCase()}::${p.rom_basename.toLowerCase()}`===key)
}
export function isBacklog(state: CollectionState, system_id: string, rom_basename: string) {
  const key = `${system_id.toLowerCase()}::${rom_basename.toLowerCase()}`
  return state.backlog.some(b=> `${b.system_id.toLowerCase()}::${b.rom_basename.toLowerCase()}`===key)
}
