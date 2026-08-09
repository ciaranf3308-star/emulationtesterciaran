/**
 * Validation – domain rules for crystal-machine-config.json
 * Returns ok:true with typed config or ok:false with ValidationError[]
 * No throws (except for programmer misuse).
 */
import type {
  MachineConfig,
  MachineSystem,
  MediaCategory,
  ValidationError,
} from './types';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './types';

function push(errors: ValidationError[], path: string, message: string) {
  errors.push({ path, message });
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null && !Array.isArray(u);
}

function isNonEmptyString(u: unknown): u is string {
  return typeof u === 'string' && u.length > 0;
}

function validateRoots(roots: unknown, errors: ValidationError[]) {
  if (!isRecord(roots)) {
    push(errors, '$.roots', 'must be object with gamelists, rom, scrapedMedia');
    return;
  }
  for (const k of ['gamelists', 'rom', 'scrapedMedia'] as const) {
    const v = (roots as Record<string, unknown>)[k];
    if (typeof v !== 'string' || v.length === 0) {
      push(errors, `$.roots.${k}`, `must be non-empty string`);
    }
  }
}

/**
 * ROM directory representation rule (V3 tolerant):
 * - must be non-empty string
 * - must be Windows absolute like D:\... or D:/... (drive letter + colon + slash/backslash)
 * - rejects relative paths like "roms" / "ps2"
 * - rejects empty, "D:", ":\Emulation", etc.
 * We avoid hardcoding "default Windows emulation root (hardcoded path)" as default per spec.
 * Exported for unit-testing.
 */
export function isValidRomDirectory(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  if (!s) return false;
  if (s.trim().length === 0) return false;
  // Tolerant Windows absolute: case-insensitive drive letter + colon + slash OR backslash
  // e.g. D:\Emulation\roms\ps2  or  D:/Emulation/roms/ps2
  if (!/^[A-Za-z]:[\\/]/.test(s)) return false;
  // Must be more than just "D:" – regex already ensures slash exists,
  // but reject lone root with no name? D:\ and D:/ are acceptable as roots (minimal absolute).
  // ":\Emulation" fails because no drive letter; "D:" fails because no slash.
  if (s.length < 3) return false;
  // Disallow obvious malformed where drive is followed by slash but immediate end is okay;
  // we already allow that, but to be safe ensure not just "D:\ " (trim already).
  return true;
}

/** Back-compat: keep internal alias if other files import via validation internals */
// (isValidRomDirectory is now exported)

function validateMediaCategory(
  cat: unknown,
  path: string,
  systemId: string,
  errors: ValidationError[],
) {
  if (cat === undefined) return; // optional categories
  if (!isRecord(cat)) {
    push(errors, path, 'media category must be object');
    return;
  }
  const c = cat as Partial<MediaCategory>;
  if (typeof c.directory !== 'string') {
    push(errors, `${path}.directory`, 'must be string');
  } else {
    if (c.directory.length === 0) push(errors, `${path}.directory`, 'must be non-empty');
    // must contain system id substring (case-insensitive)
    if (systemId && !c.directory.toLowerCase().includes(systemId.toLowerCase())) {
      // per audit media pattern is <root>/<system>/<type>; enforce contains system id
      push(errors, `${path}.directory`, `must contain system id "${systemId}" – got "${c.directory}"`);
    }
  }
  if (typeof c.exists !== 'boolean') {
    push(errors, `${path}.exists`, 'must be boolean');
  }
  if (typeof c.fileCount !== 'number' || !Number.isFinite(c.fileCount) || c.fileCount < 0) {
    push(errors, `${path}.fileCount`, 'must be finite >=0');
  }
  if (typeof c.directRomBasenameMatches !== 'number' || !Number.isFinite(c.directRomBasenameMatches) || c.directRomBasenameMatches < 0) {
    push(errors, `${path}.directRomBasenameMatches`, 'must be finite >=0');
  }
  if (typeof c.nonDirectBasenameCount !== 'number' || !Number.isFinite(c.nonDirectBasenameCount) || c.nonDirectBasenameCount < 0) {
    push(errors, `${path}.nonDirectBasenameCount`, 'must be finite >=0');
  }
  if (typeof c.filenamePattern !== 'string') {
    push(errors, `${path}.filenamePattern`, 'must be string');
  }
  if (!Array.isArray(c.exceptionSamples) || !c.exceptionSamples.every(s => typeof s === 'string')) {
    push(errors, `${path}.exceptionSamples`, 'must be string[]');
  }
}

