/**
 * useCrystalLaunch – launch hook wrapping launch controller
 * Used by Library component; returns toast-friendly API.
 */

import { useCallback, useRef, useState } from 'react'
import { launchGame as launchController, isSteamSystem, type LaunchRequest } from '../controllers/launch'
import { recordSemanticInput, setCrashContext } from '../lib/crashReporter'

export function useCrystalLaunch(opts?: { systemId?: string; systemFullName?: string; onToast?: (msg: string)=>void }) {
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'launching'>('idle')
  const lastLaunchRef = useRef<number>(0)
  const push = useCallback((m: string)=> { opts?.onToast?.(m); try { console.info('[crystal]', m)} catch{} }, [opts])

  const launch = useCallback(async (req: Omit<LaunchRequest, 'systemId'> & { systemId?: string }) => {
    const systemId = req.systemId || opts?.systemId || ''
    const systemFullName = opts?.systemFullName
    const now = Date.now()
    if (now - lastLaunchRef.current < 800) {
      push('Launch throttled – wait a moment')
      return
    }
    lastLaunchRef.current = now
    setLaunchStatus('launching')
    setCrashContext('library', systemId)
    recordSemanticInput(`LAUNCH ${systemId} ${req.romPath}`)
    try {
      const launchReq: LaunchRequest = {
        systemId,
        systemFullName,
        romPath: req.romPath,
        romBasename: req.romBasename,
        romDirectory: req.romDirectory,
        commandTemplate: req.commandTemplate,
        commandLabel: req.commandLabel,
        isFirstConfiguredCommand: req.isFirstConfiguredCommand,
      }
      if (isSteamSystem(launchReq)) {
        push('Opening Steam...')
      } else {
        push(`Launching ${req.romBasename || 'game'}...`)
      }
      await launchController(launchReq)
      push('Launch sent')
    } catch (e: any) {
      const msg = e?.message || String(e)
      push(`Launch failed: ${msg.slice(0, 120)}`)
      // Rethrow not necessary but for debugging
      console.error('[crystal-launch] failed', e)
    } finally {
      setLaunchStatus('idle')
    }
  }, [opts?.systemFullName, opts?.systemId, push])

  return { launch, launchStatus }
}
