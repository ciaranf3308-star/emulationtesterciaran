# Crystal Discovery — Vimm's Lair Provider

**Milestone:** V8.4 — Crystal Discovery
**Version:** 4.4.0
**Provider #1:** Vimm's Lair (catalog reference only)

---

## Feature Architecture

Crystal Discovery adds an optional external catalog layer around Crystal's proven local library. It is NOT a storefront marketplace, NOT an iframe of Vimm, NOT a browser, NOT a ROM manager.

Core flow:

```
SystemLanding / Library (local truth)
   └─ [Y] DISCOVER (secondary, free controller action)
       └─ DiscoverView (full native 1920x1080 / 1140x648 logical)
           ├─ Search (large field, prefill from selected local game normalized)
           ├─ Results (Crystal cards, not HTML rows)
           └─ Detail (native, IN YOUR LIBRARY comparison)
               └─ [A] OPEN ON VIMM'S LAIR -> Tauri shell open canonical public URL
```

Local library remains primary. Discovery is optional, never blocks boot.

### Files

```
src/discovery/
  types.ts                 — DiscoveryResult, Detail, Availability, CacheEntry, ParserError, TTL constants
  catalogProvider.ts       — CatalogProvider interface (id, name, supportsSystem, search, getDetail, buildExternalUrl)
  discoveryService.ts      — Rate limiting, cache-first, 429 backoff, stale abort, Tauri fetch_vimm wrapper
  titleNormalizer.ts       — normalizeTitle() display preserved + lookup normalized
  cache.ts                 — %LOCALAPPDATA%/CrystalFrontend/cache/discovery/*.json TTL 20m search / 24h detail
  providers/vimm/
    VimmProvider.ts        — CatalogProvider impl id='vimms', host validation, spacing 750ms, timeout 10s
    vimmRoutes.ts          — buildVaultRoot, buildSearchUrl(system,q), buildDetailUrl(id), parseIdFromUrl
    vimmSystemMap.ts       — Crystal -> Vimm token map, unsupported explicit (steam)
    parseVimmSearch.ts     — robust parser version 1.0.0 — canonical href /vault/{id}, DOMParser > regex fallback
    parseVimmDetail.ts     — detail version 1.0.0 — h1, system breadcrumb, label discovery, disc/media
    hostValidation.ts      — only https://vimm.net allowed, reject http/arbitrary
    redirect.ts            — same-host redirect only
    normalize.ts           — region/disc/rev stripping iterative
    types.ts               — parser version constants
    cache.ts               — cache TTL + path guard mirror of V8.1 safety

src-tauri/src/discovery.rs — Tauri command fetch_vimm(url: String) -> Result<String,String> with host/scheme/path guard, reqwest 10s timeout, custom redirect only vimm.net, logs provider/route/status only.

src/lib/
  discoveryService.ts      — Facade used by UI (graceful degrade to dev synthetic)
  discoveryMatching.ts     — isInLibrary() conservative normalized title + system equality, never loose

src/components/DiscoverView.tsx — Full native screen 1920x1080 / 1140x648 DPI safe, heavily defocused bg blur(30px) saturate(0.82) brightness(0.68), Canvas console identity, header DISCOVER + VIMM'S LAIR badge, no orange vault aesthetic, no shop/cart/price.
```

---

## Provider Abstraction

```ts
interface CatalogProvider {
  id: string                 // 'vimms'
  name: string               // "Vimm's Lair"
  supportsSystem(systemId: string): boolean
  search(systemId:string, query:string, opts?:{signal}): Promise<DiscoveryResult[]>
  getDetail(id:string, systemId?: string): Promise<DiscoveryGameDetail>
  buildExternalUrl(id:string): string // canonical https://vimm.net/vault/{ID}
}
```

Vimm is provider #1. No other provider added now, but interface capable of supporting another source later (e.g., local metadata provider) by adding another impl.

Do NOT hardwire Vimm logic throughout App.tsx — DiscoveryService mediates via provider interface.

---

## Public URL Construction

Only canonical public page URLs are constructed/opened.

- Vault root: `https://vimm.net/vault`
- Search: `https://vimm.net/vault/?p=list&system={SYSTEM_TOKEN}&q={URL_ENCODED_QUERY}`
  - encoding via `encodeURIComponent`
  - empty query omits q param (list all for system)
