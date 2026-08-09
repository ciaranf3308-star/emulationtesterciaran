import type { SystemPresentationConfig } from './types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validatePresentationConfig(config: SystemPresentationConfig): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!config.systemId) errors.push('missing systemId')
  if (!config.gameplayRegions || config.gameplayRegions.length === 0) errors.push(`system ${config.systemId}: gameplayRegions empty`)

  if (config.screenCount !== 1 && config.screenCount !== 2) {
    errors.push(`system ${config.systemId}: screenCount must be 1|2, got ${config.screenCount as any}`)
  }

  if (config.gameplayRegions && config.screenCount && config.gameplayRegions.length !== config.screenCount) {
    // For single-screen, regions length should be 1; for dual-screen 2.
    // Allow warning if user purposely defines 1 region for screenCount 2? Block as error per spec.
    if (config.screenCount === 1 && config.gameplayRegions.length !== 1) {
      errors.push(`single-screen ${config.systemId} must have 1 region, got ${config.gameplayRegions.length}`)
    } else if (config.screenCount === 2 && config.gameplayRegions.length !== 2) {
      errors.push(`dual-screen ${config.systemId} must have 2 regions, got ${config.gameplayRegions.length}`)
    }
  }

  if (config.hasPhysicalMedia && config.physicalMedia?.type === 'none') {
    warnings.push(`${config.systemId}: hasPhysicalMedia true but physicalMedia.type none`)
  }

  if (!config.hasPhysicalMedia && config.physicalMedia && config.physicalMedia.type !== 'none') {
    warnings.push(`${config.systemId}: hasPhysicalMedia false but physicalMedia defined`)
  }

  if (config.screenMasks) {
    for (const [regionId] of Object.entries(config.screenMasks)) {
      if (!config.gameplayRegions.some(r => r.id === regionId)) {
        warnings.push(`screenMasks key ${regionId} not in gameplayRegions for ${config.systemId}`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
