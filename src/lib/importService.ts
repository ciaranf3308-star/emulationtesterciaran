/**
 * V8.6A local import shim – thin wrapper over Tauri Rust command import_game_source
 * No Discovery/Vimm logic, no arbitrary destination.
 * Frontend only provides systemId + sourcePath.
 */
import { isTauriEnvironment } from '../runtime/environment';
import { getTauriInvoker } from '../runtime/tauri';

export type ImportRequest = {
  systemId: string;
  sourcePath: string;
  expectedTitle?: string;
};

export type ImportStatus =
  | 'INSTALLED'
  | 'ALREADY_INSTALLED'
  | 'COLLISION'
  | 'AMBIGUOUS'
  | 'AMBIGUOUS_MULTIPLE_ROMS'
  | 'AMBIGUOUS_MULTIPLE_CUE'
  | 'INVALID_EXTENSION'
  | 'NO_VALID_ROM_IN_ARCHIVE'
  | 'INCOMPLETE_CUE_SET'
  | 'EMPTY_ARCHIVE'
  | 'SAFE_MODE_BLOCKED_IMPORT'
  | 'UNKNOWN_SYSTEM'
  | 'FAILED';

export type ImportResult = {
  status: ImportStatus;
  systemId: string;
  installedPaths: string[];
  detectedFiles: string[];
  destinationDirectory: string;
  collisionPaths: string[];
  errorCode?: string;
  message?: string;
};

export async function importGameSource(req: ImportRequest): Promise<ImportResult> {
  if (!isTauriEnvironment()) {
    throw new Error('import_game_source only available in Tauri environment');
  }
  const invoke = await getTauriInvoker();
  if (typeof invoke !== 'function' || invoke === null) {
    throw new Error('Tauri invoke not available');
  }
  const result = (await invoke('import_game_source', { request: req })) as ImportResult;
  return result;
}

export const ImportService = {
  importGame: importGameSource,
};
