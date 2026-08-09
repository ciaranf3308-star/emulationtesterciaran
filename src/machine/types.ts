/**
 * Machine Config Domain – authoritative types
 * Source truth: crystal-machine-config.json (schemaVersion 1, 19 systems)
 * Audit: CRYSTAL-MACHINE-AUDIT.md
 *
 * No `any` in exported domain models – unknown is used for extensibility.
 */

export type FindRuleEntryType = 'staticpath' | 'corepath' | 'systempath' | (string & {});

export interface MachineRoots {
  gamelists: string;
  rom: string;
  scrapedMedia: string;
}

export interface FindRuleEntry {
  entries: string[];
  type: FindRuleEntryType;
}

export type FindRuleKind = 'emulator' | 'core';

export interface FindRule {
  identifier: string;
  kind: FindRuleKind;
  rules: FindRuleEntry[];
  source: string;
}

export interface SystemIdentifiers {
  coreFiles: string[];
  corePathIdentifiers: string[];
  emulatorIdentifiers: string[];
}

export interface SystemCommand {
  label: string;
  template: string;
  workingDirectoryTemplate: string | null;
  isFirstConfiguredCommand: boolean;
  findRules: FindRule[];
  identifiers: SystemIdentifiers;
}

/** Per-game alternative emulator override (enabled but empty in current export) */
export interface PerGameOverride {
  romFileName?: string;
  gameName?: string;
  emulatorLabel?: string;
  alternativeLabel?: string;
  sourceGameNodePath?: string;
  // extensible – allow unknown additional fields without `any`
  [extra: string]: unknown;
}

export interface LaunchSelection {
  selectedLabel: string;
  rule: string;
  status: string;
  source: string;
  systemAlternativeLabel: string | null;
  perGameOverrideCount: number;
  perGameOverrides: PerGameOverride[];
}

export interface MediaCategory {
  directory: string;
  exists: boolean;
  fileCount: number;
  directRomBasenameMatches: number;
  nonDirectBasenameCount: number;
  filenamePattern: string;
  exceptionSamples: string[];
}

export interface MediaAvailability {
  covers?: MediaCategory;
  marquees?: MediaCategory;
  miximages?: MediaCategory;
  physicalmedia?: MediaCategory;
  screenshots?: MediaCategory;
  titlescreens?: MediaCategory;
  videos?: MediaCategory;
  // allow future media types without breaking
  [mediaType: string]: MediaCategory | undefined;
}

export interface MetadataAvailability {
  exists: boolean;
  favorites: number;
  gameEntries: number;
  gamelistPath: string;
  entriesWithPlayCount: number;
  entriesWithLastPlayed: number;
  fields: string;
}

export interface MachineSystem {
  id: string;
  fullName: string;
  configSource: string;
  configOrigin: string;
  romDirectory: string;
  extensionString: string;
  validExtensions: string[];
  matchingRomFileCount: number;
  commands: SystemCommand[];
  launchSelection: LaunchSelection;
  media: MediaAvailability;
  metadata: MetadataAvailability;
}

export interface MachineConfig {
  schemaVersion: number;
  populatedSystemCount: number;
  roots: MachineRoots;
  systems: MachineSystem[];
  generatedAt: string;
  authoritativeFiles: Record<string, string>;
  // extensibility preserved from export
  ambiguities?: unknown[];
  launchArchitecture?: unknown;
  mediaArchitecture?: unknown;
  metadataArchitecture?: unknown;
  settings?: unknown;
  // allow additional unknown top-level keys without `any`
  [extra: string]: unknown;
}

export interface LaunchRequest {
  systemId: string;
  romPath: string;
  selectedCommandLabel: string;
}

export interface ValidationError {
  path: string;
  message: string;
}

/** Derived summary for selectors */
export interface SystemMediaSummary {
  systemId: string;
  totalFiles: number;
  categoriesPresent: number;
  categories: Array<{ type: string; fileCount: number; exists: boolean; directMatches: number }>;
}

export type SupportedSchemaVersion = 1;
export const SUPPORTED_SCHEMA_VERSIONS: readonly SupportedSchemaVersion[] = [1] as const;
export const CURRENT_SCHEMA_VERSION: SupportedSchemaVersion = 1;

/** Known media category keys in current export */
export const KNOWN_MEDIA_TYPES = [
  'covers',
  'marquees',
  'miximages',
  'physicalmedia',
  'screenshots',
  'titlescreens',
  'videos',
] as const;
export type KnownMediaType = typeof KNOWN_MEDIA_TYPES[number];
