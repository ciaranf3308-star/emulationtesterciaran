/**
 * Compatibility shim for DiscoverView – wraps real VimmProvider + DiscoveryService + safety.
 * Provides: discoveryService.search({systemId, query}), .detail, .open, .openRoot, canonicalVaultUrl
 */
import { VimmProvider } from '../discovery/providers/vimm/VimmProvider';
import { DiscoveryService } from '../discovery/discoveryService';
import { buildDetailUrl, buildVaultRoot } from '../discovery/providers/vimm/vimmRoutes';
import { isTauriEnvironment } from '../runtime/environment';

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
  // extended optional for detail compatibility
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
  return buildDetailUrl(id);
}

export async function search(params: DiscoverySearchParams): Promise<DiscoveryResult[]> {
  const res = await service.search(params.systemId, params.query, { signal: params.signal });
  // map to legacy shape for DiscoverView
  return (res as any).map((r: any) => ({
    id: r.providerId || r.id,
    providerId: r.providerId || r.id,
    title: r.title,
    systemId: r.systemId,
    system: r.systemId,
    externalSystem: r.externalSystem,
    region: r.region,
    year: r.year,
    availability: (r.availability || 'available') as any,
    externalUrl: r.externalUrl || buildDetailUrl(r.providerId || r.id),
    thumbnailUrl: r.thumbnailUrl || null,
    provider: r.provider,
    developer: r.developer,
    publisher: r.publisher,
    players: r.players,
    discCount: r.discCount,
    verification: r.verification,
    description: r.description,
  }));
}

export async function detail(id: string, systemId?: string) {
  try {
    const d: any = await (service as any).getDetail(id, systemId);
    return d;
  } catch {
    try {
      const d2: any = await (provider as any).getDetail(id, systemId);
      return d2;
    } catch {
      return null;
    }
  }
}

export async function open(id: string): Promise<void> {
  const url = buildDetailUrl(id);
  try {
    if (isTauriEnvironment()) {
      const mod: any = await import('@tauri-apps/plugin-shell' as any);
      const openFn = mod.open || mod.default?.open;
      if (typeof openFn === 'function') {
        await openFn(url);
        return;
      }
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') (window as any).open(url, '_blank', 'noopener');
  } catch {}
}

export async function openRoot(): Promise<void> {
  const url = buildVaultRoot();
  try {
    if (isTauriEnvironment()) {
      const mod: any = await import('@tauri-apps/plugin-shell' as any);
      const openFn = mod.open || mod.default?.open;
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
};

export default discoveryService;
