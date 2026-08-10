/**
 * CatalogProvider abstraction – provider contract
 */
import type { DiscoveryResult, DiscoveryGameDetail } from './types';

export interface CatalogProvider {
  id: string; // e.g. 'vimms'
  name: string; // human label
  supportsSystem(systemId: string): boolean;
  search(systemId: string, query: string, opts?: { signal?: AbortSignal }): Promise<DiscoveryResult[]>;
  getDetail(id: string, systemId?: string): Promise<DiscoveryGameDetail>;
  buildExternalUrl(id: string): string;
}
