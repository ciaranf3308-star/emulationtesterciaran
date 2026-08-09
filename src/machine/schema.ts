/**
 * Runtime type guards / schema-like validation (manual, no zod dependency)
 * Provides `isMachineConfig` and granular guards used by validation.ts and loader.ts
 */
import type {
  MachineConfig,
  MachineRoots,
  MachineSystem,
  SystemCommand,
  FindRule,
  FindRuleEntry,
  SystemIdentifiers,
  LaunchSelection,
  MediaAvailability,
  MediaCategory,
  MetadataAvailability,
  ValidationError,
  FindRuleEntryType,
  PerGameOverride,
} from './types';
import { SUPPORTED_SCHEMA_VERSIONS } from './types';

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null && !Array.isArray(u);
}

function isNonEmptyString(u: unknown): u is string {
  return typeof u === 'string' && u.length > 0;
}

function isStringArray(u: unknown): u is string[] {
  return Array.isArray(u) && u.every(v => typeof v === 'string');
}

function isStringOrNull(u: unknown): u is string | null {
  return typeof u === 'string' || u === null;
}

export function isFindRuleEntryType(u: unknown): u is FindRuleEntryType {
  if (typeof u !== 'string') return false;
  // allowed known literals, plus any non-empty string for forward compat
  return u.length > 0;
}

export function isFindRuleEntry(u: unknown): u is FindRuleEntry {
  if (!isRecord(u)) return false;
  if (!Array.isArray(u.entries)) return false;
  if (!u.entries.every(e => typeof e === 'string')) return false;
  if (u.entries.length === 0) return false;
  if (!isFindRuleEntryType(u.type)) return false;
  return true;
}

export function isFindRule(u: unknown): u is FindRule {
  if (!isRecord(u)) return false;
  if (!isNonEmptyString(u.identifier)) return false;
  if (u.kind !== 'emulator' && u.kind !== 'core') return false;
  if (!Array.isArray(u.rules) || u.rules.length === 0) return false;
  if (!u.rules.every(isFindRuleEntry)) return false;
  if (!isNonEmptyString(u.source)) return false;
  return true;
}

export function isSystemIdentifiers(u: unknown): u is SystemIdentifiers {
  if (!isRecord(u)) return false;
  if (!isStringArray(u.coreFiles)) return false;
  if (!isStringArray(u.corePathIdentifiers)) return false;
  if (!isStringArray(u.emulatorIdentifiers)) return false;
  return true;
}

export function isSystemCommand(u: unknown): u is SystemCommand {
  if (!isRecord(u)) return false;
  if (!isNonEmptyString(u.label)) return false;
  if (typeof u.template !== 'string') return false;
  if (!isStringOrNull(u.workingDirectoryTemplate)) return false;
  if (typeof u.isFirstConfiguredCommand !== 'boolean') return false;
  if (!Array.isArray(u.findRules)) return false;
  if (!u.findRules.every(isFindRule)) return false;
  if (!isSystemIdentifiers(u.identifiers)) return false;
  return true;
}

export function isPerGameOverride(u: unknown): u is PerGameOverride {
  return isRecord(u);
}

export function isLaunchSelection(u: unknown): u is LaunchSelection {
  if (!isRecord(u)) return false;
  if (!isNonEmptyString(u.selectedLabel)) return false;
  if (typeof u.rule !== 'string') return false;
  if (typeof u.status !== 'string') return false;
  if (typeof u.source !== 'string') return false;
  // systemAlternativeLabel nullable
  if (!(typeof u.systemAlternativeLabel === 'string' || u.systemAlternativeLabel === null)) return false;
  if (typeof u.perGameOverrideCount !== 'number') return false;
  if (!Array.isArray(u.perGameOverrides)) return false;
  // perGameOverrides items are records (unknown extensible)
  if (!u.perGameOverrides.every(isPerGameOverride)) return false;
  return true;
}

export function isMediaCategory(u: unknown): u is MediaCategory {
  if (!isRecord(u)) return false;
  if (typeof u.directory !== 'string') return false;
  if (typeof u.exists !== 'boolean') return false;
  if (typeof u.fileCount !== 'number' || !Number.isFinite(u.fileCount)) return false;
  if (typeof u.directRomBasenameMatches !== 'number' || !Number.isFinite(u.directRomBasenameMatches)) return false;
  if (typeof u.nonDirectBasenameCount !== 'number' || !Number.isFinite(u.nonDirectBasenameCount)) return false;
  if (typeof u.filenamePattern !== 'string') return false;
  if (!Array.isArray(u.exceptionSamples) || !u.exceptionSamples.every(e => typeof e === 'string')) return false;
  return true;
}

