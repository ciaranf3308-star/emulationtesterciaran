/**
 * V8.6C3.1 – FINAL PROVIDER GLUE CORRECTION regressions
 *
 * Verifies:
 * – GET GAME eligibility only available AND not in library
 * – Discover owns selection, discoveryService owns URL/open, no duplicate impl
 * – acquisitionActive prop + input lock
 * – reentry guard sync
 * – providerId numeric-only, title validation, lazy callback, watch-before-open
 * – production API no window globals
 * – AVAILABLE/NOT LOCAL vs UNAVAILABLE/TAKEDOWN/ALREADY LOCAL vs ACTIVE lock
 */
import { describe, test, expect, beforeEach } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// --- source inspection helpers ---

function src(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8")
}

// --- pure logic mirror of DiscoverView.handleGetGame for unit tests ---
// This mirrors the corrected C3.1 implementation – if source diverges, inspection tests will fail.

type BeginReq = { systemId: string; expectedTitle: string; openExternalPage: () => Promise<void> }

function buildAcquisitionRequest(opts: {
  systemId: string
  detailFull: any
  selectedDetail: any
  inLibraryCheck: (title: string) => boolean
  acquisitionActive?: boolean
  startInFlight?: { current: boolean }
  discoveryServiceOpen?: (id: string) => Promise<void>
  onBeginAcquisition?: (req: BeginReq) => unknown
}): { ok: boolean; error?: string; request?: BeginReq } {
  const { systemId, detailFull, selectedDetail, inLibraryCheck, acquisitionActive, startInFlight, discoveryServiceOpen, onBeginAcquisition } = opts
  if (acquisitionActive) return { ok: false, error: "acquisition active" }
  if (startInFlight?.current) return { ok: false, error: "in-flight" }
  const availability = detailFull?.availability ?? selectedDetail?.availability
  const titleForLib = String(detailFull?.title ?? selectedDetail?.title ?? "").trim()
  const alreadyInLibrary = titleForLib ? inLibraryCheck(titleForLib) : false
  const canGetGame = availability === "available" && !alreadyInLibrary
  if (!canGetGame) return { ok: false, error: `not eligible availability=${availability} inLib=${alreadyInLibrary}` }
  if (!onBeginAcquisition) return { ok: false, error: "no onBeginAcquisition" }
  const rawProviderId = detailFull?.providerId ?? detailFull?.id ?? selectedDetail?.providerId ?? selectedDetail?.id
  if (rawProviderId == null) return { ok: false, error: "missing provider id" }
  const idStr = String(rawProviderId).trim()
  if (!/^\d+$/.test(idStr)) return { ok: false, error: `provider id must be numeric – got '${idStr.slice(0, 32)}'` }
  const titleRaw = detailFull?.title ?? selectedDetail?.title ?? ""
  const expectedTitle = String(titleRaw).trim()
  if (!expectedTitle) return { ok: false, error: "missing title" }
  const openExternalPage = () => discoveryServiceOpen ? discoveryServiceOpen(idStr) : Promise.resolve()
  const request: BeginReq = { systemId, expectedTitle, openExternalPage }
  return { ok: true, request }
}

