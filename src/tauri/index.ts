/**
 * Tauri compatibility shim – V3/V4.
 * No legacy Desktop / EmuDeckBridge logic.
 * Re-exports canonical runtime + launcher bridge for backward-compatible imports.
 *
 * Legacy imports like:
 *   import { isTauri } from '../tauri'
 * should now resolve to canonical detection.
 */

export { isTauriEnvironment, isTauriEnvironment as isTauri, getRuntime, isBrowserDev, isTestEnv } from '../runtime/environment'
export type { Runtime } from '../runtime/environment'

export { getTauriInvoker, getTauriApi, getTauriInvokerSync } from '../runtime/tauri'
export type { TauriInvokeFn } from '../runtime/tauri'

export { getLauncherBridge, launchGame, __setLauncherBridgeForTests } from '../launcher/bridge'
export type { LauncherBridge } from '../launcher/types'

// Intentionally does NOT re-export:
// - legacy default emulation root helper / EmuDeck paths
// - legacy rom scan helper / legacy legacyLaunchSignature(systemIdLegacy, romPath)
// - Desktop legacy object
