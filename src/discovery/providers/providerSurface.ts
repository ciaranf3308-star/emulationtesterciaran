/**
 * V8.6D1 – Provider Surface abstraction
 * Provider-neutral surface – no caller arbitrary URLs, provider owns canonical URL construction/validation
 * Events: OPENED PAGE_LOADING PAGE_READY NAVIGATED EXTERNAL_NAVIGATION_BLOCKED DOWNLOAD_REQUESTED DOWNLOAD_STARTED DOWNLOAD_COMPLETED DOWNLOAD_FAILED CLOSED COMPLETED_LOCAL_FILE
 * Spec 2026-08-10 strict – no arbitrary URL downloader, no exposed download ids, no third-party allowlist for galaxylanes
 */

export const PROVIDER_SURFACE_EVENTS = [
  'OPENED',
  'PAGE_LOADING',
  'PAGE_READY',
  'NAVIGATED',
  'EXTERNAL_NAVIGATION_BLOCKED',
  'DOWNLOAD_REQUESTED',
  'DOWNLOAD_STARTED',
  'DOWNLOAD_COMPLETED',
  'DOWNLOAD_FAILED',
  'DOWNLOAD_REJECTED',
  'COMPLETED_LOCAL_FILE',
  'CLOSED',
  'PROVIDER_PAGE_FAILED',
] as const;

export type ProviderSurfaceEventType = typeof PROVIDER_SURFACE_EVENTS[number];

export type ProviderSurfaceRequest = {
  providerId: string; // 'romsfun' strict per spec
  initialUrl: string; // canonical https validated by provider
  systemId: string;
  expectedTitle: string;
  sessionId?: string;
};

export type ProviderSurfaceEvent = {
  type: ProviderSurfaceEventType;
  sessionId: string;
  providerId: string;
  url?: string;
  message?: string;
  path?: string; // local file path for COMPLETED_LOCAL_FILE / part path
  errorCode?: string;
  systemId?: string;
  expectedTitle?: string;
};

// Re-export alias for TS usage
export type ProviderSurfaceRequestPayload = ProviderSurfaceRequest;
