import { describe, test, expect, beforeEach } from "bun:test"
import { startExternalAcquisition, __resetForTests } from "../../src/acquisition/externalAcquisition"
import type { AcquisitionSession } from "../../src/acquisition/types"

function mkSession(override: Partial<AcquisitionSession> = {}): AcquisitionSession {
  return {
    sessionId: "sess-cancel-race",
    systemId: "gbc",
    expectedTitle: "Pokémon Crystal",
    state: "WATCHING",
    detectedFiles: [],
    selectedCandidate: null,
    importResult: null,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    ...override,
  } as AcquisitionSession
}

describe("V8.6C2 immediate-cancel race – C1 regression", () => {
  beforeEach(() => __resetForTests())

  test("controller = startExternalAcquisition(...) immediately controller.cancel() before deferred start executes – watcher never starts, page never opens, final CANCELLED, no zombie", async () => {
    let beginCalls = 0
    let openCalls = 0
    let getStatusCalls = 0
    let cancelCalls = 0

    const ctrl = startExternalAcquisition({
      systemId: "gbc",
      expectedTitle: "Pokémon Crystal",
      openExternalPage: async () => { openCalls++; },
    }, {
      beginAcquisitionWatch: async () => { beginCalls++; return mkSession() as any },
      getAcquisitionWatchStatus: async () => { getStatusCalls++; return mkSession() as any },
      cancelAcquisitionWatch: async () => { cancelCalls++; return mkSession() as any },
      sleep: async () => {},
    })

    // immediate cancel before deferred start (0-ms setTimeout)
    const cancelP = ctrl.cancel()
    await cancelP

    // allow deferred start tick to run – if guard broken it would call begin/open
    await new Promise(r => setTimeout(r, 10))

    const final = ctrl.getState()
    expect(final.phase).toBe("CANCELLED")
    expect(beginCalls).toBe(0)
    expect(openCalls).toBe(0)
    // getStatus never because we never entered polling
    expect(getStatusCalls).toBe(0)
    // backend cancel should NOT be called because watch never started (sessionId null) – 0 is acceptable, also allow 0
    // spec says watcher cleanly cancelled if it did begin – here it didn't, so 0
    expect(cancelCalls).toBe(0)
  })

  test("if cancel happens after watcher started but before page opens – watcher cleanly cancelled, page not opened after cancellation, no race second open", async () => {
    // slower begin to interleave
    let beginCalls = 0
    let openCalls = 0
    const session = mkSession()

    const ctrl = startExternalAcquisition({
      systemId: "gbc",
      expectedTitle: "Game",
      openExternalPage: async () => { openCalls++; },
    }, {
      beginAcquisitionWatch: async () => {
        beginCalls++
        await new Promise(r => setTimeout(r, 5)) // simulate a bit longer watch start
        return session as any
      },
      getAcquisitionWatchStatus: async () => session as any,
      cancelAcquisitionWatch: async () => session as any,
      sleep: async () => {},
    })

    // wait just enough for deferred start to have begun watch (setTimeout 0) and be inside beginAcquisitionWatch
    await new Promise(r => setTimeout(r, 1))
    // now cancel while begin in flight
    await ctrl.cancel()

    await new Promise(r => setTimeout(r, 12))

    const final = ctrl.getState()
    expect(final.phase).toBe("CANCELLED")
    expect(beginCalls).toBeGreaterThanOrEqual(1)
    // open should NOT happen after cancellation due to second guard after open success check
    expect(openCalls).toBe(0)
  })
})