- Detail: `https://vimm.net/vault/{NUMERIC_ID}` – numeric only, validated `^\d+$`

No direct file-download URL derivation, no form-auto-submit, no hidden media URL reconstruction.

---

## Supported Systems

Crystal 19 populated IDs → Vimm token mapping conservative (see schema doc table). Currently supported tokens: PS2, PSX, PSP, N64, SNES, GB, GBC, GBA, DS (NDS), GameCube, Dreamcast, Genesis (both genesis+megadrive distinct keys), Wii, WiiU, Xbox, Xbox360. n3ds marked unsupported pending re-audit (Vimm token 3DS exists but mapping needs live verification). steam explicitly unsupported.

**Unsupported handling:** UI shows:

```
Vimm's Lair does not currently catalogue this platform.
```

No substitution.

Genesis vs Mega Drive remain distinct inside Crystal even if Vimm represents both as Genesis — mapping layer keeps separate keys.

---

## Caching

- **Search cache:** TTL 20 minutes default (range 15-30 min). Key `vimms:{system}:{query}`. Stored under `%LOCALAPPDATA%\CrystalFrontend\cache\discovery\{sanitized}.json`. In-memory MAP + Tauri fs + localStorage fallback. Pruned on expiry.
- **Detail cache:** TTL 24h (86_400_000 ms). Key `vimms:detail:{id}`.
- **Cache layer reuse V8.1 safety:** writes only under AppLocalData/cache/discovery, path-traversal rejected (`..` forbidden), EmuDeck/ES-DE/ROM path fragments forbidden.
- **Short-lived search** encourages fresh but gentle on Vimm. **Longer detail** preserves bandwidth.

Config:

```ts
SEARCH_TTL_MS_DEFAULT = 20*60*1000
DETAIL_TTL_MS = 24*60*60*1000
```

---

## Rate Limiting / Site Respect

- Debounce search input 300-350ms (UI)
- One active search per provider – monotonic request token, abort previous via AbortController
- Stale search cancellation – cancel/ignore stale via token compare
- Min request spacing ~750ms where practical – lastFetchMs tracking in VimmProvider + DiscoveryService enforceSpacing
- Request timeout 10s
- 429 handling: exponential backoff 800ms * 2^attempt up to 8s, max 3 retries
- Short-lived result cache avoids re-hit same q rapidly
- Longer detail cache avoids re-hit same page
- Do NOT bulk-crawl entire catalog
- Do NOT preload thousands of detail pages
- No video/media blocking – thumbnails async, text first

All cache only under Crystal approved app-data tree.

---

## Failure Fallback

- Network offline / Tauri fetch error → `VIMM'S LAIR UNAVAILABLE` elegant empty state with CTA `OPEN VIMM'S LAIR IN BROWSER` (vault root)
- Schema change → structured ParserError `{provider, routeType, httpStatus, parserVersion, message}` logged minimal (no huge HTML), UI shows `CATALOG FORMAT CHANGED — OPEN VIMM'S LAIR IN BROWSER`
- Takedown/unavailable preserved: UI badge `CATALOG ENTRY AVAILABLE / DOWNLOAD AVAILABILITY: UNAVAILABLE` – external detail still opens.
- Unsupported system → explicit message.
- Detail fail → desc optional, year optional etc – graceful null handling.
- Never crashes, never hangs startup, never makes core library depend on Vimm. Discovery optional.

---

## Privacy

Search requests contain ONLY:

- platform token
- game query (display title stripped for lookup but only title text from user typed/prefilled)

Do NOT send:

- ROM paths
- Windows username
- gamelist paths
- play history
- favorites
- machine config
- hashes of local ROMs

No tracking, no analytics.

---

## Acquisition Boundary

**MUST BE NO automated ROM download.**

- Do NOT derive/use Vimm direct file download endpoints
- Do NOT submit download forms automatically
- Do NOT bypass takedown/unavailable messages
- Do NOT bypass CAPTCHA, Cloudflare, rate limits
- Do NOT reconstruct hidden media download URLs
- Do NOT automatically place ROMs into EmuDeck
- Do NOT automatically unzip/install copyrighted files
- Do NOT modify ROM directories

Primary external action is `OPEN ON VIMM'S LAIR` via shell open canonical public detail page. If user chooses to continue on external site, that's visible in their normal browser.

Preserve Vimm availability/takedown messages accurately.

---

