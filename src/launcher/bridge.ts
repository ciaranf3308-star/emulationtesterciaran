import type { LaunchBackendRequest, LauncherBridge } from './types'

type TauriInvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface TauriCore {
  invoke: TauriInvokeFn
}

interface TauriGlobal {
  __TAURI__?: {
    core?: TauriCore
    invoke?: TauriInvokeFn
    tauri?: TauriCore
  }
}

declare global {
  interface Window extends TauriGlobal {}
}

function getTauriInvoker(): TauriInvokeFn | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as TauriGlobal
  const api = w.__TAURI__
  if (!api) return null
  if (api.core?.invoke) return api.core.invoke
  if (api.invoke) return api.invoke
  if (api.tauri?.invoke) return api.tauri.invoke
  return null
}

function isTauri(): boolean {
  return getTauriInvoker() !== null
}

export { isTauri, getTauriInvoker }

class BrowserMockBridge implements LauncherBridge {
  async launch(request: LaunchBackendRequest): Promise<void> {
    console.warn('[Launcher] Browser mock launch blocked – real launch requires Tauri desktop build.')
    console.info('[Launcher] Would launch', {
      systemId: request.systemId,
      systemFullName: request.systemFullName,
      commandLabel: request.commandLabel,
      commandTemplate: request.commandTemplate,
      workingDirectoryTemplate: request.workingDirectoryTemplate,
      romPath: request.romPath,
      romBasename: request.romBasename,
      romDirectory: request.romDirectory,
      emulatorIdentifiers: request.emulatorIdentifiers,
      coreFiles: request.coreFiles,
      corePathIdentifiers: request.corePathIdentifiers,
      findRules: request.findRules,
      emulatorFindRules: request.emulatorFindRules,
      coreFindRules: request.coreFindRules,
      placeholders: request.placeholders,
      placeholdersPresent: request.placeholdersPresent,
      isFirstConfiguredCommand: request.isFirstConfiguredCommand,
    })
    throw new Error(
      `Launch blocked in browser: system="${request.systemId}" rom="${request.romPath}" label="${request.commandLabel}". Real launch requires Tauri desktop shell with EmuDeck path configured.`
    )
  }
}

class TauriBridge implements LauncherBridge {
  private invokeFn: TauriInvokeFn

  constructor(invokeFn: TauriInvokeFn) {
    this.invokeFn = invokeFn
  }

  async launch(request: LaunchBackendRequest): Promise<void> {
    await this.invokeFn('launch_game', {
      systemId: request.systemId,
      systemFullName: request.systemFullName,
      romPath: request.romPath,
      romBasename: request.romBasename,
      romDirectory: request.romDirectory,
      commandLabel: request.commandLabel,
      commandTemplate: request.commandTemplate,
      workingDirectoryTemplate: request.workingDirectoryTemplate,
      isFirstConfiguredCommand: request.isFirstConfiguredCommand,
      emulatorFindRules: request.emulatorFindRules,
      coreFindRules: request.coreFindRules,
      emulatorIdentifiers: request.emulatorIdentifiers,
      coreFiles: request.coreFiles,
      corePathIdentifiers: request.corePathIdentifiers,
      identifiers: request.identifiers,
      findRules: request.findRules,
      placeholders: request.placeholders,
      placeholdersPresent: request.placeholdersPresent,
      backendRequest: request,
      request,
    })
  }
}

let cachedBridge: LauncherBridge | null = null

export function getLauncherBridge(): LauncherBridge {
  if (cachedBridge) return cachedBridge
  const invoker = getTauriInvoker()
  if (invoker && isTauri()) {
    cachedBridge = new TauriBridge(invoker)
  } else {
    cachedBridge = new BrowserMockBridge()
  }
  return cachedBridge
}

export function __setLauncherBridgeForTests(bridge: LauncherBridge | null): void {
  cachedBridge = bridge
}

export async function launchGame(request: LaunchBackendRequest): Promise<void> {
  const bridge = getLauncherBridge()
  return bridge.launch(request)
}
