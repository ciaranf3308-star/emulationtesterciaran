// Barrel – explicit re-exports to avoid ambiguity
export type { CatalogProvider } from '../../catalogProvider';
export { VimmProvider, vimmsProvider } from './VimmProvider';
export * from './types';
export { buildVaultRoot, buildSearchUrl, buildAdvSearchUrl, buildDetailUrl, parseIdFromUrl, isValidVimmUrl } from './vimmRoutes';
export { crystalToVimmToken, isSupportedCrystalSystem, listSupportedCrystalSystems, listUnsupportedExplicit, vimmTokenToCrystal, getFullMapping } from './vimmSystemMap';
export { parseVimmSearch, PARSER_VERSION as SEARCH_PARSER_VERSION } from './parseVimmSearch';
export { parseVimmDetail, PARSER_VERSION as DETAIL_PARSER_VERSION } from './parseVimmDetail';
