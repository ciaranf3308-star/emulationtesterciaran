/**
 * V8.6D1 – Provider Surface hook – bridges Tauri backend (child webview + download capture) to React
 * Phases reuse existing acquisitionUiController mapping where possible, extend with PROVIDER surface phases
 * Reuse tail: import_game_source -> refreshLibrary -> findInstalledGame exact installedPaths authority -> Library -> A PLAY
 * NO arbitrary URL downloader, NO Edge/shell.open in primary path, NO galaxylanes allowlist
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { GameEntry } from '../runtime/backend';
import { normalizeTitle as normalizeTitleExact } from './candidateMatcher';
import { findInstalledGame } from './acquisitionUiController';
import { isTauriEnvironment } from '../runtime/environment';

export type ProviderSurfacePhase =
  | 'IDLE'
  | 'OPENING_PROVIDER'
  | 'BROWSING_PROVIDER'
  | 'DOWNLOAD_STARTING'
  | 'DOWNLOADING'
  | 'FINALIZING_DOWNLOAD'
  | 'ADDING_TO_LIBRARY'
  | 'REFRESHING_LIBRARY'
  | 'READY_TO_PLAY'
  | 'PROVIDER_PAGE_FAILED'
  | 'EXTERNAL_NAVIGATION_BLOCKED'
  | 'DOWNLOAD_REJECTED'
  | 'DOWNLOAD_FAILED'
  | 'CANCELLED'
  | 'SAFE_MODE_BLOCKED';

export type ProviderSurfaceState = {
  sessionId: string;
  providerId: string;
  systemId: string;
  expectedTitle: string;
  phase: ProviderSurfacePhase;
  currentUrl?: string;
  localFilePath?: string;
  message?: string;
  errorCode?: string;
  progress?: number; // 0-1 when genuinely available
  providerBlockedUrl?: string;
};

type BeginRequest = {
  systemId: string;
  expectedTitle: string;
  initialUrl: string; // canonical romsfun URL – provider owns construction
};

type TauriEventPayload = {
  type: string;
  sessionId: string;
  providerId: string;
  url?: string;
  message?: string;
  path?: string;
  errorCode?: string;
  systemId?: string;
  expectedTitle?: string;
};

export type UseProviderSurfaceOpts = {
  refreshLibrary?: (systemId: string) => Promise<GameEntry[]>;
  onGameFound?: (systemId: string, game: GameEntry) => void;
  onRefreshComplete?: (systemId: string, games: GameEntry[]) => void;
};

export type UseProviderSurfaceReturn = {
  active: boolean;
  phase: ProviderSurfacePhase;
  state: ProviderSurfaceState | null;
  foundGame: GameEntry | null;
  errorDetail: string | null;
  begin: (req: BeginRequest) => Promise<string>;
  cancel: () => Promise<void>;
  close: () => Promise<void>;
};

async function tauriInvoke(cmd: string, args?: any): Promise<any> {
  if (!isTauriEnvironment()) {
    // For deterministic QA / tests we simulate
    if (cmd === 'create_provider_surface') {
      return {
        sessionId: args?.request?.sessionId || `mock-${Date.now()}`,
        webviewLabel: 'romsfun-provider',
        downloadDir: `/tmp/crystal-mock/${args?.request?.sessionId || 'mock'}`,
      };
    }
    if (cmd === 'close_provider_surface' || cmd === 'close_provider_surface_with_app') {
      return args?.sessionId || args?.sessionId;
    }
    return null;
  }
  try {
    const api = await import('@tauri-apps/api/core');
    const invoke = (api as any).invoke;
    return await invoke(cmd, args);
  } catch (e) {
    // fallback window.__TAURI__
    try {
      const w: any = typeof window !== 'undefined' ? (window as any) : null;
      const invoke = w?.__TAURI__?.core?.invoke || w?.__TAURI__?.invoke;
      if (typeof invoke === 'function') return await invoke(cmd, args);
    } catch {}
    throw e;
  }
}

async function importGameSource(sourcePath: string, systemId: string): Promise<any> {
  if (!isTauriEnvironment()) {
    // mock successful import for screenshot QA deterministic fixture
    return {
      status: 'INSTALLED',
      systemId,
      installedPaths: [`C:\\Emulation\\roms\\${systemId}\\${sourcePath.split(/[\\/]/).pop() || 'game.zip'}`],
      detectedFiles: [sourcePath],
      destinationDirectory: `C:\\Emulation\\roms\\${systemId}`,
    };
  }
  const api = await import('@tauri-apps/api/core');
  const invoke = (api as any).invoke;
  return await invoke('import_game_source_async', { request: { systemId, sourcePath } });
}

export function useProviderSurface(opts: UseProviderSurfaceOpts = {}): UseProviderSurfaceReturn {
  const { refreshLibrary, onGameFound, onRefreshComplete } = opts;
  const [state, setState] = useState<ProviderSurfaceState | null>(null);
  const [found, setFound] = useState<GameEntry | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const listenUnsubRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<string | null>(null);

  const phase: ProviderSurfacePhase = state?.phase || 'IDLE';

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    async function attachListener() {
      if (!isTauriEnvironment()) return;
      try {
        const ev = await import('@tauri-apps/api/event');
        const un = await (ev as any).listen('provider-surface-event', (event: any) => {
          if (cancelled) return;
          const payload: TauriEventPayload = event?.payload || event;
          handleEvent(payload);
        });
        unlisten = typeof un === 'function' ? un : () => { try { (un as any)?.(); } catch {} };
        listenUnsubRef.current = unlisten;
      } catch {
        // fallback window event? keep silent
      }
    }

    attachListener();

    return () => {
      cancelled = true;
      if (unlisten) {
        try { unlisten(); } catch {}
      }
      listenUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEvent = useCallback(async (payload: TauriEventPayload) => {
    const type = payload.type;
    const sid = payload.sessionId;
    if (sessionRef.current && sid !== sessionRef.current) return; // ignore stale session events

    switch (type) {
      case 'OPENED':
        setState(prev => prev ? { ...prev, phase: 'BROWSING_PROVIDER', currentUrl: payload.url } : {
          sessionId: sid,
          providerId: payload.providerId,
          systemId: payload.systemId || prev?.systemId || '',
          expectedTitle: payload.expectedTitle || prev?.expectedTitle || '',
          phase: 'BROWSING_PROVIDER',
          currentUrl: payload.url,
        });
        break;

      case 'PAGE_LOADING':
        setState(s => s ? { ...s, phase: s.phase === 'OPENING_PROVIDER' ? 'OPENING_PROVIDER' : 'BROWSING_PROVIDER', currentUrl: payload.url || s.currentUrl } : s);
        break;

      case 'PAGE_READY':
        setState(s => {
          if (!s) return s;
          if (s.phase === 'OPENING_PROVIDER') return { ...s, phase: 'BROWSING_PROVIDER', currentUrl: payload.url || s.currentUrl };
          return { ...s, currentUrl: payload.url || s.currentUrl };
        });
        break;

      case 'NAVIGATED':
        setState(s => s ? { ...s, currentUrl: payload.url || s.currentUrl } : s);
        break;

      case 'EXTERNAL_NAVIGATION_BLOCKED':
        setState(s => s ? {
          ...s,
          phase: 'EXTERNAL_NAVIGATION_BLOCKED',
          providerBlockedUrl: payload.url,
          message: payload.message || 'Crystal blocked an external page.',
          errorCode: 'EXTERNAL_NAVIGATION_BLOCKED',
        } : s);
        // After short delay return to browsing (keep romsfun page alive per spec)
        setTimeout(() => {
          setState(s => s && s.phase === 'EXTERNAL_NAVIGATION_BLOCKED' ? { ...s, phase: 'BROWSING_PROVIDER', message: undefined, errorCode: undefined } : s);
        }, 2400);
        break;

      case 'DOWNLOAD_REQUESTED':
        setState(s => s ? { ...s, phase: 'DOWNLOAD_STARTING', currentUrl: payload.url || s.currentUrl } : s);
        break;

      case 'DOWNLOAD_STARTED':
        setState(s => s ? { ...s, phase: 'DOWNLOADING', message: undefined } : s);
        break;

      case 'DOWNLOAD_REJECTED':
        setState(s => s ? { ...s, phase: 'DOWNLOAD_REJECTED', message: payload.message, errorCode: 'DOWNLOAD_REJECTED' } : s);
        break;

      case 'DOWNLOAD_FAILED':
        setState(s => s ? { ...s, phase: 'DOWNLOAD_FAILED', message: payload.message, errorCode: 'DOWNLOAD_FAILED' } : s);
        setErrorDetail(payload.errorCode || 'DOWNLOAD_FAILED');
        break;

      case 'COMPLETED_LOCAL_FILE':
        {
          const localPath = payload.path;
          if (!localPath) {
            setState(s => s ? { ...s, phase: 'DOWNLOAD_FAILED', message: 'Completed but no local file path', errorCode: 'DOWNLOAD_FAILED' } : s);
            return;
          }
          // Transition to FINALIZING → ADDING → REFRESHING
          setState(s => s ? { ...s, phase: 'FINALIZING_DOWNLOAD', localFilePath: localPath } : s);

          // SAFE MODE check – authoritative: do NOT import when safe mode active
          try {
            const api = await import('@tauri-apps/api/core');
            const safe = await (api as any).invoke('get_safe_mode').catch(() => false);
            if (safe) {
              setState(s => s ? { ...s, phase: 'SAFE_MODE_BLOCKED', message: 'SAFE MODE active – import blocked. Disable SAFE MODE to import.' } : s);
              setErrorDetail('SAFE_MODE_BLOCKED_IMPORT');
              return;
            }
          } catch {
            // If invoke fails to get safe mode, assume false
          }

          setState(s => s ? { ...s, phase: 'ADDING_TO_LIBRARY' } : s);

          try {
            // Try to retrieve systemId from state if payload missing
            const sysId = payload.systemId || state?.systemId || '';
            const expected = payload.expectedTitle || state?.expectedTitle || '';

            const importRes = await importGameSource(localPath, sysId);

            if (!refreshLibrary) {
              setErrorDetail('NO_REFRESH_FN');
              setState(s => s ? { ...s, phase: 'DOWNLOAD_FAILED' } : s);
              return;
            }

            setState(s => s ? { ...s, phase: 'REFRESHING_LIBRARY' } : s);

            const games = await refreshLibrary(sysId);
            onRefreshComplete?.(sysId, games);

            const installedPaths: string[] | undefined = (importRes as any)?.installedPaths;

            const finder = findInstalledGame({
              systemId: sysId,
              expectedTitle: expected,
              installedPaths: installedPaths as any,
              refreshedGames: games as any,
              normalizeTitleFn: normalizeTitleExact,
            } as any);

            if (finder.found) {
              setFound(finder.found as any);
              onGameFound?.(sysId, finder.found as any);
              setState(s => s ? { ...s, phase: 'READY_TO_PLAY', localFilePath: localPath } : s);
              setErrorDetail(null);
            } else {
              setFound(null);
              setErrorDetail('INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH');
              setState(s => s ? { ...s, phase: 'DOWNLOAD_FAILED', message: 'Installed but not found after refresh – exact match authority failed', errorCode: 'INSTALLED_GAME_NOT_FOUND_AFTER_REFRESH', localFilePath: localPath } : s);
            }
          } catch (e: any) {
            const msg = e?.message || String(e);
            if (msg.includes('SAFE_MODE')) {
              setState(s => s ? { ...s, phase: 'SAFE_MODE_BLOCKED', message: msg } : s);
              setErrorDetail('SAFE_MODE_BLOCKED_IMPORT');
            } else {
              setState(s => s ? { ...s, phase: 'DOWNLOAD_FAILED', message: msg, errorCode: 'DOWNLOAD_FAILED' } : s);
              setErrorDetail(msg);
            }
          }
        }
        break;

      case 'CLOSED':
        setState(null);
        sessionRef.current = null;
        setFound(null);
        setErrorDetail(null);
        break;

      case 'PROVIDER_PAGE_FAILED':
        setState(s => s ? { ...s, phase: 'PROVIDER_PAGE_FAILED', message: payload.message, errorCode: 'PROVIDER_PAGE_FAILED' } : s);
        break;

      default:
        // ignore other events but keep logging for QA
        // console.debug('provider-surface unhandled', payload)
        break;
    }
  }, [state?.systemId, state?.expectedTitle, refreshLibrary, onGameFound, onRefreshComplete]);

  const begin = useCallback(async (req: BeginRequest): Promise<string> => {
    // One active surface only
    if (sessionRef.current) {
      const current = state;
      if (current && !['READY_TO_PLAY','CANCELLED','DOWNLOAD_FAILED','PROVIDER_PAGE_FAILED','DOWNLOAD_REJECTED','SAFE_MODE_BLOCKED'].includes(current.phase)) {
        throw new Error('PROVIDER_SURFACE_ALREADY_ACTIVE');
      }
    }

    setFound(null);
    setErrorDetail(null);

    const sessionId = `ps-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    setState({
      sessionId,
      providerId: 'romsfun',
      systemId: req.systemId,
      expectedTitle: req.expectedTitle,
      phase: 'OPENING_PROVIDER',
      currentUrl: req.initialUrl,
    });
    sessionRef.current = sessionId;

    try {
      const result = await tauriInvoke('create_provider_surface', {
        request: {
          sessionId,
          providerId: 'romsfun',
          initialUrl: req.initialUrl,
          systemId: req.systemId,
          expectedTitle: req.expectedTitle,
        }
      });
      // result may contain confirmed sessionId
      const confirmedId = result?.sessionId || sessionId;
      sessionRef.current = confirmedId;
      setState(s => s ? { ...s, sessionId: confirmedId } : s);
      return confirmedId;
    } catch (e: any) {
      setState(s => s ? { ...s, phase: 'PROVIDER_PAGE_FAILED', message: e?.message || String(e), errorCode: 'PROVIDER_PAGE_FAILED' } : s);
      setErrorDetail(e?.message || String(e));
      sessionRef.current = null;
      throw e;
    }
  }, [state]);

  const cancel = useCallback(async () => {
    const sid = sessionRef.current || state?.sessionId;
    if (!sid) return;

    setState(s => s ? { ...s, phase: 'CANCELLED' } : s);

    try {
      if (isTauriEnvironment()) {
        // Prefer close with AppHandle variant which also closes webview and aborts download
        await tauriInvoke('close_provider_surface_with_app', { sessionId: sid }).catch(async () => {
          await tauriInvoke('close_provider_surface', { sessionId: sid });
        });
      } else {
        await tauriInvoke('close_provider_surface', { sessionId: sid });
      }
    } catch {
      // ignore – cleanup best effort
    }

    setState(null);
    sessionRef.current = null;
    setFound(null);
    setErrorDetail(null);
  }, [state]);

  const close = useCallback(async () => {
    const sid = sessionRef.current || state?.sessionId;
    if (!sid) {
      setState(null);
      sessionRef.current = null;
      return;
    }
    try {
      if (isTauriEnvironment()) {
        await tauriInvoke('close_provider_surface_with_app', { sessionId: sid }).catch(async () => {
          await tauriInvoke('close_provider_surface', { sessionId: sid });
        });
      } else {
        await tauriInvoke('close_provider_surface', { sessionId: sid });
      }
    } catch {}
    setState(null);
    sessionRef.current = null;
    setFound(null);
    setErrorDetail(null);
  }, [state]);

  // The provider download directory is session-owned and is removed by close.
  // Once the installed game has been refreshed and selected, dismiss the
  // provider surface automatically instead of trapping the user on READY.
  useEffect(() => {
    if (phase !== 'READY_TO_PLAY' || !found) return;
    const timer = window.setTimeout(() => { void close(); }, 1100);
    return () => window.clearTimeout(timer);
  }, [phase, found, close]);

  // Controller minimal B/Back recovery – document ROG need: ensure Discover list input underneath blocked while provider surface active
  // Safe focus enter/exit – frontend should prevent accidental A PLAY while surface active

  const phaseMemo = useMemo(() => phase, [phase]);

  return {
    active: !!state,
    phase: phaseMemo,
    state,
    foundGame: found,
    errorDetail,
    begin,
    cancel,
    close,
  };
}

export default useProviderSurface;
