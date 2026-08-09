import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { loadMachineConfigFromJson } from '../../src/machine/loader'
import { validateMachineConfig } from '../../src/machine/validation'
import { join } from 'node:path'

describe('sanitized example config passes', () => {
  test('loads machine-config.example.json via loadMachineConfigFromJson', () => {
    // Resolve relative to repo root – bun runs from repo root or this file's cwd
    const candidates = [
      'config/machine-config.example.json',
      './config/machine-config.example.json',
      '../config/machine-config.example.json',
      '../../config/machine-config.example.json',
    ]
    // try cwd-based resolution
    let raw: string | null = null
    for (const p of candidates) {
      try {
        raw = readFileSync(p, 'utf8')
        if (raw) break
      } catch {}
    }
    // fallback using import.meta? - absolute from process.cwd
    if (!raw) {
      try {
        const abs = join(process.cwd(), 'config/machine-config.example.json')
        raw = readFileSync(abs, 'utf8')
      } catch {}
    }
    if (!raw) {
      // last fallback: __dirname equivalent
      const abs2 = join(import.meta.dir || '.', '../../config/machine-config.example.json')
      raw = readFileSync(abs2, 'utf8')
    }

    expect(raw).toBeTruthy()
    const json = JSON.parse(raw as string)

    // validate via exported validator – should be ok
    const validated = validateMachineConfig(json)
    expect(validated.ok).toBe(true)

    // loader should not throw, returns ok
    const loaded = loadMachineConfigFromJson(json)
    expect(loaded).toBeDefined()
    expect(loaded.schemaVersion).toBe(1)
    expect(loaded.populatedSystemCount).toBe(5)
    expect(Array.isArray(loaded.systems)).toBe(true)
    expect(loaded.systems.length).toBe(5)
  })

  test('example file contains forward-slash romDirectories (tolerant case)', () => {
    const raw = (() => {
      try {
        return readFileSync('config/machine-config.example.json', 'utf8')
      } catch {
        return readFileSync(join(process.cwd(), 'config/machine-config.example.json'), 'utf8')
      }
    })()
    const json = JSON.parse(raw)
    for (const sys of json.systems) {
      expect(typeof sys.romDirectory).toBe('string')
      // must match tolerant Windows absolute pattern
      expect(/^[A-Za-z]:[\\/]/.test(sys.romDirectory)).toBe(true)
    }
  })
})