## Local Library Matching

READ-ONLY, never mutates ES-DE gamelist.

- Uses `systemId` + `normalizedTitle` comparison via `normalizeTitle()` which:
  - NFKD strip diacritics
  - lower-case
  - remove `(USA)` `[Europe]` bracketed regions
  - disc numbers `Disc 1` etc
  - revision `Rev 1`
  - parenthesized ROM metadata `(En,Ja)`
  - punctuation → space, collapse spaces
- Keep display title intact for UI rendering
- Conservative: only `IN YOUR LIBRARY` when exact normalized equality or strong containment with tight token Jaccard >=0.85 and length diff ≤3.
- Otherwise `NOT IN YOUR LIBRARY`.
- Secondary token match optional but conservative never marks installed loosely similar.

---

## How to Update Parser if Vimm HTML Changes

1. Re-run live audit: probe `https://vimm.net/vault/?p=list&system=PS2&q=mario` and `https://vimm.net/vault/46589`, capture small snippets (~20 lines) locally (do NOT commit huge pages, do NOT commit session cookies).
2. Increment parser version constant in `src/discovery/providers/vimm/types.ts` (`VIMM_PARSER_VERSION_SEARCH` / `DETAIL`) e.g. 1.0.0 → 1.1.0.
3. Update `parseVimmSearch.ts` / `parseVimmDetail.ts` selectors:
   - Prefer canonical href pattern `/vault/{numeric}` for search rows
   - Prefer semantic labels `Publisher:`, `Developer:` etc via nearest `th`/`td` scan over nth-child.
   - Keep thumbnail only if `img[src]` https and adjacent.
4. Update schema doc date + DOM structure sections.
5. Add test fixtures reflecting new structure (small synthetic <50 lines).
6. Run `bun test` parser tests — they must pass new fixtures and reject old malformed as fallback.
7. Do NOT add download URL extraction.

If Vimm changes to full JS CSR, our parser will detect schema change (no vault anchors) → returns empty + sets `schemaChanged` flag for UI fallback. Consider adding fallback CTA `OPEN VIMM'S LAIR IN BROWSER` in that case.

---

## Controller / DPI

- System Landing: existing L/R system, A enter library, **Y free?** According to input map `y` currently mapped to `favorite`. But gamepad 2 is `favorite`, 3 is `menu`. Search is free (button 8). For Discovery we allocate:

  - Keyboard `y` currently favorite — preserve — Discover via secondary pill click or menu? To honor spec "If Y is free on System Landing, a direction like [Y] DISCOVER is acceptable. If it is not free, use another sensible unused controller action."

  - Since Y = favorite, free action is `search` (keyboard `/` and gamepad button 8). So Discover entry uses `[SEARCH]` or secondary button UI labeled `DISCOVER`. Implementation chooses secondary boutique button `[Y] DISCOVER` UI pill but binds to `search` action (gamepad view-select) – actually Y is favorite, so we bind DISCOVER to `search` action to keep distinct, allowing both favorite and discovery.

  - Simpler: secondary entry from System Landing via bottom-left utility rail additional pill `DISCOVER` clickable and controller search action.

- Settings exposure: Settings → Discover entry opens discovery.

- Discover screen controller: D-pad navigate results, A open detail, B back to system, X focus search edit.

- ROG logical DPI 1140×648 — top chrome 84px, search 60px, results grid no clipped CTA, scroll focus-follow ensures no hidden controls.

- Light/dark — premium theme tokens: dark `#0a0a0f` bg, light `#f6f8fd`, same blur overlay different opacity.

---

## Safety Notes

- V8.1 safety preserved: write-root guard `crystal_writable_root()` + `is_safe_write_path` rejects traversal/EmuDeck/ROM/ES-DE root. Discovery cache uses same guard.
- SAFE MODE: frontend query `get_safe_mode` remains, launch block preserved, sentinel untouched.
- Launcher protection: no changes to emulator command resolution – ROG launch/return testing by Codex later.
- Sentinel fixes, CANVAS console logos, ES-DE scraped-media mappings, 175% DPI handling all preserved.
- Updater-key rotation preserved: pubkey unchanged, manifest handling unchanged.
- Real machine config: `get_machine_config` truth only — no fake fallback reintroduced.

---

## Version

4.4.0 (V8.4 Crystal Discovery) – final major pre-ROG-polish feature.

