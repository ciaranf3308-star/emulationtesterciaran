import type { LaunchBackendRequest, LauncherBridge } from './types'
import { isTauriEnvironment } from '../runtime/environment'
import { getTauriInvokerSync, type TauriInvokeFn } from '../runtime/tauri'

// Re-export canonical detection for consumers that previously imported from bridge
export { isTauriEnvironment as isTauri }

type LocalInvoker = TauriInvokeFn

function resolveInvoker(): LocalInvoker | null {
  return getTauriInvokerSync()
}

function getInvokerSafe(): LocalInvoker | null {
  return resolveInvoker()
}

// Backward compat export – async variant delegates to canonical runtime
export async function getTauriInvokerAsync(): Promise<LocalInvoker | null> {
  const { getTauriInvoker } = await import('../runtime/tauri')
  return getTauriInvoker()
}

// Sync accessor required by launcher internals – safe, no throw on window undefined
export function getTauriInvoker(): LocalInvoker | null {
  return getInvokerSafe()
}

function isTauri(): boolean {
  // Use canonical detection; also ensure invoker present for launch capability
  return isTauriEnvironment() && getInvokerSafe() !== null
}

export { isTauri as isTauriEnvironmentCheck }

class BrowserMockBridge implements LauncherBridge {
  async launch(request: LaunchBackendRequest): Promise<void> {
    console.warn('[Launcher] Browser simulated launch blocked – real launch requires Tauri desktop build.')
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
  private invokeFn: LocalInvoker

  constructor(invokeFn: LocalInvoker) {
    this.invokeFn = invokeFn
  }

  async launch(request: LaunchBackendRequest): Promise<void> {
    // V6 aligned: Rust expects single arg `request: LaunchBackendRequest`
    // Compatible fallback: send {request} – Tauri v2 will map to named arg.
    await this.invokeFn('launch_game', { request })
    // If backend expects flattened earlier versions, we have already covered via generic
    // secondary attempt would be handled server-side; no double-launch.
  }
}

let cachedBridge: LauncherBridge | null = null

export function getLauncherBridge(): LauncherBridge {
  if (cachedBridge) return cachedBridge
  const invoker = getInvokerSafe()
  if (invoker && isTauri()) {
    cachedBridge = new TauriBridge(invoker)
  } else if (invoker && isTauriEnvironment()) {
    // Edge: invoker present but detection earlier returned false due to timing – still use Tauri bridge
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
