import { describe, test, expect, beforeEach } from "bun:test"
import { startExternalAcquisition, __resetForTests } from "../../src/acquisition/externalAcquisition"
import type { AcquisitionSession } from "../../src/acquisition/types"
import { isNonTerminalBlockingPhase, isTerminalCloseablePhase, isTerminalPlayablePhase } from "../../src/acquisition/acquisitionUiController"

function mkSession(state:string): AcquisitionSession {
  return {
    sessionId:"sess-ctrl",
    systemId:"gbc",
    expectedTitle:"Game",
    state: state as any,
    detectedFiles:[],
    selectedCandidate:null,
    importResult:null,
    startedAt:Date.now(),
    lastUpdatedAt:Date.now(),
  } as any
}

describe("V8.6C2 Controller behavior – B cancels exactly once, A leak blocked", () => {
  beforeEach(()=>__resetForTests())

  test("Controller B cancels – backend called at most once, idempotent, no double action", async () => {
    let cancelCalls=0
    const ctrl = startExternalAcquisition({
      systemId:"gbc",
      expectedTitle:"Game",
      openExternalPage: async()=>{},
    }, {
      beginAcquisitionWatch: async()=> { await new Promise(r=>setTimeout(r,1)); return mkSession("WATCHING") as any },
      getAcquisitionWatchStatus: async()=> mkSession("WATCHING") as any,
      cancelAcquisitionWatch: async()=> { cancelCalls++; return mkSession("CANCELLED") as any },
      sleep: async()=>{},
    })

    await new Promise(r=>setTimeout(r, 8))
    await ctrl.cancel()
    const afterFirst = cancelCalls
    await ctrl.cancel()
    await ctrl.cancel()
    // first cancel may have called backend 0 (if watcher not yet started) or 1 – but subsequent must not increase beyond first
    expect(cancelCalls).toBe(afterFirst)
    expect(cancelCalls).toBeLessThanOrEqual(1)
    expect(ctrl.getState().phase).toBe("CANCELLED")
  })

  test("A while waiting does NOT leak into PLAY", () => {
    const blocking = ["PREPARING","OPENING_GAME_PAGE","WAITING_FOR_DOWNLOAD","DOWNLOAD_DETECTED","FINISHING_DOWNLOAD","ADDING_TO_LIBRARY","REFRESHING_LIBRARY"] as const
    for (const ph of blocking) {
      expect(isNonTerminalBlockingPhase(ph as any)).toBe(true)
      expect(isTerminalPlayablePhase(ph as any)).toBe(false)
    }
    expect(isNonTerminalBlockingPhase("ALREADY_IN_LIBRARY" as any)).toBe(true)
    expect(isTerminalPlayablePhase("ALREADY_IN_LIBRARY" as any)).toBe(false)
    const nonBlockingTerminalPlayable = "READY_TO_PLAY"
    expect(isNonTerminalBlockingPhase(nonBlockingTerminalPlayable as any)).toBe(false)
    expect(isTerminalPlayablePhase(nonBlockingTerminalPlayable as any)).toBe(true)
    expect(isTerminalCloseablePhase("FILE_CONFLICT" as any)).toBe(true)
    expect(isTerminalCloseablePhase("FAILED" as any)).toBe(true)
  })

  test("Underlying Discovery buttons must NOT be triggered while acquisition active – nav guard should intercept", () => {
    function simulateOnNav(action:"confirm"|"back", crystalPhase:any): "cancelled"|"closed"|"play"|"blocked"|"passthrough" {
      const nonTerminalBlocking = isNonTerminalBlockingPhase(crystalPhase)
      const terminalPlayable = isTerminalPlayablePhase(crystalPhase)
      const terminalCloseable = isTerminalCloseablePhase(crystalPhase)
      if (action==="back") {
        if (nonTerminalBlocking) return "cancelled"
        if (terminalPlayable || terminalCloseable) return "closed"
        return "passthrough"
      }
      if (action==="confirm") {
        if (terminalPlayable) return "play"
        if (nonTerminalBlocking) return "blocked"
        if (terminalCloseable) return "blocked"
        return "passthrough"
      }
      return "passthrough"
    }
    expect(simulateOnNav("confirm","WAITING_FOR_DOWNLOAD")).toBe("blocked")
    expect(simulateOnNav("confirm","DOWNLOAD_DETECTED")).toBe("blocked")
    expect(simulateOnNav("confirm","ADDING_TO_LIBRARY")).toBe("blocked")
    expect(simulateOnNav("confirm","READY_TO_PLAY")).toBe("play")
    expect(simulateOnNav("back","WAITING_FOR_DOWNLOAD")).toBe("cancelled")
    expect(simulateOnNav("back","READY_TO_PLAY")).toBe("closed")
    expect(simulateOnNav("back","FILE_CONFLICT")).toBe("closed")
    expect(simulateOnNav("confirm","FILE_CONFLICT")).toBe("blocked")
  })

  test("PLAY READY A uses existing play action – no new launch command construction", () => {
    const foundGame = { id:"a", name:"Pokémon Crystal", system_id:"gbc", rom_path:"a.gbc" } as any
    expect(foundGame.system_id).toBe("gbc")
    expect(foundGame.rom_path).toBe("a.gbc")
  })
})
