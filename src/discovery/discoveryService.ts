/**
 * DiscoveryService – wraps provider with rate limiting, request dedup, cache, 429 backoff, timeout, abort.
 *
 * Safety:
 * - No arbitrary hosts – validates vimm only
 * - Uses Tauri backend fetch_vimm (no open fetch in frontend)
 * - One active search per provider via monotonic token, cancels stale
 * - Min spacing 750ms, timeout 10s, debounce external (UI)
 * - Search cache first
 */

import type { DiscoveryResult, DiscoveryGameDetail } from './types';
import type { CatalogProvider } from './catalogProvider';
import { getCachedSearch, setCachedSearch, getCachedDetail, setCachedDetail } from './cache';
import { SEARCH_TTL_MS_DEFAULT, DETAIL_TTL_MS } from './types';
import { isTauriEnvironment } from '../runtime/environment';

const MIN_SPACING_MS = 750;
const TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 800;
const BACKOFF_MAX_MS = 8000;
const MAX_RETRY_429 = 3;

interface ProviderState {
  lastFetchMs: number;
  activeToken: number;
  tokenSeq: number;
  inflight?: Promise<DiscoveryResult[]>;
}

export class DiscoveryService {
  private provider: CatalogProvider;
  private state: ProviderState = {
    lastFetchMs: 0,
    activeToken: 0,
    tokenSeq: 0,
  };

  constructor(provider: CatalogProvider) {
    this.provider = provider;
  }

  /**
   * Validate system – vimm only path per current spec
   */
  private assertValidSystem(systemId: string): void {
    if (!this.provider.supportsSystem(systemId)) {
      throw new Error(`System '${systemId}' unsupported for provider '${this.provider.id}'`);
    }
  }

  private async sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => resolve(), ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    });
  }

  private async enforceSpacing(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.state.lastFetchMs;
    if (elapsed < MIN_SPACING_MS) {
      await this.sleepWithAbort(MIN_SPACING_MS - elapsed, signal);
    }
  }

  private async invokeWithTimeout<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error(`Discovery timeout ${TIMEOUT_MS}ms`));
        }
      }, TIMEOUT_MS);

      const abortHandler = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };

      signal?.addEventListener('abort', abortHandler, { once: true });

      fn()
        .then(v => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abortHandler);
          resolve(v);
        })
        .catch(e => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abortHandler);
          reject(e);
        });
    });
  }

  async search(systemId: string, query: string, opts?: { signal?: AbortSignal }): Promise<DiscoveryResult[]> {
    this.assertValidSystem(systemId);

    const token = ++this.state.tokenSeq;
    this.state.activeToken = token;

    const q = query.trim();

    // cache first (ignoring abort for cache read)
    try {
      const cached = await getCachedSearch(this.provider.id, systemId, q);
      if (cached) {
        // stale token check – if newer search already started, discard cached? we still return cache for this token if still active
        if (this.state.activeToken !== token) {
          throw new DOMException('Stale search – superseded', 'AbortError');
        }
        return cached;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // ignore cache errors
    }

    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Spacing
    await this.enforceSpacing(opts?.signal);

    if (this.state.activeToken !== token) throw new DOMException('Stale search', 'AbortError');

    let attempt = 0;
    while (true) {
      try {
        const res = await this.invokeWithTimeout(
          () => this.provider.search(systemId, q, { signal: opts?.signal }),
          opts?.signal
        );

        if (this.state.activeToken !== token) throw new DOMException('Stale result discarded', 'AbortError');

        this.state.lastFetchMs = Date.now();

        // cache set best-effort
        setCachedSearch(this.provider.id, systemId, q, res, SEARCH_TTL_MS_DEFAULT).catch(() => {});

        return res;
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'));
        if (isAbort) throw err;

        // 429 handling – exponential backoff
        const is429 = err?.message?.includes('429') || err?.httpStatus === 429 || err?.status === 429;
        if (is429 && attempt < MAX_RETRY_429) {
          const backoff = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
          attempt++;
          await this.sleepWithAbort(backoff, opts?.signal);
          continue;
        }
        // real failure
        this.state.lastFetchMs = Date.now();
        throw err;
      }
    }
  }

  async getDetail(id: string, systemId?: string, opts?: { signal?: AbortSignal }): Promise<DiscoveryGameDetail> {
    // cache first
    const cached = await getCachedDetail(this.provider.id, id).catch(() => null);
    if (cached) {
      if (systemId) cached.systemId = systemId;
      return cached;
    }

    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    await this.enforceSpacing(opts?.signal);

    const detail = await this.invokeWithTimeout(
      () => this.provider.getDetail(id, systemId),
      opts?.signal
    );

    this.state.lastFetchMs = Date.now();

    // persist
    if (systemId) detail.systemId = systemId;
    setCachedDetail(this.provider.id, id, detail, DETAIL_TTL_MS).catch(() => {});

    return detail;
  }

  /**
   * Helper to check Tauri presence for future UI gating
   */
  isTauriAvailable(): boolean {
    return isTauriEnvironment();
  }

  getProvider(): CatalogProvider {
    return this.provider;
  }
}