function validateFindRules(system: MachineSystem, sysIndex: number, errors: ValidationError[]) {
  system.commands.forEach((cmd, cmdIdx) => {
    const base = `$.systems[${sysIndex}].commands[${cmdIdx}]`;
    if (!Array.isArray(cmd.findRules)) {
      push(errors, `${base}.findRules`, 'must be array');
      return;
    }
    cmd.findRules.forEach((fr, frIdx) => {
      const p = `${base}.findRules[${frIdx}]`;
      if (!isNonEmptyString(fr.identifier)) {
        push(errors, `${p}.identifier`, 'must be non-empty string');
      }
      if (fr.kind !== 'emulator' && fr.kind !== 'core') {
        push(errors, `${p}.kind`, `must be 'emulator'|'core' – got ${String(fr.kind)}`);
      }
      if (!Array.isArray(fr.rules) || fr.rules.length === 0) {
        push(errors, `${p}.rules`, 'must be non-empty array');
      } else {
        fr.rules.forEach((r, rIdx) => {
          const rp = `${p}.rules[${rIdx}]`;
          if (!Array.isArray(r.entries) || r.entries.length === 0) {
            push(errors, `${rp}.entries`, 'must be non-empty string[]');
          } else if (!r.entries.every(e => typeof e === 'string' && e.length > 0)) {
            push(errors, `${rp}.entries`, 'each entry must be non-empty string');
          }
          // allowed types: staticpath, corepath, systempath (steam) – spec says staticpath|corepath but real data includes systempath
          const allowed = ['staticpath', 'corepath', 'systempath'];
          if (typeof r.type !== 'string' || r.type.length === 0) {
            push(errors, `${rp}.type`, 'must be non-empty string');
          } else if (!allowed.includes(r.type)) {
            // Don't hard fail for future types, but warn as error per spec if not in supported set
            // Spec says supported are staticpath|corepath; we treat systempath as supported too for audit compatibility
            if (r.type !== 'staticpath' && r.type !== 'corepath' && r.type !== 'systempath') {
              push(errors, `${rp}.type`, `unsupported find-rule type "${r.type}" – expected staticpath|corepath|systempath`);
            }
          }
        });
      }
      if (!isNonEmptyString(fr.source)) {
        push(errors, `${p}.source`, 'must be non-empty string');
      }
    });
  });
}

export type ValidationResult =
  | { ok: true; config: MachineConfig }
  | { ok: false; errors: ValidationError[] };

