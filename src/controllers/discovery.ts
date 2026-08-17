/**
 * Discovery controller – Vimm's Lair / RomsFun catalog fetch orchestration
 * Never automates ROM download; only catalog/reference.
 */

export type DiscoveryProvider = 'vimm' | 'romsfun'

export type DiscoveryCacheEntry = {
  provider: DiscoveryProvider
  systemId: string
  query?: string
  timestamp: number
  payload: unknown
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24h

export function isCacheStale(entry: DiscoveryCacheEntry, now = Date.now()): boolean {
  return now - entry.timestamp > CACHE_TTL_MS
}

export function cacheKey(provider: DiscoveryProvider, systemId: string, query?: string): string {
  return `${provider}::${systemId}::${query || ''}`
}

// UI-only – actual fetch goes via Tauri commands discovery::fetch_vimm etc (worker-threaded)
