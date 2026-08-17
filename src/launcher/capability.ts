/**
 * Launch capability domain – placeholder classification
 *
 * Distinguishes:
 *  - syntactically known placeholders (%ROM%, %EMULATOR_*%, etc.)
 *  vs unknown %FOO%
 *  - runtimeSupported: can frontend+planned backend execute now?
 *
 * Truth:
 *  %INJECT% expands the optional per-game ES-DE argument file.
 *  %EMULATOR_OS-SHELL% resolves through the configured system find rule.
 */

export type PlaceholderCategory =
  | 'rom'
  | 'emulator'
  | 'core'
  | 'path'
  | 'modifier'
  | 'injection'
  | 'shell'
  | 'unsupported'

export type PlaceholderCapability = {
  token: string // e.g. "%ROM%"
  normalized: string // uppercased canonical
  recognized: boolean // syntactically known?
  runtimeSupported: boolean // can current frontend+planned backend execute?
  category: PlaceholderCategory
  reason?: string // human reason when blocked
  requiresBackendFeature?: string
}

const PLACEHOLDER_RE = /%[A-Z0-9_\-.]+%/gi

function norm(token: string): string {
  return token.toUpperCase()
}

// Exact known tokens that are simple path substitutions
const DIRECT_PATH_TOKENS = new Set<string>([
  '%ROM%',
  '%ROM_RAW%',
  '%BASENAME%',
  '%GAMEDIR%',
  '%ROMPATH%',
  '%EMUDIR%',
  '%EMUPATH%',
  '%ESPATH%',
  '%STARTDIR%',
])

const MODIFIER_TOKENS = new Set<string>([
  '%HIDEWINDOW%',
  '%ESCAPESPECIALS%',
  '%RUNINBACKGROUND%',
])

export function getPlaceholderCapability(token: string): PlaceholderCapability {
  const normalized = norm(token.trim())
  const raw = token.trim()

  // %EMULATOR_OS-SHELL% or variants containing OS-SHELL
  if (normalized.includes('OS-SHELL') || normalized.includes('OS_SHELL')) {
    // The common full token is %EMULATOR_OS-SHELL% – but also handle %OS-SHELL% legacy
    // eslint detection: keep explicit reason
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'shell',
      requiresBackendFeature: 'shell-execution',
    }
  }

  // %EMULATOR_OS% (prefix without -SHELL) – also shell family
  if (normalized === '%EMULATOR_OS%' || normalized.startsWith('%EMULATOR_OS-') || normalized.startsWith('%EMULATOR_OS_')) {
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'shell',
      requiresBackendFeature: 'shell-execution',
    }
  }

  if (normalized === '%INJECT%') {
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'injection',
      requiresBackendFeature: 'argument-file-injection',
    }
  }

  if (DIRECT_PATH_TOKENS.has(normalized)) {
    const cat: PlaceholderCategory = (() => {
      if (['%ROM%', '%ROM_RAW%', '%BASENAME%', '%GAMEDIR%', '%ROMPATH%'].includes(normalized)) return 'rom'
      return 'path'
    })()
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: cat,
    }
  }

  if (MODIFIER_TOKENS.has(normalized)) {
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'modifier',
    }
  }

  if (normalized === '%EMULATOR%') {
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'emulator',
      requiresBackendFeature: 'emulator-find-rules',
    }
  }

  if (normalized.startsWith('%EMULATOR_') && normalized.endsWith('%')) {
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'emulator',
      requiresBackendFeature: 'emulator-find-rules',
    }
  }

  if (normalized.startsWith('%CORE_') && normalized.endsWith('%')) {
    // %CORE_RETROARCH% etc.
    return {
      token: raw,
      normalized,
      recognized: true,
      runtimeSupported: true,
      category: 'core',
      requiresBackendFeature: 'core-find-rules',
    }
  }

  // Unknown placeholder
  return {
    token: raw,
    normalized,
    recognized: false,
    runtimeSupported: false,
    category: 'unsupported',
    reason: `Unsupported placeholder ${raw}`,
  }
}

export function getCapabilitiesForTemplate(template: string): PlaceholderCapability[] {
  if (!template || typeof template !== 'string') return []
  const matches = template.match(PLACEHOLDER_RE)
  if (!matches) return []
  const seen = new Set<string>()
  const out: PlaceholderCapability[] = []
  for (const m of matches) {
    const up = norm(m)
    if (seen.has(up)) continue
    seen.add(up)
    out.push(getPlaceholderCapability(m))
  }
  return out
}

export function isLaunchReady(template: string): {
  ready: boolean
  blockingReasons: string[]
  capabilities: PlaceholderCapability[]
} {
  const capabilities = getCapabilitiesForTemplate(template)
  const blocking = capabilities.filter(c => c.recognized && !c.runtimeSupported)
  const blockingReasons = blocking.map(c => `${c.token}: ${c.reason || 'runtime not supported'}`)
  return {
    ready: blocking.length === 0 && capabilities.length > 0 && capabilities.every(c => c.recognized),
    blockingReasons,
    capabilities,
  }
}

export const __testables = {
  DIRECT_PATH_TOKENS,
  MODIFIER_TOKENS,
  PLACEHOLDER_RE,
}
