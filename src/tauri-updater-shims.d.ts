/**
 * Ambient module declarations for Tauri v2 updater integration – V8.3.1
 * Allows `tsc -b` to pass even when @tauri-apps/* npm packages not installed in CI offline.
 * Real desktop builds have these packages; browser dev tolerates fallback invoke stubs.
 */
declare module '@tauri-apps/api/core' {
  export function invoke<T = any>(cmd: string, args?: any): Promise<T>
  const _default: any
  export default _default
}

declare module '@tauri-apps/plugin-updater' {
  export type DownloadEvent =
    | { event: 'Started'; data: { contentLength?: number } }
    | { event: 'Progress'; data: { chunkLength: number; contentLength?: number } }
    | { event: 'Finished' }
  export type Update = {
    version: string
    currentVersion: string
    date?: string
    body?: string
    shouldUpdate?: boolean
    downloadAndInstall: (onEvent?: (e: DownloadEvent) => void) => Promise<void>
    download: (onEvent?: (e: DownloadEvent) => void) => Promise<void>
    install: () => Promise<void>
  }
  export function check(): Promise<Update | null>

  const _default: any
  export default _default
}
