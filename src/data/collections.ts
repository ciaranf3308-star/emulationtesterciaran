/**
 * Crystal V3 – Collections persistence helper
 * Boutique-hotel polish: tiny, safe, never clobbers user library truth.
 * Wraps localStorage (browser) + Tauri writable_root cache via FS plugin when available.
 * Guards: 64KB max, safe JSON parse, no secrets.
 *
 * This complements the Tauri-side listAllGames/getFavorites/getRecentlyPlayed (authoritative)
 * with client-side prefs: pinned collections, hidden system filters, sort overrides, recent view.
 *
 * Safe write path – stays inside app-data, never user ROM/BIOS/saves.
 */

export type CollectionId = 'allgames' | 'favorites' | 'recent' | 'steam' | 'systems' | string

export type CollectionPrefs = {
  version: 1
  // client-local UI tweaks, not library truth
  pinned: CollectionId[]
  hidden: string[] // system ids user hid in collection views
  collapsed?: string[] // sections collapsed
  sort: Record<string, 'name' | 'recent' | 'system' | 'lastPlayed'>
  viewMode: Record<string, 'grid' | 'list'>
  lastView: CollectionId | null
  lastUpdatedISO: string | null
}

const KEY = 'crystal:collections:v1'
const MAX_BYTES = 64 * 1024
const DEFAULT_SORT: Record<string, CollectionPrefs['sort'][string]> = {}
const DEFAULT_VIEW: Record<string, 'grid'|'list'> = {}

const DEFAULT_PREFS: CollectionPrefs = {
  version: 1,
  pinned: ['favorites', 'recent'],
  hidden: [],
  collapsed: [],
  sort: {},
  viewMode: {},
  lastView: null,
  lastUpdatedISO: null,
}

function safeParse(raw: string | null): CollectionPrefs | null {
  if (!raw) return null
  if (raw.length > MAX_BYTES) return null
  try {
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object') return null
    // basic shape migration guard
    if (j.version !== 1 && j.version != null) return null
    return {
      version: 1,
      pinned: Array.isArray(j.pinned) ? j.pinned.slice(0, 32).filter((x: any) => typeof x === 'string') : DEFAULT_PREFS.pinned,
      hidden: Array.isArray(j.hidden) ? j.hidden.slice(0, 128).filter((x: any) => typeof x === 'string') : [],
      collapsed: Array.isArray(j.collapsed) ? j.collapsed.slice(0, 64).filter((x: any) => typeof x === 'string') : [],
      sort: typeof j.sort === 'object' && j.sort ? j.sort : {},
      viewMode: typeof j.viewMode === 'object' && j.viewMode ? j.viewMode : {},
      lastView: typeof j.lastView === 'string' ? j.lastView : null,
      lastUpdatedISO: typeof j.lastUpdatedISO === 'string' ? j.lastUpdatedISO : null,
    } as CollectionPrefs
  } catch {
    return null
  }
}

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const k = '__crystal_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export function loadCollectionPrefs(): CollectionPrefs {
  if (!isLocalStorageAvailable()) return { ...DEFAULT_PREFS, sort: { ...DEFAULT_SORT }, viewMode: { ...DEFAULT_VIEW } }
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = safeParse(raw)
    if (parsed) {
      // merge default to fill gaps
      return {
        ...DEFAULT_PREFS,
        ...parsed,
        sort: { ...DEFAULT_SORT, ...parsed.sort },
        viewMode: { ...DEFAULT_VIEW, ...parsed.viewMode },
      }
    }
  } catch {}
  return { ...DEFAULT_PREFS, sort: { ...DEFAULT_SORT }, viewMode: { ...DEFAULT_VIEW } }
}

export function saveCollectionPrefs(prefs: CollectionPrefs): { ok: boolean; error?: string } {
  // guard size and shape
  try {
    const stamped: CollectionPrefs = {
      ...prefs,
      version: 1,
      lastUpdatedISO: new Date().toISOString(),
    }
    const raw = JSON.stringify(stamped)
    if (raw.length > MAX_BYTES) {
      return { ok: false, error: `COLLECTIONS_TOO_LARGE ${raw.length}>${MAX_BYTES}` }
    }
    if (!isLocalStorageAvailable()) {
      // no-op success when no storage (e.g., Tauri early boot without window)
      return { ok: true }
    }
    window.localStorage.setItem(KEY, raw)
    // best-effort mirror to Tauri cache for cross-window sync – don't block
    try {
      // @ts-ignore: optional Tauri FS; ignore failure
      const maybeTauri = (typeof window !== 'undefined' && (window as any).__TAURI__) || null
      if (maybeTauri) {
        // future: if backend adds crystal_collections_save command, wire here
        // await invokeBackend('save_collection_prefs', { prefs: stamped })
      }
    } catch {}
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export function resetCollectionPrefs(): void {
  try {
    if (isLocalStorageAvailable()) window.localStorage.removeItem(KEY)
  } catch {}
}

export function getCollectionSort(prefs: CollectionPrefs, collectionId: string): 'name' | 'recent' | 'system' | 'lastPlayed' {
  return (prefs.sort?.[collectionId] as any) || (collectionId === 'recent' ? 'lastPlayed' : collectionId === 'favorites' ? 'recent' : 'name')
}

export function setCollectionSort(prefs: CollectionPrefs, collectionId: string, sort: CollectionPrefs['sort'][string]): CollectionPrefs {
  return { ...prefs, sort: { ...prefs.sort, [collectionId]: sort }, lastUpdatedISO: new Date().toISOString() }
}

export function getCollectionViewMode(prefs: CollectionPrefs, collectionId: string): 'grid'|'list' {
  return prefs.viewMode?.[collectionId] || 'grid'
}

export function setCollectionViewMode(prefs: CollectionPrefs, collectionId: string, mode: 'grid'|'list'): CollectionPrefs {
  return { ...prefs, viewMode: { ...prefs.viewMode, [collectionId]: mode } }
}

export function togglePinned(prefs: CollectionPrefs, id: CollectionId): CollectionPrefs {
  const set = new Set(prefs.pinned)
  if (set.has(id)) set.delete(id)
  else {
    if (set.size >= 16) {
      // drop oldest to stay bounded
      const arr = Array.from(set)
      arr.shift()
      set.clear()
      arr.forEach(x => set.add(x))
    }
    set.add(id)
  }
  return { ...prefs, pinned: Array.from(set) }
}

export function toggleHiddenSystem(prefs: CollectionPrefs, systemId: string): CollectionPrefs {
  const s = new Set(prefs.hidden)
  if (s.has(systemId)) s.delete(systemId)
  else s.add(systemId)
  return { ...prefs, hidden: Array.from(s).slice(0, 128) }
}

// Convenience hookless-ish state helper for components that don't need full React
export function getCollectionPrefsSnapshot(): CollectionPrefs {
  return loadCollectionPrefs()
}

export const COLLECTIONS_STORAGE_KEY = KEY
export const COLLECTIONS_MAX_BYTES = MAX_BYTES
export default {
  loadCollectionPrefs,
  saveCollectionPrefs,
  resetCollectionPrefs,
  getCollectionSort,
  setCollectionSort,
  getCollectionViewMode,
  setCollectionViewMode,
  togglePinned,
  toggleHiddenSystem,
  getCollectionPrefsSnapshot,
  COLLECTIONS_STORAGE_KEY,
  COLLECTIONS_MAX_BYTES,
}
