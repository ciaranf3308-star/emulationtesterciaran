/**
 * Vimm-specific types
 */

export interface VimmSearchParams {
  systemToken: string;
  query: string;
  advMaybe?: boolean;
}

export interface VimmSearchRow {
  id: string; // numeric vault id as string
  href: string; // /vault/12345
  title: string;
  systemToken: string;
}

export interface VimmParserOptions {
  crystalSystemId: string;
  vimmSystemToken: string;
}

// For internal detection
export const VIMM_PARSER_VERSION_SEARCH = '1.0.0';
export const VIMM_PARSER_VERSION_DETAIL = '1.0.0';

export type VimmAvailabilityPhrase = 'No longer available' | 'Publisher request' | 'Download not available' | 'Takedown' | 'unavailable';
