/**
 * Crash reporter – captures JS crashes, semantic input, route context, sanitizes ROM paths.
 * Sends to Rust backend for bounded <4KB JSON next to D:\CrystalFrontend\logs\crystal-frontend-crash-<date>.json
 */

export type CrashReport = {
  timestamp: string
  route: string
  systemId: string | null
  lastSemanticInput: string | null
  jsError: {
    message: string
    stack?: string
    source?: string
    lineno?: number
    colno?: number
  } | null
  reactComponentStack?: string
  romBasenameOnly?: string
  url: string
  userAgent: string
  // trimmed to <4KB total
}

let lastSemanticInput: string | null = null
let currentRoute: string = 'systems'
let currentSystemId: string | null = null

export function setCrashContext(route: string, systemId: string | null) {
  currentRoute = route
  currentSystemId = systemId
}

export function recordSemanticInput(input: string) {
  lastSemanticInput = input.slice(0, 256)
}

function sanitizeRomPath(romPath: string | null): string | undefined {
  if (!romPath) return undefined
  try {
    const parts = romPath.split(/[\\/]/)
    return parts[parts.length - 1].slice(0, 128)
  } catch {
    return 'unknown'
  }
}

function boundSize<T>(obj: T): T {
  const json = JSON.stringify(obj)
  if (json.length <= 3800) return obj
  // Trim stack to fit <4KB
  const anyObj = obj as any
  if (anyObj.jsError?.stack) {
    anyObj.jsError.stack = anyObj.jsError.stack.slice(0, 800)
  }
  if (anyObj.reactComponentStack) {
    anyObj.reactComponentStack = anyObj.reactComponentStack.slice(0, 600)
  }
  const second = JSON.stringify(anyObj)
  if (second.length <= 3800) return anyObj
  // Final harsh trim
  anyObj.jsError = anyObj.jsError ? { message: (anyObj.jsError.message || '').slice(0, 200) } : null
  anyObj.reactComponentStack = undefined
  return anyObj
}

export async function writeCrashReport(e: {
  message: string
  stack?: string
  source?: string
  lineno?: number
  colno?: number
  reactStack?: string
  romPath?: string | null
}): Promise<void> {
  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    route: currentRoute,
    systemId: currentSystemId,
    lastSemanticInput,
    jsError: {
      message: e.message.slice(0, 500),
      stack: (e.stack || '').slice(0, 1500),
      source: e.source,
      lineno: e.lineno,
      colno: e.colno,
    },
    reactComponentStack: (e.reactStack || '').slice(0, 800),
    romBasenameOnly: sanitizeRomPath(e.romPath || null),
    url: window.location.href.slice(0, 512),
    userAgent: navigator.userAgent.slice(0, 256),
  }
  const bounded = boundSize(report)
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('write_crash_report', { report: bounded })
  } catch (err) {
    // fallback to console + localStorage bounded buffer if backend unavailable (e.g. web)
    console.error('[crystal-crash]', bounded, err)
    try {
      localStorage.setItem('crystal-last-crash', JSON.stringify(bounded).slice(0, 3800))
    } catch {}
  }
}

export function setupCrashHandlers() {
  const onError = (ev: ErrorEvent) => {
    void writeCrashReport({
      message: ev.message,
      stack: (ev.error && (ev.error as any).stack) || '',
      source: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    })
  }
  const onUnhandled = (ev: PromiseRejectionEvent) => {
    void writeCrashReport({
      message: String(ev.reason),
      stack: (ev.reason && (ev.reason as any).stack) || '',
    })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandled)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandled)
  }
}
