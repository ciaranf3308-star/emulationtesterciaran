/**
 * Compatibility shim for DiscoverView – wraps real VimmProvider + DiscoveryService + safety.
 * Provides: discoveryService.search({systemId, query}), .detail, .open, .openRoot, canonicalVaultUrl
 * This facade is THIN – delegates to authoritative src/discovery/discoveryService.ts,
 * does not duplicate rate limiting / cache / backoff logic.
 */
import { VimmProvider } from '../discovery/providers/vimm/VimmProvider';
import { DiscoveryService } from '../discovery/discoveryService';
import { buildDetailUrl, buildVaultRoot } from '../discovery/providers/vimm/vimmRoutes';
import { validateOpenUrl } from '../discovery/providers/vimm/hostValidation';
import { isTauriEnvironment } from '../runtime/environment';
import type { DiscoveryResult as AuthResult, DiscoveryGameDetail } from '../discovery/types';

export type DiscoveryAvailability = 'available' | 'unavailable' | 'takedown' | 'unknown';

export type DiscoveryResult = {
  id: string;
  providerId?: string;
  title: string;
  system?: string;
  systemId?: string;
  externalSystem?: string;
  region?: string;
  year?: string | number;
  rating?: string | number;
  availability?: DiscoveryAvailability;
  externalUrl?: string;
  thumbnailUrl?: string | null;
  provider?: string;
  developer?: string;
  publisher?: string;
  players?: string;
  discCount?: number;
  verification?: string;
  description?: string;
};

export type DiscoverySearchParams = {
  systemId: string;
  query: string;
  limit?: number;
  signal?: AbortSignal;
};

const provider = new VimmProvider();
const service = new DiscoveryService(provider);

export function canonicalVaultUrl(id: string): string {
  // Canonical – numeric only
  return buildDetailUrl(id);
}

export function isAllowedOpenUrl(url: string): boolean {
  return validateOpenUrl(url);
}

export async function search(params: DiscoverySearchParams): Promise<DiscoveryResult[]> {
  const res: AuthResult[] = await service.search(params.systemId, params.query, { signal: params.signal });
  return res.map((r): DiscoveryResult => ({
    id: r.providerId || (r as any).id,
    providerId: r.providerId,
    title: r.title,
    systemId: r.systemId,
    system: r.systemId,
    externalSystem: r.externalSystem,
    region: r.region,
    year: r.year as any,
    availability: (r.availability || 'available') as DiscoveryAvailability,
    externalUrl: r.externalUrl || buildDetailUrl(r.providerId),
    thumbnailUrl: r.thumbnailUrl || null,
    provider: r.provider,
    discCount: r.discCount,
  }));
}

export async function detail(id: string, systemId?: string): Promise<DiscoveryGameDetail | null> {
  try {
    const d = await service.getDetail(id, systemId);
    return d;
  } catch {
    try {
      const d2 = await provider.getDetail(id, systemId);
      return d2;
    } catch {
      return null;
    }
  }
}

export async function open(id: string): Promise<void> {
  // Always canonical from numeric id – never trust scraped href
  let numeric = id.trim();
  if (!/^\d+$/.test(numeric)) {
    // attempt to parse id from URL if someone passed full URL – extract numeric via buildDetailUrl validation
    throw new Error(`open() requires numeric providerId, got '${id}'`);
  }
  const url = buildDetailUrl(numeric);
  if (!validateOpenUrl(url)) {
    throw new Error(`open() blocked – URL not allowed: ${url}`);
  }
  try {
    if (isTauriEnvironment()) {
      // Proper Tauri v2 shell plugin – dynamic import works now dependency present
      const shellMod = await import('@tauri-apps/plugin-shell');
      const openFn = (shellMod as any).open || (shellMod as any).default?.open;
      if (typeof openFn === 'function') {
        await openFn(url);
        return;
      }
    }
  } catch {
    // fall through to browser fallback
  }
  try {
    if (typeof window !== 'undefined') (window as any).open(url, '_blank', 'noopener');
  } catch {}
}

export async function openRoot(): Promise<void> {
  const url = buildVaultRoot();
  if (!validateOpenUrl(url) && url !== 'https://vimm.net/vault') {
    // Allow https://vimm.net/vault explicitly – validateOpenUrl should accept /vault
    if (!validateOpenUrl(url)) throw new Error(`openRoot blocked – ${url}`);
  }
  try {
    if (isTauriEnvironment()) {
      const shellMod = await import('@tauri-apps/plugin-shell');
      const openFn = (shellMod as any).open || (shellMod as any).default?.open;
      if (typeof openFn === 'function') {
        await openFn(url);
        return;
      }
    }
  } catch {}
  if (typeof window !== 'undefined') (window as any).open(url, '_blank', 'noopener');
}

const discoveryService = {
  search,
  detail,
  open,
  openRoot,
  canonicalVaultUrl,
  isAllowedOpenUrl,
};

export default discoveryService;

