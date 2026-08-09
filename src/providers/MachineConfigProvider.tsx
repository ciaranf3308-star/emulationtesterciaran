import React, { createContext, useContext, useEffect, useState } from 'react'
import type { MachineConfig } from '../machine/types'
import { loadMachineConfigFromJson, loadExampleMachineConfig, isExampleConfig } from '../machine/loader'

type MachineState = {
  config: MachineConfig | null
  isExample: boolean
  error: string | null
  validationErrors: import('../machine/types').ValidationError[]
  loading: boolean
  isRealMachine: boolean
}

const Ctx = createContext<MachineState | null>(null)

export function MachineConfigProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MachineState>({
    config:null, isExample:false, error:null, validationErrors:[], loading:true, isRealMachine:false
  })

  useEffect(()=>{
    let cancelled=false
    async function init() {
      // Attempt to load real machine config via window (Tauri) or fail to example
      // In browser dev mode we load sanitized example
      try {
        // Try to fetch from possible backend-provided global? For now try window.__CRYSTAL_MACHINE_CONFIG__
        // @ts-ignore
        const injected = (window as any).__CRYSTAL_MACHINE_CONFIG__
        if (injected) {
          const cfg = loadMachineConfigFromJson(injected)
          if (cancelled) return
          setState({ config:cfg, isExample:isExampleConfig(cfg), error:null, validationErrors:[], loading:false, isRealMachine: !isExampleConfig(cfg) })
          return
        }
      } catch(e) {
        // fallthrough
      }

      // Try load via Tauri invoke if available
      try {
        // @ts-ignore
        const tauri = (window as any).__TAURI__
        if (tauri?.invoke) {
          const txt = await tauri.invoke('get_machine_config')
          const j = typeof txt === 'string' ? JSON.parse(txt) : txt
          const cfg = loadMachineConfigFromJson(j)
          if (cancelled) return
          setState({ config:cfg, isExample:isExampleConfig(cfg), error:null, validationErrors:[], loading:false, isRealMachine:true })
          return
        }
      } catch {}

      // Browser dev fallback: sanitized example
      try {
        const cfg = await loadExampleMachineConfig()
        if (cancelled) return
        setState({ config:cfg, isExample:true, error:null, validationErrors:[], loading:false, isRealMachine:false })
      } catch(e:any) {
        if (cancelled) return
        setState({ config:null, isExample:false, error:e?.message||String(e), validationErrors:e?.errors||[], loading:false, isRealMachine:false })
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
