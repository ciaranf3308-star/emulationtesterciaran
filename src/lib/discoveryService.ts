/**
 * V8.6D1 – Discovery shim – ROMsFun primary, Vimm dormant fallback
 * Premium gaming OS: graphite / silver / acrylic / cool electric cyan
 * Provider-neutral surface – ROMsFun real page rendered inside Crystal, not Edge
 *
 * Keeps Vimm implementation isolated dormant – DO NOT leak Vimm concepts into ROMsFun
 */

import { RomsFunProvider } from '../discovery/providers/romsfun/RomsFunProvider';
import { VimmProvider } from '../discovery/providers/vimm/VimmProvider';
import { DiscoveryService } from '../discovery/discoveryService';
import { buildDetailUrl as buildVimmDetailUrl } from '../discovery/providers/vimm/vimmRoutes';
import { buildSearchUrl as buildVimmSearchUrl } from '../discovery/providers/vimm/vimmRoutes';
import { crystalToVimmToken } from '../discovery/providers/vimm/vimmSystemMap';
import { validateOpenUrl as validateVimmOpenUrl } from '../discovery/providers/vimm/hostValidation';
import { buildCanonicalDetailUrl as buildRomsFunDetailUrl, buildVaultRoot as buildRomsFunVaultRoot } from '../discovery/providers/romsfun/romsfunRoutes';
import { validateRomsFunOpenUrl } from '../discovery/providers/romsfun/hostValidation';
import { isTauriEnvironment } from '../runtime/environment';
import { isDevFixtureAllowed, isFixtureEnabled } from '../dev/fixtures/fixtureMode';
import type { DiscoveryResult as AuthResult, DiscoveryGameDetail } from '../discovery/types';

async function openValidatedExternalUrl(url: string): Promise<void> {
  // Use the installed, capability-approved shell plugin directly in packaged
  // builds. Do not gate this on legacy global detection: this WebView2 runtime
  // has live Tauri IPC but does not expose every legacy detection global.
  if (isTauriEnvironment() || !import.meta.env.DEV) {
    const shell = await import('@tauri-apps/plugin-shell');
    await shell.open(url);
    return;
  }
  const opened = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener') : null;
  if (!opened) throw new Error('EXTERNAL_BROWSER_OPEN_FAILED: browser blocked the new window');
}

// Primary provider is ROMsFun per V8.6D1 Plan C
const romsfunProvider = new RomsFunProvider();
const vimmProviderDormant = new VimmProvider(); // dormant / fallback-capable

const service = new DiscoveryService(romsfunProvider);
// For fallback internal reference: const vimmService = new DiscoveryService(vimmProviderDormant); // kept dormant but available if needed

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

export function canonicalVaultUrl(id: string): string {
  // Provider-aware: numeric -> Vimm (dormant legacy), slug containing 'roms/' or '/' -> ROMsFun
  if (/^\d+$/.test(id.trim())) {
    // Vimm dormant path – still canonical for isolation
    return buildVimmDetailUrl(id.trim());
  }
  try {
    // Try ROMsFun canonical
    return buildRomsFunDetailUrl(id.trim());
  } catch {
    // Fallback to raw id if it already looks like full url? but we never expose raw
    return `https://romsfun.com/roms/${id.trim()}`;
  }
}

export function isAllowedOpenUrl(url: string): boolean {
  // Provider-neutral – allow either Vimm or ROMsFun canonical, but explicitly block third-party like galaxylanesandgames.com
  if (validateVimmOpenUrl(url)) return true;
  if (validateRomsFunOpenUrl(url)) return true;
  // For safety, also block known forbidden
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase().includes('galaxylanesandgames.com')) return false;
  } catch {}
  return false;
}

function isStrictFixtureActive(): boolean {
  try {
    if (isTauriEnvironment()) return false;
    if (!isDevFixtureAllowed()) return false;
    const res = isFixtureEnabled();
    return !!res.enabled;
  } catch {
    return false;
  }
}

