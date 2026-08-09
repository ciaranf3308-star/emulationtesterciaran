import type { MachineConfig, MachineSystem } from '../machine/types'
import { getSystemById } from '../machine/selectors'
import type { LaunchRequest, LaunchBackendRequest, LaunchResolution } from './types'

/**
 * Placeholder token regex – ES-DE uses uppercase with dashes (e.g. XENIA-EDGE, OS-SHELL)
 * Pattern: %[A-Z0-9_\-.]+%
 */
const PLACEHOLDER_RE = /%[A-Z0-9_\-.]+%/gi

const KNOWN_EXACT = new Set<string>([
  '%EMULATOR%',
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
])

function isKnownPlaceholder(ph: string): boolean {
  const up = ph.toUpperCase()
  if (KNOWN_EXACT.has(up)) return true
  if (up.startsWith('%EMULATOR_') && up.endsWith('%')) return true
  if (up.startsWith('%CORE_') && up.endsWith('%')) return true
  return false
}

function extractPlaceholders(template: string): string[] {
  const matches = template.match(PLACEHOLDER_RE)
  if (!matches) return []
  // dedupe preserving order
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m)
      out.push(m)
    }
  }
  return out
}

// Windows-aware helpers: handle both \ and / separators, no Node path dependency.

function getRomDirectory(romPath: string): string {
  const lastBackslash = romPath.lastIndexOf('\\')
  const lastSlash = romPath.lastIndexOf('/')
  const last = Math.max(lastBackslash, lastSlash)
  if (last === -1) return '.'
  if (last === 0) return romPath.slice(0, 1)
  return romPath.slice(0, last)
}

function getRomFileName(romPath: string): string {
  const lastBackslash = romPath.lastIndexOf('\\')
  const lastSlash = romPath.lastIndexOf('/')
  const last = Math.max(lastBackslash, lastSlash)
  return last === -1 ? romPath : romPath.slice(last + 1)
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return fileName
  return fileName.slice(0, dot)
}

function computeRomFields(romPath: string): { romBasename: string; romDirectory: string; romFileName: string } {
  const romFileName = getRomFileName(romPath)
  const romBasename = stripExtension(romFileName)
  const romDirectory = getRomDirectory(romPath)
  return { romBasename, romDirectory, romFileName }
}

export function resolveLaunchRequest(config: MachineConfig, request: LaunchRequest): LaunchResolution {
  if (!config || !Array.isArray(config.systems)) {
    return { ok: false, reason: 'Invalid MachineConfig: missing systems array' }
  }

  const systemId = request.systemId?.trim()
  if (!systemId) {
    return { ok: false, reason: 'Missing systemId in LaunchRequest' }
  }

  const romPathRaw = request.romPath
  if (typeof romPathRaw !== 'string' || romPathRaw.trim().length === 0) {
    return { ok: false, reason: 'Missing or empty romPath in LaunchRequest', systemId }
  }
  const romPath = romPathRaw.trim()

  const system: MachineSystem | undefined = getSystemById(config, systemId)
  if (!system) {
    return {
      ok: false,
      reason: `System "${systemId}" not found in MachineConfig. Available: ${config.systems.map(s => s.id).slice(0, 20).join(', ')}`,
      systemId,
    }
  }

  // Determine selected command: request override else system.launchSelection.selectedLabel
  const requestedLabel = request.selectedCommandLabel?.trim()
  const effectiveLabel = requestedLabel || system.launchSelection?.selectedLabel || ''

  if (!effectiveLabel) {
    return {
      ok: false,
      reason: `No selectedCommandLabel provided and system "${systemId}" has no launchSelection.selectedLabel`,
      systemId,
    }
  }

  const command = system.commands.find(c => c.label === effectiveLabel)
  if (!command) {
    return {
      ok: false,
      reason: `Command label "${effectiveLabel}" not found for system "${systemId}". Available: ${system.commands.map(c => `"${c.label}"`).join(', ')}. Did NOT fallback silently.`,
      systemId,
    }
  }

  // Validate template non-empty, but do NOT assume %ROM% is required (some use %ROM_RAW% etc).
  if (!command.template || typeof command.template !== 'string' || command.template.trim().length === 0) {
    return {
      ok: false,
      reason: `Command "${command.label}" has empty template for system "${systemId}"`,
      systemId,
    }
  }

  // Preserve unusual structures exactly – do NOT simplify Xbox / Xbox360 templates.
  // e.g. "%STARTDIR%=%EMUDIR% %EMULATOR_XEMU% -dvd_path %ROM%" must stay verbatim.

  const placeholdersPresent = extractPlaceholders(command.template)

  if (placeholdersPresent.length === 0) {
    return {
      ok: false,
      reason: `Command "${command.label}" template contains no placeholder token: "${command.template}"`,
      systemId,
    }
  }

  for (const ph of placeholdersPresent) {
    if (!isKnownPlaceholder(ph)) {
      return {
        ok: false,
        reason: `Unsupported placeholder "${ph}" in template "${command.template}" for command "${command.label}". Known patterns: %EMULATOR_*%, %CORE_*%, %ROM%, %BASENAME%, %GAMEDIR%, %EMUDIR%, %ESPATH%, %STARTDIR%, %INJECT%, %HIDEWINDOW%, %ESCAPESPECIALS%, %RUNINBACKGROUND%.`,
        unsupported: ph,
        systemId,
      }
    }
  }

  if (command.workingDirectoryTemplate) {
    const wdPlaceholders = extractPlaceholders(command.workingDirectoryTemplate)
    for (const ph of wdPlaceholders) {
      if (!isKnownPlaceholder(ph)) {
        return {
          ok: false,
          reason: `WorkingDirectoryTemplate uses unsupported placeholder "${ph}" in "${command.workingDirectoryTemplate}"`,
          unsupported: ph,
          systemId,
        }
      }
    }
  }

  // Split findRules by kind – preserve source + entries exactly.
  const emulatorFindRules = command.findRules.filter(fr => fr.kind === 'emulator')
  const coreFindRules = command.findRules.filter(fr => fr.kind === 'core')

  const { romBasename, romDirectory } = computeRomFields(romPath)

  // Build placeholders map – backend owns substitution. We only provide rom-derived.
  const placeholders: Record<string, string> = {
    '%ROM%': romPath,
    '%ROM_RAW%': romPath,
    '%BASENAME%': romBasename,
    '%GAMEDIR%': romDirectory,
    '%ROMPATH%': romDirectory,
  }

  const backendRequest: LaunchBackendRequest = {
    systemId: system.id,
    systemFullName: system.fullName,
    romPath,
    romBasename,
    romDirectory,
    commandLabel: command.label,
    commandTemplate: command.template,
    workingDirectoryTemplate: command.workingDirectoryTemplate,
    isFirstConfiguredCommand: command.isFirstConfiguredCommand,
    emulatorFindRules,
    coreFindRules,
    emulatorIdentifiers: command.identifiers.emulatorIdentifiers,
    coreFiles: command.identifiers.coreFiles,
    corePathIdentifiers: command.identifiers.corePathIdentifiers,
    identifiers: command.identifiers,
    findRules: command.findRules,
    placeholders,
    placeholdersPresent,
  }

  return { ok: true, backendRequest }
}

// Test helpers
export const __testables = {
  getRomDirectory,
  getRomFileName,
  stripExtension,
  computeRomFields,
  isKnownPlaceholder,
  extractPlaceholders,
}