export function validateMachineConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(config)) {
    return { ok: false, errors: [{ path: '$', message: 'MachineConfig must be object' }] };
  }

  const c = config as Partial<MachineConfig> & Record<string, unknown>;

  // schemaVersion
  if (typeof c.schemaVersion !== 'number') {
    push(errors, '$.schemaVersion', 'must be number');
  } else if (!(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(c.schemaVersion)) {
    push(errors, '$.schemaVersion', `unsupported schemaVersion ${c.schemaVersion} – supported ${(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).join(', ')}`);
  } else if (c.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    // Currently only 1 supported, already covered, keep for future
    push(errors, '$.schemaVersion', `must be ${CURRENT_SCHEMA_VERSION}`);
  }

  // populatedSystemCount
  if (typeof c.populatedSystemCount !== 'number' || !Number.isFinite(c.populatedSystemCount) || c.populatedSystemCount < 0) {
    push(errors, '$.populatedSystemCount', 'must be finite number >=0');
  }

  // roots
  validateRoots(c.roots, errors);

  // generatedAt
  if (typeof c.generatedAt !== 'string' || c.generatedAt.length === 0) {
    push(errors, '$.generatedAt', 'must be non-empty ISO string');
  } else {
    const d = Date.parse(c.generatedAt);
    if (Number.isNaN(d)) {
      push(errors, '$.generatedAt', 'must be parseable date (ISO 8601)');
    }
  }

  // authoritativeFiles
  if (!isRecord(c.authoritativeFiles)) {
    push(errors, '$.authoritativeFiles', 'must be Record<string,string>');
  } else {
    for (const [k, v] of Object.entries(c.authoritativeFiles)) {
      if (typeof v !== 'string' || v.length === 0) {
        push(errors, `$.authoritativeFiles.${k}`, 'must be non-empty string path');
      }
    }
  }

  // systems
  if (!Array.isArray(c.systems)) {
    push(errors, '$.systems', 'must be array');
    return { ok: false, errors };
  }

  const systems = c.systems as unknown[];

  if (typeof c.populatedSystemCount === 'number') {
    if (systems.length !== c.populatedSystemCount) {
      push(errors, '$.populatedSystemCount', `inconsistent: systems.length ${systems.length} !== populatedSystemCount ${c.populatedSystemCount}`);
    }
    const filtered = (systems as MachineSystem[]).filter(s => isRecord(s) && typeof (s as unknown as { matchingRomFileCount?: unknown }).matchingRomFileCount === 'number' && ((s as unknown as MachineSystem).matchingRomFileCount ?? 0) > 0);
    if (filtered.length !== c.populatedSystemCount) {
      push(errors, '$.populatedSystemCount', `inconsistent: systems.filter(matchingRomFileCount>0).length ${filtered.length} !== populatedSystemCount ${c.populatedSystemCount}`);
    }
  }

  // unique IDs
  const seen = new Map<string, number>(); // lower -> first index
  const seenExact = new Set<string>();
  systems.forEach((raw, idx) => {
    const path = `$.systems[${idx}]`;
    if (!isRecord(raw)) {
      push(errors, path, 'must be object');
      return;
    }
    const s = raw as Partial<MachineSystem>;
    if (!isNonEmptyString(s.id)) {
      push(errors, `${path}.id`, 'must be non-empty string');
      return;
    }
    const id = s.id as string;
    // case-sensitive uniqueness
    if (seenExact.has(id)) {
      push(errors, `${path}.id`, `duplicate system id "${id}" (case-sensitive uniqueness required)`);
    } else {
      seenExact.add(id);
    }
    const lower = id.toLowerCase();
    if (seen.has(lower)) {
      // if exact duplicate already handled, still report case-insensitive collision
      if (seen.get(lower) !== idx && !Array.from(seenExact).some(x => x.toLowerCase() === lower && x === id && seen.get(lower) !== undefined)) {
        // only if different casing
        const firstIdx = seen.get(lower);
        if (firstIdx !== undefined && (systems[firstIdx] as MachineSystem).id.toLowerCase() === lower && (systems[firstIdx] as MachineSystem).id !== id) {
          push(errors, `${path}.id`, `case-insensitive duplicate id "${id}" collides with systems[${firstIdx}].id`);
        }
      }
    } else {
      seen.set(lower, idx);
    }

    // romDirectory
    if (typeof s.romDirectory !== 'string' || s.romDirectory.length === 0) {
      push(errors, `${path}.romDirectory`, 'must be non-empty string');
    } else if (!isValidRomDirectory(s.romDirectory)) {
      push(errors, `${path}.romDirectory`, `must be absolute Windows path like "D:\\..." or "D:/..." matching /^[A-Za-z]:[\\\\/]/ – got "${s.romDirectory}"`);
    }

    // commands non-empty
    if (!Array.isArray(s.commands) || s.commands.length === 0) {
      push(errors, `${path}.commands`, 'must be non-empty array');
    }

    // validExtensions sanity
    if (!Array.isArray(s.validExtensions) || s.validExtensions.length === 0) {
      // extensionString may be empty? but spec says should have extensions
      // only warn if both missing
      if (typeof s.extensionString !== 'string' || s.extensionString.trim().length === 0) {
        push(errors, `${path}.validExtensions`, 'must be non-empty array or extensionString');
      }
    }

    // matchingRomFileCount must be >=0
    if (typeof s.matchingRomFileCount !== 'number' || !Number.isFinite(s.matchingRomFileCount) || s.matchingRomFileCount < 0) {
      push(errors, `${path}.matchingRomFileCount`, 'must be finite >=0');
    }

    // launchSelection label matches command
    if (!isRecord(s.launchSelection)) {
      push(errors, `${path}.launchSelection`, 'must be object');
    } else {
      const ls = s.launchSelection as Partial<MachineSystem['launchSelection']>;
      if (!isNonEmptyString(ls.selectedLabel)) {
        push(errors, `${path}.launchSelection.selectedLabel`, 'must be non-empty string');
      } else if (Array.isArray(s.commands)) {
        const labels = (s.commands as { label?: unknown }[]).map(c => (isRecord(c) ? (c as { label?: unknown }).label : undefined)).filter(l => typeof l === 'string') as string[];
        if (labels.length > 0 && !labels.includes(ls.selectedLabel as string)) {
          push(errors, `${path}.launchSelection.selectedLabel`, `selectedLabel "${ls.selectedLabel}" does not match any command label in this system – available: ${labels.join(', ')}`);
        }
      }
      if (typeof ls.rule !== 'string') {
        push(errors, `${path}.launchSelection.rule`, 'must be string');
      }
      if (typeof ls.status !== 'string') {
        push(errors, `${path}.launchSelection.status`, 'must be string');
      }
      if (typeof ls.source !== 'string') {
        push(errors, `${path}.launchSelection.source`, 'must be string');
      }
      if (!(typeof ls.systemAlternativeLabel === 'string' || ls.systemAlternativeLabel === null)) {
        push(errors, `${path}.launchSelection.systemAlternativeLabel`, 'must be string|null');
      }
      if (typeof ls.perGameOverrideCount !== 'number' || !Number.isFinite(ls.perGameOverrideCount) || ls.perGameOverrideCount < 0) {
        push(errors, `${path}.launchSelection.perGameOverrideCount`, 'must be finite >=0');
      }
      if (!Array.isArray(ls.perGameOverrides)) {
        push(errors, `${path}.launchSelection.perGameOverrides`, 'must be array');
      }
    }

    // media
    if (!isRecord(s.media)) {
      push(errors, `${path}.media`, 'must be object');
    } else {
      // check each present category
      for (const [mediaKey, catVal] of Object.entries(s.media as Record<string, unknown>)) {
        validateMediaCategory(catVal, `${path}.media.${mediaKey}`, s.id as string, errors);
      }
    }

    // metadata
    if (!isRecord(s.metadata)) {
      push(errors, `${path}.metadata`, 'must be object');
    } else {
      const md = s.metadata as Partial<MachineSystem['metadata']>;
      if (typeof md.exists !== 'boolean') push(errors, `${path}.metadata.exists`, 'must be boolean');
      if (typeof md.favorites !== 'number' || !Number.isFinite(md.favorites)) push(errors, `${path}.metadata.favorites`, 'must be finite number');
      if (typeof md.gameEntries !== 'number' || !Number.isFinite(md.gameEntries)) push(errors, `${path}.metadata.gameEntries`, 'must be finite number');
      if (typeof md.gamelistPath !== 'string') push(errors, `${path}.metadata.gamelistPath`, 'must be string');
      if (typeof md.entriesWithPlayCount !== 'number' || !Number.isFinite(md.entriesWithPlayCount)) push(errors, `${path}.metadata.entriesWithPlayCount`, 'must be finite number');
      if (typeof md.entriesWithLastPlayed !== 'number' || !Number.isFinite(md.entriesWithLastPlayed)) push(errors, `${path}.metadata.entriesWithLastPlayed`, 'must be finite number');
      if (typeof md.fields !== 'string') push(errors, `${path}.metadata.fields`, 'must be string');
    }
  });

  // find-rule deep validation (after basic)
  systems.forEach((raw, idx) => {
    if (!isRecord(raw)) return;
    const s = raw as unknown as MachineSystem;
    if (!Array.isArray((s as MachineSystem).commands)) return;
    validateFindRules(s, idx, errors);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // safe cast – all structural checks passed
  return { ok: true, config: config as MachineConfig };
}