export function isMediaAvailability(u: unknown): u is MediaAvailability {
  if (!isRecord(u)) return false;
  for (const [, v] of Object.entries(u)) {
    if (v === undefined) continue;
    if (!isMediaCategory(v)) return false;
  }
  return true;
}

export function isMetadataAvailability(u: unknown): u is MetadataAvailability {
  if (!isRecord(u)) return false;
  if (typeof u.exists !== 'boolean') return false;
  if (typeof u.favorites !== 'number') return false;
  if (typeof u.gameEntries !== 'number') return false;
  if (typeof u.gamelistPath !== 'string') return false;
  if (typeof u.entriesWithPlayCount !== 'number') return false;
  if (typeof u.entriesWithLastPlayed !== 'number') return false;
  if (typeof u.fields !== 'string') return false;
  return true;
}

export function isMachineRoots(u: unknown): u is MachineRoots {
  if (!isRecord(u)) return false;
  if (typeof u.gamelists !== 'string') return false;
  if (typeof u.rom !== 'string') return false;
  if (typeof u.scrapedMedia !== 'string') return false;
  return true;
}

export function isMachineSystem(u: unknown): u is MachineSystem {
  if (!isRecord(u)) return false;
  if (!isNonEmptyString(u.id)) return false;
  if (typeof u.fullName !== 'string') return false;
  if (typeof u.configSource !== 'string') return false;
  if (typeof u.configOrigin !== 'string') return false;
  if (typeof u.romDirectory !== 'string') return false;
  if (typeof u.extensionString !== 'string') return false;
  if (!isStringArray(u.validExtensions)) return false;
  if (typeof u.matchingRomFileCount !== 'number') return false;
  if (!Array.isArray(u.commands) || !u.commands.every(isSystemCommand)) return false;
  if (!isLaunchSelection(u.launchSelection)) return false;
  if (!isMediaAvailability(u.media)) return false;
  if (!isMetadataAvailability(u.metadata)) return false;
  return true;
}

export function isMachineConfig(u: unknown): u is MachineConfig {
  if (!isRecord(u)) return false;
  if (typeof u.schemaVersion !== 'number') return false;
  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(u.schemaVersion)) return false;
  if (typeof u.populatedSystemCount !== 'number') return false;
  if (!isMachineRoots(u.roots)) return false;
  if (!Array.isArray(u.systems)) return false;
  if (!u.systems.every(isMachineSystem)) return false;
  if (typeof u.generatedAt !== 'string') return false;
  if (!isRecord(u.authoritativeFiles)) return false;
  // authoritativeFiles values must be strings
  for (const v of Object.values(u.authoritativeFiles)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

/**
 * Lightweight structural parse – throws if invalid, with aggregated ValidationError list.
 * Prefer validation.ts for detailed path-aware errors; this is a quick guard.
 */
export function parseMachineConfig(u: unknown): MachineConfig {
  if (isMachineConfig(u)) return u;
  // provide minimal diagnostics
  const errors: ValidationError[] = [];
  if (!isRecord(u)) {
    errors.push({ path: '$', message: 'expected object' });
  } else {
    if (typeof u.schemaVersion !== 'number') errors.push({ path: '$.schemaVersion', message: 'must be number' });
    if (typeof u.populatedSystemCount !== 'number') errors.push({ path: '$.populatedSystemCount', message: 'must be number' });
    if (!isMachineRoots(u.roots)) errors.push({ path: '$.roots', message: 'invalid roots' });
    if (!Array.isArray(u.systems)) errors.push({ path: '$.systems', message: 'must be array' });
    if (typeof u.generatedAt !== 'string') errors.push({ path: '$.generatedAt', message: 'must be string' });
  }
  const err = new Error(`Invalid MachineConfig: ${errors.map(e => `${e.path} ${e.message}`).join('; ') || 'structure mismatch'}`);
  // attach errors for loader consumption
  (err as unknown as { validationErrors: ValidationError[] }).validationErrors = errors;
  throw err;
}

export const guards = {
  isRecord,
  isNonEmptyString,
  isStringArray,
  isFindRule,
  isFindRuleEntry,
  isSystemCommand,
  isMachineSystem,
  isMachineConfig,
};