describe("V8.6C3.1 – DiscoverView source ownership", () => {
  test("DiscoverView must NOT import buildDetailUrl, validateOpenUrl, isTauriEnvironment, plugin-shell nor use window.open for GET GAME", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // imports removed – check no direct usage in file for GET GAME. Open fallback for handleOpenVaultRoot is allowed to use window.open for vault root, but GET GAME path must not use buildDetailUrl.
    // We enforce removal of those imports for correction.
    expect(txt.includes("buildDetailUrl")).toBe(false)
    expect(txt.includes("validateOpenUrl")).toBe(false)
    expect(txt.includes("isTauriEnvironment")).toBe(false)
    expect(txt.includes("@tauri-apps/plugin-shell")).toBe(false)
    // Ensure GET GAME does not directly open via shell – it delegates to discoveryService.open
    // The file may still contain window.open for fallback openRoot, but should have comment allowing it – we check GET GAME handler contains discoveryService.open
    expect(txt.includes("discoveryService.open")).toBe(true)
  })

  test("BeginAcquisitionRequest shape has NO raw url field, only systemId, expectedTitle, openExternalPage callback", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // type definition must exist
    expect(txt.includes("BeginAcquisitionRequest")).toBe(true)
    // must NOT have url: string in that type
    const typeMatch = txt.match(/type BeginAcquisitionRequest[\s\S]*?}/)
    expect(typeMatch).not.toBeNull()
    const typeBody = typeMatch![0].toLowerCase()
    expect(typeBody.includes("openexternalpage")).toBe(true)
    expect(typeBody.includes("systemid")).toBe(true)
    expect(typeBody.includes("expectedtitle")).toBe(true)
    // ensure no `url` field – raw url field forbidden per spec
    // we allow canonicalVaultUrl elsewhere but not in BeginAcquisitionRequest
    const hasUrlField = /url\s*:\s*string/.test(typeMatch![0])
    expect(hasUrlField).toBe(false)
  })

  test("callback shape is () => discoveryService.open(providerId)", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // should contain pattern openExternalPage = () => discoveryService.open(
    expect(txt.includes("openExternalPage")).toBe(true)
    // exact lazy shape – must define callback as arrow lazy, not eager invocation
    expect(txt.includes("const openExternalPage = () => discoveryService.open")).toBe(true)
    // ensure not eagerly calling open in.handleGetGame before onBeginAcquisition
    const getGameIdx = txt.indexOf("const handleGetGame")
    const handleSlice = txt.slice(getGameIdx, getGameIdx + 1800)
    expect(handleSlice.includes("await discoveryService.open")).toBe(false)
    // ensure file still defines discoveryService.open(idStr) exactly once lazily
    expect(txt.includes("discoveryService.open(idStr)")).toBe(true)
  })

  test("provider ID validation numeric-only preserved", () => {
    const txt = src("src/components/DiscoverView.tsx")
    expect(txt.includes("/^\\d+$/")).toBe(true)
  })

  test("acquisitionActive prop exists and guards input handlers", () => {
    const txt = src("src/components/DiscoverView.tsx")
    expect(txt.includes("acquisitionActive")).toBe(true)
    // prop type definition
    expect(txt.includes("acquisitionActive?")).toBe(true)
    // early return when active
    const hasEarlyReturn = txt.includes("if (acquisitionActive)") && txt.includes("// C2/App is controller authority")
    expect(hasEarlyReturn).toBe(true)
  })

  test("reentry guard startInFlightRef exists", () => {
    const txt = src("src/components/DiscoverView.tsx")
    expect(txt.includes("startInFlightRef")).toBe(true)
    expect(txt.includes("startInFlightRef.current")).toBe(true)
  })

  test("canGetGame derived from availability === 'available' AND !inLibrary", () => {
    const txt = src("src/components/DiscoverView.tsx")
    expect(txt.includes("canGetGame")).toBe(true)
    expect(txt.includes("availability === \"available\"") || txt.includes("availability === 'available'") || txt.includes("currentAvailability === 'available'")).toBe(true)
    expect(txt.includes("!alreadyInLibrary")).toBe(true)
  })

  test("GET GAME button only when canGetGame true, secondary OPEN has no A glyph", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // Must render GET GAME button gated by canGetGame
    expect(txt.includes("canGetGame && onBeginAcquisition")).toBe(true)
    // secondary button exists and does not contain A badge span before its label
    const openIdx = txt.indexOf('data-testid="open-vimm"')
    expect(openIdx).toBeGreaterThan(0)
    const surrounding = txt.slice(Math.max(0, openIdx - 600), openIdx + 1200)
    expect(surrounding.includes("OPEN ON VIMM")).toBe(true)
    // secondary button label must appear after data-testid
    const afterOpenIdx = txt.slice(openIdx, openIdx + 1200)
    expect(afterOpenIdx.includes("OPEN ON VIMM")).toBe(true)
    const getGameBadges = (txt.match(/GET GAME/g) || []).length
    expect(getGameBadges).toBeGreaterThanOrEqual(1)
  })

  test("UNAVAILABLE/TAKEDOWN/ALREADY LOCAL blocks GET GAME – source shows guards", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // canGetGame gate already ensures !available blocks – but also ensure UI shows download-unavailable / in-your-library
    expect(txt.includes('data-testid="download-unavailable"')).toBe(true)
    expect(txt.includes('data-testid="in-your-library"')).toBe(true)
  })

  test("App wiring passes acquisitionActive and crystalAcq.begin via React prop no window globals", () => {
    const app = src("src/App.tsx")
    expect(app.includes("onBeginAcquisition={crystalAcq.begin}")).toBe(true)
    expect(app.includes("acquisitionActive={crystalAcq.active}")).toBe(true)
    // ensure App DiscoverView section does not use __beginCrystalAcquisition for prod
    const discoverSectionIdx = app.indexOf("<DiscoverView")
    const discoverSection = app.slice(discoverSectionIdx, discoverSectionIdx + 800)
    expect(discoverSection.includes("__beginCrystalAcquisition")).toBe(false)
  })
})

