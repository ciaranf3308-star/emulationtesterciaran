/**
 * Discovery architecture – core types (no UI)
 * V8.1 safety preserved – no filesystem writes here.
 * V8.4.1 hardening: discriminated ParserError vs detail, plus version/languages, ratings.
 */

export type Availability = 'available' | 'unavailable' | 'takedown' | 'unknown';

export interface DiscoveryResult {
  kind?: 'search-result' | 'detail'; // optional discriminator for compatibility
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
  // Extended search fields from live table (V8.4.1)
  version?: string;
  revision?: string;
  languages?: string; // raw column e.g. "de en es fr it" or "-"
}

export interface DiscoveryGameDetail extends DiscoveryResult {
  kind: 'detail';
  description?: string;
  developer?: string;
  publisher?: string;
  players?: string;
  regions?: string[];
  languagesArr?: string[]; // parsed languages array when present
  mediaFormat?: string;
  revision?: string;
  serial?: string;
  verification?: string;
  verificationDate?: string;
  crc?: string;
  md5?: string;
  sha1?: string;
  fileSize?: string;
  files?: string[];
  // Ratings breakdown (live detail page)
  graphicsRating?: string;
  soundRating?: string;
  gameplayRating?: string;
  overallRating?: string;
  overallVotes?: number;
  // Additional optional detail fields preserving live structure
  yearFromLabel?: number;
  yearText?: string;
  // Legacy aliases
  languages?: string; // keep shallow but extended
}

export type ParserRouteType = 'search' | 'detail';

export interface ParserError {
  kind: 'parser-error';
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
  return { kind: 'parser-error', provider, routeType, httpStatus, parserVersion, message, selectorHint };
}

export function isParserError(obj: any): obj is ParserError {
  if (!obj) return false;
  return obj.kind === 'parser-error' && typeof obj.provider === 'string' && typeof obj.routeType === 'string' && typeof obj.parserVersion === 'string';
}

export function isDiscoveryDetail(obj: any): obj is DiscoveryGameDetail {
  if (!obj) return false;
  return obj.kind === 'detail' && typeof obj.providerId === 'string' && typeof obj.title === 'string';
}
