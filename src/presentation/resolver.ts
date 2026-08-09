import type { SystemPresentationConfig } from './types'
import { SINGLE_SCREEN, GENESIS, MEGADRIVE, getPreset } from './presets'

const cache = new Map<string, SystemPresentationConfig>()

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function getPresentationForSystem(systemId: string): SystemPresentationConfig | undefined {
  if (cache.has(systemId)) return clone(cache.get(systemId)!)
  const preset = getPreset(systemId)
  if (preset) {
    const c = clone(preset)
    cache.set(systemId, c)
    return clone(c)
  }

  // genesis vs megadrive distinct handling – presets already cover, but generic fallback preserves id
  if (systemId === 'genesis' || systemId === 'megadrive') {
    const base = systemId === 'genesis' ? GENESIS : MEGADRIVE
    const c = clone(base)
    cache.set(systemId, c)
    return clone(c)
  }

  // generic single-screen fallback – distinct per id
  const generic: SystemPresentationConfig = {
    ...clone(SINGLE_SCREEN),
    systemId,
    fullName: systemId,
  }
  cache.set(systemId, generic)
  return clone(generic)
}

export function clearPresentationCache() {
  cache.clear()
}

export * from './types'
export * from './presets'
export * from './validation'
export { getPreset }
