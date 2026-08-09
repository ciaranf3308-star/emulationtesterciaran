import { describe, test, expect } from 'bun:test'
import { loadMachineConfigFromJson, isExampleConfig } from '../src/machine/loader'
import { validateMachineConfig } from '../src/machine/validation'
import { makeValidSystem, makeValidConfig, romDir } from './helpers/factory'

describe('machine config domain', ()=>{
  test('validates minimal mock passes', ()=>{
    const s1 = makeValidSystem('ps2', romDir('ps2'))
    const s2 = makeValidSystem('gc', romDir('gc')) as any
    s2.id='gc'; s2.fullName='GameCube'
    const cfgJson = makeValidConfig([s1,s2])
    const cfg = loadMachineConfigFromJson(cfgJson)
    const result = validateMachineConfig(cfg)
    expect(result.ok).toBe(true)
  })

  test('detects duplicate system ids', ()=>{
    const s1 = makeValidSystem('ps2', romDir('ps2'))
    const s2 = { ...makeValidSystem('ps2', romDir('ps2_dup')), id:'ps2', fullName:'PS2 Dup' }
    const cfgJson = makeValidConfig([s1, s2 as any])
    cfgJson.populatedSystemCount = 2
    try {
      const cfg = loadMachineConfigFromJson(cfgJson)
      const result = validateMachineConfig(cfg)
      expect(result.ok).toBe(false)
    } catch(e:any){
      expect(e.message.toLowerCase().includes('duplicate') || (e.validationErrors||[]).some((x:any)=> (x.path||'').toLowerCase().includes('duplicate') || x.message.toLowerCase().includes('duplicate'))).toBe(true)
    }
  })

  test('populatedSystemCount mismatch reported', ()=>{
    const s1 = makeValidSystem('ps2', romDir('ps2'))
    const cfgJson = makeValidConfig([s1])
    cfgJson.populatedSystemCount = 99
    try {
      const cfg = loadMachineConfigFromJson(cfgJson)
      const result = validateMachineConfig(cfg)
      expect(result.ok).toBe(false)
    } catch(e:any){
      expect(e.message.toLowerCase().includes('populated')).toBe(true)
    }
  })

  test('launchSelection label must match a command', ()=>{
    const s1 = makeValidSystem('ps2', romDir('ps2')) as any
    s1.launchSelection.selectedLabel = 'NON_EXISTENT'
    const cfgJson = makeValidConfig([s1])
    try {
      loadMachineConfigFromJson(cfgJson)
      expect(false).toBe(true) // should have thrown
    } catch(e:any){
      expect(e.message.includes('NON_EXISTENT')).toBe(true)
    }
  })

  test('loader throws on unknown selectedLabel', ()=>{
    const s1 = makeValidSystem('ps2', romDir('ps2')) as any
    s1.launchSelection.selectedLabel = 'MissingCmd'
    const cfgJson = makeValidConfig([s1])
    expect(()=> loadMachineConfigFromJson(cfgJson)).toThrow()
  })

  test('isExampleConfig flag', ()=>{
    expect(isExampleConfig({ _devFlag:'exampleData', schemaVersion:1, populatedSystemCount:1, roots:{}, systems:[] } as any)).toBe(true)
  })

  test('ROM dir validation must contain backslash', ()=>{
    const s1 = makeValidSystem('ps2','relative/path/no/backslash') as any
    const cfgJson = makeValidConfig([s1])
    try {
      loadMachineConfigFromJson(cfgJson)
      expect(false).toBe(true)
    } catch(e:any){
      expect(e.message.toLowerCase().includes('romdirectory')).toBe(true)
    }
  })
})
