import React, { createContext, useContext, useEffect, useState } from 'react'
import type { MachineConfig, ValidationError } from '../machine/types'
import { loadMachineConfigFromJson, loadExampleMachineConfig, isExampleConfig, MachineConfigLoadError } from '../machine/loader'
import { isTauriEnvironment } from '../runtime/environment'
import { getTauriInvoker } from '../runtime/tauri'

type MachineState = {
  config: MachineConfig | null
  isExample: boolean
  error: string | null
  validationErrors: ValidationError[]
  loading: boolean
  isRealMachine: boolean
  blockingError: boolean // true when Tauri real-config failed and we must not show example UI
}

const Ctx = createContext<MachineState | null>(null)

export function MachineConfigProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MachineState>({
    config:null, isExample:false, error:null, validationErrors:[], loading:true, isRealMachine:false, blockingError:false
  })

  useEffect(()=>{
    let cancelled=false
    async function init() {
      const tauriMode = isTauriEnvironment()

      // 1) Try injected global (window.__CRYSTAL_MACHINE_CONFIG__) – could be Tauri injected or test hook
      const injected = (typeof window !== 'undefined' ? (window as any).__CRYSTAL_MACHINE_CONFIG__ : undefined)
      if (injected) {
        try {
          const cfg = loadMachineConfigFromJson(injected)
          if (cancelled) return
          setState({ config:cfg, isExample:isExampleConfig(cfg), error:null, validationErrors:[], loading:false, isRealMachine: !isExampleConfig(cfg), blockingError:false })
          return
        } catch (e: any) {
          // If we are in Tauri real-machine mode and injected config was attempted but invalid -> BLOCK, do not fallback to example
          if (tauriMode) {
            const errs = (e instanceof MachineConfigLoadError) ? e.validationErrors : [{ path:'$', message: e?.message||String(e) }]
            if (cancelled) return
            setState({
              config:null,
              isExample:false,
              error: `Real machine configuration failed to load – frontend cannot start with example data in installed mode. ${e?.message||String(e)}`,
              validationErrors: errs as ValidationError[],
              loading:false,
              isRealMachine:false,
              blockingError:true
            })
            return
          }
          // if not Tauri (browser dev), allow fallthrough to Tauri invoke / example
        }
      }

      // 2) Try Tauri invoke if available – this is REAL machine path via canonical runtime
      try {
        const invoke = await getTauriInvoker()
        if (invoke || tauriMode) {
          try {
            const invokeFn = invoke
            if (!invokeFn) throw new Error('Tauri invoke unavailable in Tauri mode')
            const txt = await invokeFn('get_machine_config')
            const j = typeof txt === 'string' ? JSON.parse(txt as string) : txt
            const cfg = loadMachineConfigFromJson(j)
            if (cancelled) return
            setState({ config:cfg, isExample:isExampleConfig(cfg), error:null, validationErrors:[], loading:false, isRealMachine:true, blockingError:false })
            return
          } catch (e: any) {
            // Tauri attempted but failed – this is a blocking error per product rule, DO NOT fallback to example
            const errs = (e instanceof MachineConfigLoadError) ? e.validationErrors : [{ path:'get_machine_config', message: e?.message||String(e) }]
            if (cancelled) return
            setState({
              config:null,
              isExample:false,
              error: `Real machine configuration failed to load – frontend cannot start with example data in installed mode. Backend get_machine_config failed: ${e?.message||String(e)}`,
              validationErrors: errs as ValidationError[],
              loading:false,
              isRealMachine:false,
              blockingError:true
            })
            return
          }
        }
      } catch {
        // outer catch – if we were in Tauri mode we should have already returned blockingError; fallthrough only for non-Tauri browser
        if (tauriMode) {
          if (cancelled) return
          setState({
            config:null,
            isExample:false,
            error: `Real machine configuration failed to load – frontend cannot start with example data in installed mode. Tauri backend invoke unavailable or threw.`,
            validationErrors: [{ path:'tauri.invoke', message:'invoke missing/failed in Tauri mode' }],
            loading:false,
            isRealMachine:false,
            blockingError:true
          })
          return
        }
      }

      // 3) Browser dev fallback – only allowed when NOT in Tauri mode
      if (tauriMode) {
        // We already ensured Tauri not available but tauriMode detection was truthy -> treat as blocking
        if (cancelled) return
        setState({
          config:null,
          isExample:false,
          error: `Real machine configuration failed to load – frontend cannot start with example data in installed mode. Detected Tauri environment but no valid config supplied via __CRYSTAL_MACHINE_CONFIG__ or get_machine_config.`,
          validationErrors: [{ path:'tauri.realConfig', message:'real machine config missing in Tauri mode' }],
          loading:false,
          isRealMachine:false,
          blockingError:true
        })
        return
      }

      // Browser dev path – sanitized example allowed
      try {
        const cfg = await loadExampleMachineConfig()
        if (cancelled) return
        setState({ config:cfg, isExample:true, error:null, validationErrors:[], loading:false, isRealMachine:false, blockingError:false })
      } catch(e:any) {
        if (cancelled) return
        const errs = (e instanceof MachineConfigLoadError) ? e.validationErrors : [{ path:'exampleConfig', message:e?.message||String(e) }]
        setState({ config:null, isExample:false, error:e?.message||String(e), validationErrors: errs as ValidationError[], loading:false, isRealMachine:false, blockingError:false })
      }
    }
    init()
    return ()=>{ cancelled=true }
  },[])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useMachineConfig() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMachineConfig must be inside MachineConfigProvider')
  return ctx
}