export async function search(params: DiscoverySearchParams): Promise<DiscoveryResult[]> {
  try {
    if (isStrictFixtureActive()) {
      const q = params.query.trim();
      if (q.length >= 1) {
        const sys = params.systemId.toUpperCase();
        const mocks: DiscoveryResult[] = Array.from({ length: 6 }, (_, i) => {
          const id = `roms/${params.systemId}/fixture-${q.toLowerCase().replace(/\s+/g,'-')}-${i}`;
          return {
            id,
            providerId: id,
            title: `${q[0].toUpperCase()+q.slice(1)} ${['Adventure','Legends','Turbo','Party','Collection','Remix'][i]} – ${sys}`,
            systemId: params.systemId,
            system: params.systemId,
            externalSystem: sys,
            region: ['USA','EUR','JPN'][i%3],
            year: 2000+i,
            availability: 'available' as any,
            externalUrl: `https://romsfun.com/roms/${params.systemId}/${q.toLowerCase()}-${i}`,
            thumbnailUrl: null,
            provider: 'romsfun',
          };
        });
        await new Promise(r=>setTimeout(r, 90));
        return mocks;
      }
    }
  } catch {
    // fallback to real provider
  }

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
    externalUrl: r.externalUrl || buildRomsFunDetailUrl(r.providerId),
    thumbnailUrl: r.thumbnailUrl || null,
    provider: r.provider || 'romsfun',
    discCount: r.discCount,
  }));
}

export async function detail(id: string, systemId?: string): Promise<DiscoveryGameDetail | null> {
  try {
    if (isStrictFixtureActive()) {
      await new Promise(r=>setTimeout(r,120));
      return {
        providerId: id,
        provider: 'romsfun',
        title: `Discovery Detail ${id.slice(-8)} – ROMsFun`,
        systemId: systemId || 'nes',
        description: 'ROMsFun catalog entry – premium gaming OS QA – metadata only, no ROM download. Crystal acquisition surface renders provider page in-app.',
        year: 2001,
        developer: 'Nintendo',
        publisher: 'Nintendo',
        externalUrl: buildRomsFunDetailUrl(id),
      } as any;
    }
  } catch {}

  try {
    const d = await service.getDetail(id, systemId);
    return d as any;
  } catch {
    return null;
  }
}

// Vimm dormant external open – kept fallback-capable, NOT used in primary ROMsFun GET GAME flow
export async function open(id: string): Promise<void> {
  // Determine provider by id shape
  if (/^\d+$/.test(id.trim())) {
    // Vimm dormant
    const url = buildVimmDetailUrl(id.trim());
    if (!validateVimmOpenUrl(url)) throw new Error(`open() blocked – Vimm URL not allowed: ${url}`);
    await openValidatedExternalUrl(url);
    return;
  }
  // ROMsFun slug – primary flow MUST NOT use Edge/shell.open, but this fallback remains for internal reference only
  const url = buildRomsFunDetailUrl(id.trim());
  if (!validateRomsFunOpenUrl(url)) {
    // Even if invalid, we do NOT fabricate galaxylanes URL – fail closed
    throw new Error(`open() blocked – ROMsFun URL not allowed: ${url} – do NOT allowlist galaxylanesandgames.com`);
  }
  // Fallback internal reference: still may open via shell for QA but primary Plan C flow does NOT call this
  await openValidatedExternalUrl(url);
}

export async function openVimmBackup(systemId: string, title: string): Promise<void> {
  const url = buildVimmBackupUrl(systemId, title);
  await openValidatedExternalUrl(url);
}

export function buildVimmBackupUrl(systemId: string, title: string): string {
  const token = crystalToVimmToken(systemId);
  if (!token) throw new Error(`VIMM_BACKUP_UNAVAILABLE: ${systemId} is not supported by Vimm's Lair`);
  // buildVimmSearchUrl performs the strict HTTPS + exact vimm.net + /vault
  // validation appropriate for a title search. validateVimmOpenUrl is only
  // for canonical numeric detail URLs and deliberately rejects query strings.
  return buildVimmSearchUrl(token, title);
}

export async function openRoot(): Promise<void> {
  // Primary is ROMsFun home – but primary GET GAME flow does NOT call shell.open
  const url = buildRomsFunVaultRoot();
  // internal fallback only
  try {
    if (isTauriEnvironment()) {
      const shellMod = await import('@tauri-apps/plugin-shell');
      const openFn = (shellMod as any).open || (shellMod as any).default?.open;
      if (typeof openFn === 'function') { await openFn(url); return; }
    }
  } catch {}
  if (typeof window !== 'undefined') (window as any).open(url, '_blank','noopener');
}

// Provider surface helpers – new primary flow (in-app child webview, not Edge)
export function buildRomsFunCanonicalForDiscover(slugOrId: string): string {
  return buildRomsFunDetailUrl(slugOrId);
}

export const primaryProviderId = 'romsfun';
export const dormantVimmProvider = vimmProviderDormant;
export const primaryProvider = romsfunProvider;

const discoveryService = {
  search,
  detail,
  open,
  openVimmBackup,
  buildVimmBackupUrl,
  openRoot,
  canonicalVaultUrl,
  isAllowedOpenUrl,
  primaryProviderId,
  primaryProvider,
  dormantVimmProvider,
  buildRomsFunCanonicalForDiscover,
};

export default discoveryService;
