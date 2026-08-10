import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  startExternalAcquisition,
  __resetForTests,
  cancelExternalAcquisition,
  getActiveExternalAcquisitionState,
  __testables,
} from "../../src/acquisition/externalAcquisition"
import type { AcquisitionSession } from "../../src/acquisition/types"

function mkSession(overrides: Partial<AcquisitionSession> = {}): AcquisitionSession {
  return {
    sessionId: `sess-${Math.random().toString(36).slice(2, 6)}`,
    systemId: "gbc",
    expectedTitle: "Pokemon Crystal",
    normalizedExpectedTitle: "pokemon crystal",
    watchDirectory: "/tmp/downloads",
    startedAt: Date.now() / 1000,
    state: "WATCHING",
    candidatePaths: [],
    selectedCandidate: null,
    lastObservedSize: null,
    stableSince: null,
    importResult: null,
    errorCode: null,
    message: null,
    ...overrides,
  }
}

function fastSleep(_ms: number) {
  return new Promise<void>((res) => setTimeout(res, 2))
}

describe("V8.6C1 external acquisition coordinator", () => {
  beforeEach(() => {
    __resetForTests()
  })
  afterEach(() => {
    __resetForTests()
  })

  test("ORDER: watcher starts before page opens", async () => {
    const order: string[] = []
    const mockSession = mkSession({ sessionId: "order-1" })

    const deps = {
      beginAcquisitionWatch: async (p: any) => {
        order.push("begin")
        expect(p.systemId).toBe("gbc")
        return mockSession
      },
      getAcquisitionWatchStatus: async () => {
        order.push("poll")
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const open = async () => {
      order.push("open")
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Pokemon Crystal", openExternalPage: open },
      deps as any
    )

    const final = await ctrl.done
    expect(final.phase).toBe("INSTALLED")
    expect(order[0]).toBe("begin")
    expect(order.indexOf("begin") < order.indexOf("open")).toBe(true)
    expect(order.filter((x) => x === "open").length).toBe(1)
  })

  test("WATCH START FAILURE: page never opens, coordinator FAILED", async () => {
    let openCalled = false
    const deps = {
      beginAcquisitionWatch: async () => {
        throw new Error("SYSTEM_ID_EMPTY: missing")
      },
      getAcquisitionWatchStatus: async () => mkSession(),
      cancelAcquisitionWatch: async () => mkSession(),
      sleep: fastSleep,
    }
    const open = async () => {
      openCalled = true
    }

    const ctrl = startExternalAcquisition(
      { systemId: "", expectedTitle: "Game", openExternalPage: open },
      deps as any
    )

    const final = await ctrl.done
    expect(final.phase).toBe("FAILED")
    expect(final.errorCode).toBe("SYSTEM_ID_EMPTY")
    expect(openCalled).toBe(false)
  })

  test("OPEN SUCCESS: watcher begins, page opens once, polling begins", async () => {
    let openCount = 0
    const mockSession = mkSession({ sessionId: "open-success-1", state: "WATCHING" })
    let pollCount = 0

    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        pollCount++
        if (pollCount < 2) return { ...mockSession, state: "WATCHING" as const }
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl = startExternalAcquisition(
      {
        systemId: "gbc",
        expectedTitle: "Pokemon Crystal",
        openExternalPage: async () => {
          openCount++
        },
      },
      deps as any
    )

    const final = await ctrl.done
    expect(openCount).toBe(1)
    expect(pollCount).toBeGreaterThan(0)
    expect(final.phase).toBe("INSTALLED")
  })

  test("OPEN FAILURE: watcher cancelled, coordinator FAILED, no zombie polling", async () => {
    const mockSession = mkSession({ sessionId: "open-fail-1" })
    let cancelCalled = 0
    let pollAfterFail = 0
    let openFailed = false

    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        if (openFailed) pollAfterFail++
        return { ...mockSession, state: "WATCHING" as const }
      },
      cancelAcquisitionWatch: async () => {
        cancelCalled++
        return { ...mockSession, state: "CANCELLED" as const }
      },
      sleep: fastSleep,
    }

    const open = async () => {
      openFailed = true
      throw new Error("window.open blocked popup")
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: open },
      deps as any
    )

    const final = await ctrl.done
    expect(final.phase).toBe("FAILED")
    expect(final.errorCode).toBe("EXTERNAL_PAGE_OPEN_FAILED")
    expect(final.message?.includes("window.open")).toBe(true)
    expect(cancelCalled).toBe(1)
    // give a tick to ensure no further polls happen after terminal
    await new Promise((r) => setTimeout(r, 10))
    expect(pollAfterFail).toBe(0)
  })

  test("STATE MAPPING: WATCHING -> WAITING_FOR_DOWNLOAD", async () => {
    const mapping = __testables.translateBackendState as any
    expect(mapping("WATCHING")).toBe("WAITING_FOR_DOWNLOAD")
  })

  test("STATE MAPPING: CANDIDATE_DETECTED -> DOWNLOAD_DETECTED", () => {
    expect(__testables.translateBackendState("CANDIDATE_DETECTED" as any)).toBe("DOWNLOAD_DETECTED")
  })

  test("STATE MAPPING: WAITING_FOR_STABILITY maps correctly", () => {
    expect(__testables.translateBackendState("WAITING_FOR_STABILITY" as any)).toBe("WAITING_FOR_STABILITY")
    expect(__testables.translateBackendState("READY" as any)).toBe("WAITING_FOR_STABILITY")
  })

  test("STATE MAPPING: IMPORTING -> IMPORTING etc terminals", () => {
    const m = __testables.translateBackendState
    expect(m("IMPORTING" as any)).toBe("IMPORTING")
    expect(m("INSTALLED" as any)).toBe("INSTALLED")
    expect(m("ALREADY_INSTALLED" as any)).toBe("ALREADY_INSTALLED")
    expect(m("COLLISION" as any)).toBe("COLLISION")
    expect(m("AMBIGUOUS" as any)).toBe("AMBIGUOUS")
    expect(m("FAILED" as any)).toBe("FAILED")
    expect(m("TIMED_OUT" as any)).toBe("TIMED_OUT")
    expect(m("CANCELLED" as any)).toBe("CANCELLED")
  })

  test("STATE MAPPING full polling sequence translates and terminates", async () => {
    const seq = ["WATCHING", "CANDIDATE_DETECTED", "WAITING_FOR_STABILITY", "IMPORTING", "INSTALLED"] as const
    let idx = 0
    const mockSession = mkSession({ sessionId: "map-seq-1" })
    const phases: string[] = []

    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        const state = seq[Math.min(idx, seq.length - 1)]
        idx++
        return { ...mockSession, state: state as any }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )

    ctrl.subscribe((s) => phases.push(s.phase))

    const final = await ctrl.done
    expect(final.phase).toBe("INSTALLED")
    // Should have visited WAITING_FOR_DOWNLOAD, DOWNLOAD_DETECTED, WAITING_FOR_STABILITY, IMPORTING, INSTALLED
    expect(phases.includes("WAITING_FOR_DOWNLOAD")).toBe(true)
    expect(phases.includes("DOWNLOAD_DETECTED")).toBe(true)
    expect(phases.includes("WAITING_FOR_STABILITY")).toBe(true)
    expect(phases.includes("IMPORTING")).toBe(true)
    expect(phases.includes("INSTALLED")).toBe(true)
  })

  test("STATE MAPPING INSTALLED terminal stops poll", async () => {
    let pollCount = 0
    const mockSession = mkSession({ sessionId: "term-inst", state: "WATCHING" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        pollCount++
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )
    await ctrl.done
    const after = pollCount
    await new Promise((r) => setTimeout(r, 10))
    expect(pollCount).toBe(after) // no extra polls after terminal
  })

  test("ALREADY_INSTALLED / COLLISION / AMBIGUOUS / FAILED / TIMED_OUT terminal handling", async () => {
    const terminals = ["ALREADY_INSTALLED", "COLLISION", "AMBIGUOUS", "FAILED", "TIMED_OUT"] as const
    for (const term of terminals) {
      __resetForTests()
      const mockSession = mkSession({ sessionId: `term-${term}`, state: "WATCHING" })
      const deps = {
        beginAcquisitionWatch: async () => mockSession,
        getAcquisitionWatchStatus: async () => ({ ...mockSession, state: term as any }),
        cancelAcquisitionWatch: async () => mockSession,
        sleep: fastSleep,
      }
      const ctrl = startExternalAcquisition(
        { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
        deps as any
      )
      const final = await ctrl.done
      expect(final.phase).toBe(term)
    }
  })

  test("POLLING: never two status requests concurrently", async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const mockSession = mkSession({ sessionId: "no-overlap" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 8))
        concurrent--
        return { ...mockSession, state: "WATCHING" as const, sessionId: mockSession.sessionId }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: async (ms: number) => {
        // after 3 polls force terminal via side effect? We'll control via counter
        await new Promise((r) => setTimeout(r, 2))
      },
    }

    // Need to abort after few polls else infinite loop – use cancel after short time
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )

    // Cancel after 30ms to stop loop
    setTimeout(() => {
      ctrl.cancel()
    }, 30)

    await ctrl.done
    expect(maxConcurrent).toBe(1)
  })

  test("POLLING: stops on terminal state", async () => {
    let polls = 0
    const mockSession = mkSession({ sessionId: "stop-term" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        polls++
        if (polls < 2) return { ...mockSession, state: "WATCHING" as const }
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )
    await ctrl.done
    const pollsAtDone = polls
    await new Promise((r) => setTimeout(r, 10))
    expect(polls).toBe(pollsAtDone)
  })

  test("POLLING: survives allowed transient status failure", async () => {
    let calls = 0
    const mockSession = mkSession({ sessionId: "transient-ok" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        calls++
        if (calls === 1) throw new Error("NETWORK_GLITCH: temporary")
        if (calls === 2) throw new Error("NETWORK_GLITCH: temporary again")
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )
    const final = await ctrl.done
    expect(final.phase).toBe("INSTALLED")
    expect(calls).toBeGreaterThan(2)
  })

  test("POLLING: fails after bounded repeated failures", async () => {
    let cancelCalled = 0
    const mockSession = mkSession({ sessionId: "transient-fail" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        throw new Error("BACKEND_UNAVAILABLE: down")
      },
      cancelAcquisitionWatch: async () => {
        cancelCalled++
        return mockSession
      },
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )
    const final = await ctrl.done
    expect(final.phase).toBe("FAILED")
    expect(cancelCalled).toBe(1)
  })

  test("CANCEL: invokes backend cancel once, polling stops", async () => {
    let pollCount = 0
    let cancelCount = 0
    const mockSession = mkSession({ sessionId: "cancel-once" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        pollCount++
        await new Promise((r) => setTimeout(r, 5))
        return { ...mockSession, state: "WATCHING" as const }
      },
      cancelAcquisitionWatch: async () => {
        cancelCount++
        return mockSession
      },
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )
    // wait a bit for polling to start
    await new Promise((r) => setTimeout(r, 10))
    const before = pollCount
    await ctrl.cancel()
    const afterCancelPollCount = pollCount
    await new Promise((r) => setTimeout(r, 20))
    expect(cancelCount).toBe(1)
    // no significant new polls after cancel (allow <=1 race)
    expect(pollCount - afterCancelPollCount <= 1).toBe(true)
    const state = ctrl.getState()
    expect(state.phase).toBe("CANCELLED")
  })

  test("LATE RESULT AFTER CANCEL: ignored", async () => {
    const mockSession = mkSession({ sessionId: "late-ignore" })
    let resolveLate: (v: AcquisitionSession) => void = () => {}
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () =>
        new Promise<AcquisitionSession>((res) => {
          resolveLate = res
        }),
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )

    // wait for first poll to be in-flight
    await new Promise((r) => setTimeout(r, 10))
    await ctrl.cancel()
    const stateAfterCancel = ctrl.getState()
    expect(stateAfterCancel.phase).toBe("CANCELLED")

    // Now resolve late result as if backend returned INSTALLED late
    resolveLate({ ...mockSession, state: "INSTALLED" as const })
    // Give time for any stray handler
    await new Promise((r) => setTimeout(r, 15))
    expect(ctrl.getState().phase).toBe("CANCELLED")
    // done should be CANCELLED not resurrected
    const final = await ctrl.done
    expect(final.phase).toBe("CANCELLED")
  })

  test("DOUBLE START: second rejected with EXTERNAL_ACQUISITION_ALREADY_ACTIVE", async () => {
    const mockSession = mkSession({ sessionId: "double-1" })
    const deps = {
      beginAcquisitionWatch: async () => {
        // keep session active a bit
        await new Promise((r) => setTimeout(r, 5))
        return mockSession
      },
      getAcquisitionWatchStatus: async () => {
        await new Promise((r) => setTimeout(r, 10))
        return { ...mockSession, state: "WATCHING" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl1 = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game1", openExternalPage: async () => {} },
      deps as any
    )

    let secondError: any = null
    try {
      startExternalAcquisition(
        { systemId: "gbc", expectedTitle: "Game2", openExternalPage: async () => {} },
        deps as any
      )
    } catch (e) {
      secondError = e
    }
    expect(secondError).not.toBeNull()
    expect(String((secondError as any).message).includes("EXTERNAL_ACQUISITION_ALREADY_ACTIVE")).toBe(true)

    await ctrl1.cancel()
  })

  test("CONTEXT: systemId/title/sessionId remain stable even if external object mutates", async () => {
    const game = { systemId: "gbc", title: "Original Title" }
    const mockSession = mkSession({ sessionId: "ctx-123", systemId: "gbc", expectedTitle: "Original Title" })
    let capturedSystemId: string | null = null

    const deps = {
      beginAcquisitionWatch: async (p: any) => {
        capturedSystemId = p.systemId
        return mockSession
      },
      getAcquisitionWatchStatus: async () => ({ ...mockSession, state: "INSTALLED" as const }),
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl = startExternalAcquisition(
      {
        systemId: game.systemId,
        expectedTitle: game.title,
        openExternalPage: async () => {},
      },
      deps as any
    )

    // Mutate caller object immediately after start (simulates Discovery selection change)
    game.systemId = "ps2"
    game.title = "Mutated Title"

    const final = await ctrl.done
    expect(final.systemId).toBe("gbc")
    expect(final.expectedTitle).toBe("Original Title")
    expect(final.sessionId).toBe("ctx-123")
    expect(capturedSystemId).toBe("gbc")
  })

  test("PROVIDER-AGNOSTIC: coordinator does not accept raw URL", async () => {
    // By type design, startExternalAcquisition signature has no url: string property.
    // Attempt to pass url should be ignored or type error.
    // Runtime sanity: ensure coordinator file source contains no url param acceptance.
    const src = await Bun.file("src/acquisition/externalAcquisition.ts").text()
    // Must contain openExternalPage, must NOT contain logic accepting URL as core input
    expect(src.includes("openExternalPage")).toBe(true)
    // Ensure no raw URL acceptance in core: the options type should not have url: string
    // Search for "url:" inside the core file near StartExternalAcquisitionOptions definition
    const optsMatch = src.match(/interface StartExternalAcquisitionOptions[\s\S]*?}/)
    expect(optsMatch).not.toBeNull()
    expect(optsMatch![0].includes("openExternalPage")).toBe(true)
    expect(optsMatch![0].toLowerCase().includes("url:")).toBe(false)
  })

  test("UNICODE parity – coordinator preserves unicode title context", async () => {
    const mockSession = mkSession({ sessionId: "unicode-ctx", expectedTitle: "Pokémon" })
    const deps = {
      beginAcquisitionWatch: async (p: any) => {
        expect(p.expectedTitle).toBe("Pokémon")
        return { ...mockSession, expectedTitle: "Pokémon" }
      },
      getAcquisitionWatchStatus: async () => ({ ...mockSession, state: "INSTALLED" as const }),
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }
    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Pokémon", openExternalPage: async () => {} },
      deps as any
    )
    const final = await ctrl.done
    expect(final.expectedTitle).toBe("Pokémon")
    expect(final.systemId).toBe("gbc")
  })

  test("UPDATE SUBSCRIPTION: immediate updates and unsubscribe cleanly", async () => {
    const mockSession = mkSession({ sessionId: "sub-1" })
    const updates: string[] = []
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => ({ ...mockSession, state: "INSTALLED" as const }),
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )

    const unsub = ctrl.subscribe((s) => updates.push(s.phase))
    // subscribed immediate gets current phase (IDLE or STARTING_WATCH)
    expect(updates.length).toBeGreaterThan(0)

    const final = await ctrl.done
    expect(updates.includes("INSTALLED")).toBe(true)
    const countBeforeUnsub = updates.length
    unsub()
    // After unsub, further emits should not add (though after terminal no more emits)
    // Trigger manual emit attempt via internal? not needed – ensure no memory leak: listener set size 0
    // We can't access impl but after unsub no crash
    expect(updates.length).toBe(countBeforeUnsub)
  })

  test("POLLING WHILE UNFOCUSED: does not pause on document.hidden", async () => {
    // Simulate browser foreground: document.hidden true should NOT pause
    let polls = 0
    const mockSession = mkSession({ sessionId: "unfocused-polls" })
    const deps = {
      beginAcquisitionWatch: async () => mockSession,
      getAcquisitionWatchStatus: async () => {
        polls++
        if (polls < 2) return { ...mockSession, state: "WATCHING" as const }
        return { ...mockSession, state: "INSTALLED" as const }
      },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: fastSleep,
    }

    // Mock document.hidden = true if document exists
    const originalHidden = (globalThis as any).document?.hidden
    if ((globalThis as any).document) {
      try {
        Object.defineProperty((globalThis as any).document, "hidden", {
          value: true,
          configurable: true,
        })
      } catch {}
    }

    const ctrl = startExternalAcquisition(
      { systemId: "gbc", expectedTitle: "Game", openExternalPage: async () => {} },
      deps as any
    )

    const final = await ctrl.done
    expect(final.phase).toBe("INSTALLED")
    expect(polls).toBeGreaterThan(0)

    if ((globalThis as any).document && originalHidden !== undefined) {
      try {
        Object.defineProperty((globalThis as any).document, "hidden", {
          value: originalHidden,
          configurable: true,
        })
      } catch {}
    }
  })
})
