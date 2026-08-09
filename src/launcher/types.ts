/**
 * Launcher Domain — CRITICAL architecture
 * Truth source: /home/hatch/workspace/crystal-machine-config.json
 *
 * Frontend semantic request + backend contract.
 * Backend owns placeholder expansion and find-rule resolution.
 * No legacy emulator map constant (removed), no hardcoded paths, no any.
 */

import type { FindRule } from '../machine/types'

// ---------------------------------------------------------------------------
// Placeholder names
// ---------------------------------------------------------------------------

export type PlaceholderName =
  | '%ROM%'
  | '%ROM_RAW%'
  | '%BASENAME%'
  | '%GAMEDIR%'
  | '%ROMPATH%'
  | '%EMUDIR%'
  | '%EMUPATH%'
  | '%ESPATH%'
  | '%STARTDIR%'
  | '%INJECT%'
  | '%HIDEWINDOW%'
  | '%ESCAPESPECIALS%'
  | '%RUNINBACKGROUND%'
  | `%EMULATOR_${string}%`
  | `%CORE_${string}%`
  | (string & {});

// ---------------------------------------------------------------------------
// Frontend request
// ---------------------------------------------------------------------------

export interface LaunchRequest {
  /** system id must match MachineConfig.systems[].id */
  systemId: string;
  /** absolute Windows-style ROM path (e.g. D:\Emulation\roms\ps2\Game.iso) */
  romPath: string;
  /** label override – if empty we fall back to system's launchSelection.selectedLabel */
  selectedCommandLabel: string;
}

// ---------------------------------------------------------------------------
// Backend contract – no substitution here
// ---------------------------------------------------------------------------

export interface LaunchBackendRequest {
  systemId: string;
  systemFullName: string;
  romPath: string;
  romBasename: string;
  romDirectory: string;
  commandLabel: string;
  commandTemplate: string;
  workingDirectoryTemplate: string | null;
  isFirstConfiguredCommand: boolean;
  emulatorFindRules: FindRule[];
  coreFindRules: FindRule[];
  emulatorIdentifiers: string[];
  coreFiles: string[];
  corePathIdentifiers: string[];
  /** raw identifiers block preserved for backend */
  identifiers: {
    emulatorIdentifiers: string[];
    coreFiles: string[];
    corePathIdentifiers: string[];
  };
  /** all findRules verbatim (preserves Xbox/Xbox360 unusual structures) */
  findRules: FindRule[];
  /** static rom-derived placeholders – backend expands emulator/core via findRules */
  placeholders: Record<string, string>;
  /** list of placeholder tokens observed in template (e.g. %EMULATOR_XEMU%) */
  placeholdersPresent: string[];
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export type LaunchResolution =
  | { ok: true; backendRequest: LaunchBackendRequest }
  | { ok: false; reason: string; unsupported?: string; systemId?: string };

export const KNOWN_EXACT_PLACEHOLDERS = [
  '%ROM%',
  '%ROM_RAW%',
  '%BASENAME%',
  '%GAMEDIR%',
  '%ROMPATH%',
  '%EMUDIR%',
  '%EMUPATH%',
  '%ESPATH%',
  '%STARTDIR%',
  '%INJECT%',
  '%HIDEWINDOW%',
  '%ESCAPESPECIALS%',
  '%RUNINBACKGROUND%',
] as const;

export interface LauncherBridge {
  launch(request: LaunchBackendRequest): Promise<void>;
}