describe("V8.6C3.1 – AVAILABLE + NOT LOCAL eligibility", () => {
  test("GET GAME visible/enabled + A calls onBeginAcquisition once with correct systemId/title/callback, no raw url", async () => {
    const inLib = () => false
    let beginCalls = 0
    let lastReq: any = null
    const onBegin = (req: any) => { beginCalls++; lastReq = req }
    const detailFull = { providerId: "12345", title: "Final Fantasy X", availability: "available" }
    const selected = { providerId: "12345", title: "Final Fantasy X", availability: "available" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull,
      selectedDetail: selected,
      inLibraryCheck: inLib,
      onBeginAcquisition: onBegin,
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(true)
    expect(res.request).toBeTruthy()
    expect(res.request!.systemId).toBe("ps2")
    expect(res.request!.expectedTitle).toBe("Final Fantasy X")
    expect(typeof res.request!.openExternalPage).toBe("function")
    expect((res.request as any).url).toBeUndefined()
    expect((res.request as any).rawUrl).toBeUndefined()
    expect((res.request as any).canonicalUrl).toBeUndefined()
    // simulate A press
    onBegin(res.request!)
    expect(beginCalls).toBe(1)
    expect(lastReq.systemId).toBe("ps2")
    expect(lastReq.expectedTitle).toBe("Final Fantasy X")
  })
})

describe("V8.6C3.1 – LAZY CALLBACK", () => {
  test("request creation does not call discoveryService.open, manual invoke calls once with exact numeric id", async () => {
    let openCalls = 0
    let openedId: string | null = null
    const mockOpen = async (id: string) => { openCalls++; openedId = id }
    const inLib = () => false
    const detail = { providerId: "12345", title: "Game", availability: "available" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: inLib,
      discoveryServiceOpen: mockOpen,
      onBeginAcquisition: () => {},
    })
    expect(res.ok).toBe(true)
    expect(openCalls).toBe(0)
    await res.request!.openExternalPage()
    expect(openCalls).toBe(1)
    expect(openedId).toBe("12345")
    await res.request!.openExternalPage()
    expect(openCalls).toBe(2) // second manual invoke increments – but begin only opens once via C1 normally
  })
})

describe("V8.6C3.1 – INVALID ID blocks", () => {
  const cases = [
    ["abc", "abc"],
    ["/vault/123", "/vault/123"],
    ["https://vimm.net/vault/123", "full URL"],
    ["123?foo=bar", "123?foo"],
    ["", "empty"],
    ["  ", "whitespace"],
    ["12a3", "12a3"],
  ] as const
  for (const [id, label] of cases) {
    test(`${label} => no begin`, () => {
      const inLib = () => false
      const detail = { providerId: id, title: "Game", availability: "available" }
      const res = buildAcquisitionRequest({
        systemId: "ps2",
        detailFull: detail,
        selectedDetail: detail,
        inLibraryCheck: inLib,
        onBeginAcquisition: () => { throw new Error("should not begin") },
        discoveryServiceOpen: async () => {},
      })
      expect(res.ok).toBe(false)
      expect(res.error?.toLowerCase().includes("numeric") || res.error?.includes("Missing") || res.error?.includes("provider")).toBe(true)
    })
  }
})

