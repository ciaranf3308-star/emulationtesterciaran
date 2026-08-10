export const RATE_LIMIT_MS = 750;
export const BACKOFF_BASE_MS = 1500;

export function getBackoffDelayMs(attempt: number): number {
  const base = BACKOFF_BASE_MS;
  return base * Math.pow(2, attempt);
}

export type FetchErrorInfo = { type: 'timeout'|'429'|'403'|'network'|'unknown'; retryable: boolean; status?: number };

export function classifyFetchError(err: any, statusCode?: number): FetchErrorInfo {
  const msg = (err?.message || String(err || '')).toLowerCase();
  const status = statusCode ?? err?.status ?? (typeof err === 'number' ? err : undefined);
  if (status === 429 || msg.includes('429') || msg.includes('too many requests')) {
    return { type: '429', retryable: true, status: 429 };
  }
  if (status === 403 || msg.includes('403') || msg.includes('forbidden')) {
    return { type: '403', retryable: false, status: 403 };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { type: 'timeout', retryable: true };
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('econn')) {
    return { type: 'network', retryable: true };
  }
  return { type: 'unknown', retryable: false, status };
}

// State object used by provider for spacing + backoff attempts
export type RateLimitState = {
  lastFetchMs: number;
  consecutive429: number;
  backoffUntilMs: number;
};

export function createRateLimitState(): RateLimitState {
  return { lastFetchMs: 0, consecutive429: 0, backoffUntilMs: 0 };
}

export function canFetch(state: RateLimitState, now = Date.now()): boolean {
  return now >= state.backoffUntilMs;
}

export function noteSuccess(state: RateLimitState, now = Date.now()): void {
  state.lastFetchMs = now;
  state.consecutive429 = 0;
  state.backoffUntilMs = 0;
}

export function note429(state: RateLimitState, now = Date.now()): void {
  state.consecutive429 += 1;
  const delay = getBackoffDelayMs(Math.min(state.consecutive429 - 1, 5));
  state.backoffUntilMs = now + delay;
}

export function noteFailure(state: RateLimitState, now = Date.now()): void {
  state.lastFetchMs = now;
}
