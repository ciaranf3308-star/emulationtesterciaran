/**
 * Discovery architecture – core types (no UI)
 * V8.1 safety preserved – no filesystem writes here.
 */

export type Availability = 'available' | 'unavailable' | 'takedown' | 'unknown';

export interface DiscoveryResult {
  provider: string; // e.g. 'vimms'
  providerId: string; // numeric or stable id on provider
  systemId: string; // Crystal system id (e.g. ps2)
  externalSystem: string; // provider's system token (e.g. PS2)
  title: string;
  region?: string;
  year?: number;
  rating?: string;
  externalUrl: string; // canonical https://vimm.net/vault/xxxx
  thumbnailUrl?: string;
  availability: Availability;
  discCount?: number;
}

export interface DiscoveryGameDetail extends DiscoveryResult {
  description?: string;
  developer?: string;
  publisher?: string;
  players?: string;
  regions?: string[];
  languages?: string[];
  mediaFormat?: string;
  revision?: string;
  serial?: string;
  verification?: string;
  crc?: string;
  md5?: string;
  sha1?: string;
  fileSize?: string;
  files?: string[];
}

export type ParserRouteType = 'search' | 'detail';

export interface ParserError {
  provider: string;
  routeType: ParserRouteType;
  httpStatus: number;
  parserVersion: string;
  message: string;
  selectorHint?: string;
}

export interface CacheEntry<T> {
  timestamp: number;
  ttlMs: number;
  data: T;
}

export interface SearchCacheEntry extends CacheEntry<DiscoveryResult[]> {
  provider: string;
  systemId: string;
  query: string;
}

export interface DetailCacheEntry extends CacheEntry<DiscoveryGameDetail> {
  provider: string;
  detailId: string;
  systemId?: string;
}

export const SEARCH_TTL_MS_DEFAULT = 20 * 60 * 1000; // 20 minutes (15-30 range)
export const SEARCH_TTL_MS_MIN = 15 * 60 * 1000;
export const SEARCH_TTL_MS_MAX = 30 * 60 * 1000;
export const DETAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24h = 86400000

export function isCacheFresh(entry: CacheEntry<unknown>, now = Date.now()): boolean {
  return now - entry.timestamp < entry.ttlMs;
}

export function createParserError(
  provider: string,
  routeType: ParserRouteType,
  httpStatus: number,
  parserVersion: string,
  message: string,
  selectorHint?: string
): ParserError {
  return { provider, routeType, httpStatus, parserVersion, message, selectorHint };
}