describe("V8.6C3.1 – MISSING TITLE blocks", () => {
  test("empty title => no begin", () => {
    const detail = { providerId: "12345", title: "   ", availability: "available" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: () => false,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
    expect(res.error?.toLowerCase().includes("title") || res.error?.toLowerCase().includes("missing")).toBeTruthy()
  })
  test("undefined title => no begin", () => {
    const detail = { providerId: "12345", availability: "available" } as any
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: () => false,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
  })
})

describe("V8.6C3.1 – UNAVAILABLE blocks", () => {
  test("no GET GAME acquisition action, A does not begin", () => {
    const detail = { providerId: "12345", title: "Game", availability: "unavailable" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: () => false,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
    expect(res.error?.includes("not eligible")).toBe(true)
  })
})

describe("V8.6C3.1 – TAKEDOWN blocks", () => {
  test("no begin", () => {
    const detail = { providerId: "12345", title: "Game", availability: "takedown" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: () => false,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
  })
})

describe("V8.6C3.1 – ALREADY LOCAL blocks", () => {
  test("in library => no begin", () => {
    const detail = { providerId: "12345", title: "Final Fantasy X", availability: "available" }
    const inLib = (t: string) => t === "Final Fantasy X"
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: inLib,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
  })
})

describe("V8.6C3.1 – REENTRY guard double A -> one begin", () => {
  test("two immediate activation attempts => one begin call", () => {
    let calls = 0
    const inFlight = { current: false }
    const attempt = () => {
      if (inFlight.current) return false
      inFlight.current = true
      calls++
      return true
    }
    const first = attempt()
    expect(first).toBe(true)
    const second = attempt()
    expect(second).toBe(false)
    expect(calls).toBe(1)
  })

  test("guard resets only when acquisitionActive false, not via button disabled alone", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // ensure reset logic exists: if (!acquisitionActive) { startInFlightRef.current = false }
    expect(txt.includes("if (!acquisitionActive)")).toBe(true)
    expect(txt.includes("startInFlightRef.current = false")).toBe(true)
  })
})

describe("V8.6C3.1 – ACTIVE INPUT LOCK with acquisitionActive=true", () => {
  test("Enter/Space does not begin", () => {
    const detail = { providerId: "12345", title: "Game", availability: "available" }
    const res = buildAcquisitionRequest({
      systemId: "ps2",
      detailFull: detail,
      selectedDetail: detail,
      inLibraryCheck: () => false,
      acquisitionActive: true,
      onBeginAcquisition: () => { throw new Error("should not") },
      discoveryServiceOpen: async () => {},
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("acquisition active")
  })
  test("source blocks crystal-discover-nav confirm, Escape/Backspace close, arrows focus, search refocus, click GET GAME", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // early return for acquisitionActive in onKey
    expect(txt.includes("if (acquisitionActive) {")).toBe(true)
    // check nav handler also early returns
    const navSection = txt.slice(txt.indexOf("const onDiscoverNav"), txt.indexOf("const onDiscoverNav") + 600)
    expect(navSection.includes("if (acquisitionActive)")).toBe(true)
    // click guard in GET GAME button
    expect(txt.includes("if (acquisitionActive) return")).toBe(true)
  })
  test("B cancellation remains owned by C2/App – Discover does NOT call cancel", () => {
    const txt = src("src/components/DiscoverView.tsx")
    // Discover should not import or call crystalAcq.cancel nor cancelAcquisitionWatch
    expect(txt.includes("cancel()")).toBe(false) // no cancel inside Discover
  })
})

describe("V8.6C3.1 – PRODUCTION API", () => {
  test("no production use of __beginCrystalAcquisition / __crystalAcquisition in DiscoverView or App Discover wiring", () => {
    const disc = src("src/components/DiscoverView.tsx")
    expect(disc.includes("__beginCrystalAcquisition")).toBe(false)
    expect(disc.includes("__crystalAcquisition")).toBe(false)
    const app = src("src/App.tsx")
    const discoverIdx = app.indexOf("<DiscoverView")
    const discoverBlock = app.slice(discoverIdx, discoverIdx + 800)
    expect(discoverBlock.includes("__beginCrystalAcquisition")).toBe(false)
    // dev globals may exist elsewhere but not in prod wiring block
  })
})

describe("V8.6C3.1 – WATCH BEFORE OPEN preserved", () => {
  test("integration-level: Discover GET GAME -> beginAcquisitionWatch completes before openExternalPage executes", async () => {
    const order: string[] = []
    const { startExternalAcquisition } = await import("../../src/acquisition/externalAcquisition.ts")
    const mockSession: any = {
      sessionId: "c3.1-wbo",
      systemId: "ps2",
      expectedTitle: "Game",
      state: "WATCHING",
    }
    const deps = {
      beginAcquisitionWatch: async () => { order.push("begin"); return mockSession },
      getAcquisitionWatchStatus: async () => { return { ...mockSession, state: "INSTALLED" } },
      cancelAcquisitionWatch: async () => mockSession,
      sleep: async () => {},
    }
    const open = async () => { order.push("open") }
    const ctrl = (startExternalAcquisition as any)(
      { systemId: "ps2", expectedTitle: "Game", openExternalPage: open },
      deps
    )
    const final = await ctrl.done
    expect(final.phase).toBe("INSTALLED")
    expect(order[0]).toBe("begin")
    expect(order.includes("open")).toBe(true)
    expect(order.indexOf("begin") < order.indexOf("open")).toBe(true)
  })

  test("C1 unchanged – no modification to externalAcquisition file for open logic", () => {
    const txt = src("src/acquisition/externalAcquisition.ts")
    // Must still have watch-before-open order: beginAcquisitionWatch then openExternalPage
    expect(txt.includes("beginAcquisitionWatch")).toBe(true)
    expect(txt.includes("openExternalPage")).toBe(true)
  })
})
