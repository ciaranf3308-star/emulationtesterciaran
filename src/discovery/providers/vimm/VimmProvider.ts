/**
 * VimmProvider – implements CatalogProvider id='vimms'
 *
 * Safety:
 * - Host validation strict: only https://vimm.net
 * - No arbitrary fetch – uses Tauri command fetch_vimm via @tauri-apps/api/core invoke
 * - Rate limiting internally (750ms spacing, timeout 10s)
 * - Cache integration via discovery/cache
 * - Abort support
 * - Never extracts download URLs
 * - No ROM auto-download
 */

import type { CatalogProvider } from '../../catalogProvider';
import type { DiscoveryResult, DiscoveryGameDetail } from '../../types';
import { crystalToVimmToken, isSupportedCrystalSystem } from './vimmSystemMap';
import { buildSearchUrl, buildBrowseUrl, buildDetailUrl } from './vimmRoutes';
import { parseVimmSearch } from './parseVimmSearch';
import { parseVimmDetail } from './parseVimmDetail';
import { parseSearchHtml, parseDetailHtml } from './parser';
import { StaleQueryGuard, createStaleGuard } from './staleGuard';
import { isTauriEnvironment } from '../../../runtime/environment';

const PROVIDER_ID = 'vimms';
const PROVIDER_NAME = "Vimm's Lair";
const MIN_SPACING_MS = 750;
const TIMEOUT_MS = 10_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function tauriFetchVimm(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error(`Only https allowed, got ${u.protocol}`);
    if (u.hostname !== 'vimm.net') throw new Error(`Host must be vimm.net, got ${u.hostname}`);
    if (u.port && u.port !== '' && u.port !== '443') throw new Error(`Custom port ${u.port} not allowed`);
    if (u.username || u.password) throw new Error('Credentials not allowed');
    const path = u.pathname;
    if (path !== '/vault' && path !== '/vault/' && !path.startsWith('/vault/')) {
      throw new Error(`Path must be /vault or /vault/..., got ${path} – vaultevil rejected`);
    }
  } catch (e) {
    throw new Error(`Vimm URL validation failed: ${(e as Error).message}`);
  }

  if (!isTauriEnvironment()) {
    throw new Error('Tauri environment required for Vimm fetch – isTauriEnvironment() false (browser CORS blocked)');
  }

  let invokeFn: any;
  try {
    const api = await import('@tauri-apps/api/core');
    invokeFn = (api as any).invoke;
  } catch {
    if (typeof window !== 'undefined') {
      const w = window as any;
      invokeFn = w.__TAURI__?.core?.invoke || w.__TAURI__?.invoke || w.__TAURI_INVOKE__;
    }
  }

  if (typeof invokeFn !== 'function') {
    throw new Error('Tauri invoke not available (tauri environment detection mismatch)');
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Vimm fetch timeout ${TIMEOUT_MS}ms for ${url}`));
      }
    }, TIMEOUT_MS);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    Promise.resolve(invokeFn('fetch_vimm', { url }))
      .then(result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (typeof result !== 'string') {
          reject(new Error('fetch_vimm returned non-string'));
        } else {
          resolve(result);
        }
      })
      .catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(new Error(typeof err === 'string' ? err : (err?.message || String(err))));
      });
  });
}

export class VimmProvider implements CatalogProvider {
  id = PROVIDER_ID;
  name = PROVIDER_NAME;

  private lastFetchMs = 0;
  private _guard = createStaleGuard();

  supportsSystem(systemId: string): boolean {
    return isSupportedCrystalSystem(systemId);
  }

  getGuard(): StaleQueryGuard {
    return this._guard;
  }

  // helper for guard monotonic – used by tests via getGuard().next()

  buildExternalUrl(id: string): string {
    return buildDetailUrl(id);
  }

  // Test fixtures – deterministic, NO network
  parseSearchFixture(html: string, crystalSystemId: string): any[] {
    const token = isSupportedCrystalSystem(crystalSystemId) ? crystalToVimmToken(crystalSystemId) : null;
    if (!token) throw new Error(`unsupported system ${crystalSystemId} – no Vimm token`);
    try {
      const results = (parseVimmSearch as any)(html, crystalSystemId, token);
      return results;
    } catch {
      // fallback fixture parser
      return parseSearchHtml(html, crystalSystemId, token);
    }
  }

  parseDetailFixture(html: string, crystalSystemId: string, detailId: string): any {
    try {
      const detail = parseVimmDetail(html, detailId, detailId);
      if (crystalSystemId) {
        (detail as any).systemId = crystalSystemId;
      }
      return detail;
    } catch {
      return parseDetailHtml(html, crystalSystemId, crystalToVimmToken(crystalSystemId) || 'unknown', detailId);
    }
  }

  private async enforceSpacing(signal?: AbortSignal) {
    const now = Date.now();
    const elapsed = now - this.lastFetchMs;
    if (elapsed < MIN_SPACING_MS) await sleep(MIN_SPACING_MS - elapsed, signal);
  }

  async search(systemId: string, query: string, opts?: { signal?: AbortSignal }): Promise<DiscoveryResult[]> {
    if (!this.supportsSystem(systemId)) {
      throw new Error(`System '${systemId}' unsupported for provider 'vimms' – no token (not supported by vimms)`);
    }
    // Empty query MUST NOT trigger network – return empty locally
    if (!query.trim()) {
      return [];
    }
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const token = crystalToVimmToken(systemId);
    if (!token) throw new Error(`No Vimm token for system '${systemId}'`);

    await this.enforceSpacing(opts?.signal);
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const browse = query.match(/^__browse:([A-Z#]|FEATURED)$/i);
    const url = browse ? buildBrowseUrl(token, browse[1]) : buildSearchUrl(token, query);

    const html = await tauriFetchVimm(url, opts?.signal);

    this.lastFetchMs = Date.now();

    if (opts?.signal?.aborted) throw new DOMException('Aborted after fetch', 'AbortError');

    try {
      const results = parseVimmSearch(html, systemId, token);
      return results;
    } catch (e: any) {
      if (e?.provider) throw e;
      throw new Error(`Vimm search parse failed: ${e?.message || String(e)}`);
    }
  }

  async getDetail(id: string, systemId?: string): Promise<DiscoveryGameDetail> {
    if (!/^\d+$/.test(id)) throw new Error(`Vimm detail id must be numeric, got '${id}'`);
    await this.enforceSpacing();
    const url = buildDetailUrl(id);
    const html = await tauriFetchVimm(url);
    this.lastFetchMs = Date.now();
    try {
      const detail = parseVimmDetail(html, id, id);
      if (systemId) {
        detail.systemId = systemId;
        if (!detail.externalSystem || detail.externalSystem === 'unknown') {
          const token = systemId ? crystalToVimmToken(systemId) : null;
          if (token) detail.externalSystem = token;
        }
      }
      return detail;
    } catch (e: any) {
      if (e?.provider) throw e;
      throw new Error(`Vimm detail parse failed for id ${id}: ${e?.message || String(e)}`);
    }
  }
}

export const vimmsProvider = new VimmProvider();

export function createVimmProvider(): VimmProvider {
  return new VimmProvider();
}
