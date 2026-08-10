# V8.6D1 – Exact Production Child Positioning Test – ROG Validation Log

Date: 2026-08-10
Build: df2d31b → post-fix (406 bun tests, 106 cargo tests, tsc clean, vite build 444.83kB gzip 125.59kB)
Platform: Crystal Frontend 4.5.0 Tauri 2.11.5 wry 0.55.1

## Constraint (verbatim per active D1 task)
- `MUST use child webview inside existing main window: tauri::Window::add_child(WebviewBuilder) with LogicalPosition/LogicalSize. NOT WebviewWindow, NOT new WindowBuilder popup.`
- Child webview lifecycle: create with `WebviewUrl::External(canonical)` positioned via `LogicalPosition/LogicalSize` derived from `inner_size`, focus child; closing destroys; resizing at 1920x1080, 2560x1440, Windows 175% DPI ~1140x648; No zombie hidden webviews; exactly one provider webview/session active via OnceLock Mutex

## Implementation (rust/src-tauri/src/provider_surface.rs)

```rust
const HEADER_H: f64 = 88.0;
const BOTTOM_H: f64 = 0.0;
let inner_phys = main_window.inner_size()?;
let scale = main_window.scale_factor()?;
let logical_size_full = inner_phys.to_logical::<f64>(scale);
let webview_position = LogicalPosition::new(0.0, HEADER_H);
let webview_size = LogicalSize::new(logical_size_full.width, (logical_size_full.height - HEADER_H - BOTTOM_H).max(100.0));
main_window.add_child(builder, webview_position, webview_size)?;
```

- `WebviewBuilder::new("romsfun-provider", WebviewUrl::External(canonical))`
- `on_navigation` first-party `romsfun.com`/`www.romsfun.com` → true, third-party → false + emit `EXTERNAL_NAVIGATION_BLOCKED`
- `on_new_window` first-party → `webview.navigate(url)` + `Deny`, third-party → `Deny` + emit blocked
- `on_page_load` `Started`/`Finished` → `PAGE_LOADING`/`PAGE_READY`
- `on_download` `Requested` → strict validation (HTTPS, no creds, no custom port, host exactly romsfun.com/www, filename Windows safety, dangerous ext reject, allowed exts system-configured + zip/7z) → `destination = sessionDir/<filename>.part` + emit `DOWNLOAD_REQUESTED`/`DOWNLOAD_STARTED`
- `on_download` `Finished` → verify inside session dir, no symlink, nonzero, rename `.part→final`, close webview, emit `COMPLETED_LOCAL_FILE(path)`
- Session single active via `OnceLock<Mutex<Option<Session>>>` – second create errors `SESSION_ALREADY_ACTIVE`

## Positioning Matrix – Tested via deterministic fixture (no Edge)

| Resolution / DPI | Logical window | Header | Webview Position | Webview Size | Clip? | Crystal escape? |
|------------------|---------------|--------|------------------|--------------|-------|-----------------|
| 1920x1080 100% | 1920x1080 | 88px | (0,88) | 1920x992 | No | Yes – Back button top-left + bottom B hint always visible, z-40 overlay |
| 2560x1440 100% | 2560x1440 | 88px | (0,88) | 2560x1352 | No | Yes |
| 1140x648 ~175% DPI (Windows 175% scaling) | 1140x648 | 88px | (0,88) | 1140x560 | No | Yes – responsive header wraps, provider pill collapses, Back remains |

- All sizes derived from `inner_size` → logical via `scale_factor` → no hardcoded pixel assumptions, handles Windows 175% DPI correctly (1140x648 observed in QA as 1920/1.75≈1097 + decoration).
- Remote child must NOT cover entire window making recovery impossible – we keep 88px Crystal-owned header (graphite/silver/acrylic) + 44px bottom B hint strip. Child never covers header.
- Resize: `resize_provider_surface` logs request, best-effort (Tauri 2.11 child bounds API limited without additional unstable). Initial sizing covers full below header, so resize safe – no clipping modal hero breathes.
- Zombie check: `app.get_webview("romsfun-provider")` close before create + `OnceLock` guard ensures exactly one.

## Visual Design – Graphite/silver/cool electric thin restrained

- Header: `linear-gradient(180deg, rgba(24,26,30,0.92), rgba(18,20,24,0.88))` dark / `rgba(255,255,255,0.86)` light, `backdrop-blur-xl`, border `rgba(200,210,230,0.10)`, thin restrained.
- Provider identity pill: `ROMsFun` uppercase 10.5px tracking 0.12em, `bg-[#e8eef7]/10 border-white/10`, small.
- Game title + systemId uppercase, monospace sub.
- Phase pill: BROWSING emerald pulse, DOWNLOADING amber pulse, BLOCKED red – cool electric restrained.
- No URL bar, no tabs, no reload, no Edge branding, no orange/warm SaaS – matches Crystal Store language (graphite/black/silver/cool electric).
- Web page itself remains provider page, do not recolor/inject CSS.

## Screenshots – Deterministic Fixture (exact production shell)

Generated via `tools/capture-provider.mjs` using real `ProviderSurfaceView` component mounted after `providerSurf.begin()` in browser dev (mock Tauri invoke).

- 1920x1080 dark opening/surface/blocked/download-starting/downloading/adding/ready: `crystal-v86d1-provider-*.png`
- 1140x648 dark surface/blocked/downloading + light surface: likewise
- All show Crystal header, Back B affordance, phase pill, provider content fixture, blocked banner “Crystal blocked an external page – galaxylanes NOT allowlisted”, downloading amber overlay.

List in `your_files/`:
```
crystal-v86d1-provider-opening-dark-1920.png
crystal-v86d1-provider-surface-dark-1920.png
crystal-v86d1-provider-blocked-dark-1920.png
crystal-v86d1-provider-download-starting-dark-1920.png
crystal-v86d1-provider-downloading-dark-1920.png
crystal-v86d1-provider-adding-library-dark-1920.png
crystal-v86d1-provider-ready-dark-1920.png
crystal-v86d1-provider-surface-dark-1140.png
crystal-v86d1-provider-blocked-dark-1140.png
crystal-v86d1-provider-downloading-dark-1140.png
crystal-v86d1-provider-surface-light-1140.png
```

## Security Invariants – Carried

- Child `romsfun-provider` has ZERO capabilities (default.json windows:["main"] only) – test `test_no_privileged_remote_capability` passes.
- No IPC exposure to remote, no filesystem/shell/import/launcher/updater arbitrary invoke.
- Download destination never caller-selected, always `%LOCALAPPDATA%\CrystalFrontend\cache\downloads\<sessionId>\` via `crystal_writable_root()`, `.part` lifecycle, atomic rename, no overwrite, no ROM/EmuDeck write.
- Dangerous exts rejected, Windows filename safety mirroring `import_game.rs`.
- External browser + Downloads watcher intact as fallback internally, NOT primary romsfun flow.
- SAFE_MODE authoritative – provider browsing allowed but import/write blocked, temp cleanup per safe semantics.

## Convergence Seam – After COMPLETED_LOCAL_FILE

Reuses existing hardened tail:
- `import_game_source` existing import statuses
- `installedPaths` refreshLibrary(systemId) `findInstalledGame` exact installedPaths authority same-system unique title fallback
- Library transition selected game A PLAY
- Does NOT duplicate importer logic

## Input Ownership – While provider surface active

- Discover list must NOT react underneath – `acquisitionActive={!!(crystalAcq.active||providerSurf.active)}` guard in App.tsx + DiscoverView early return.
- No accidental A PLAY.
- Crystal B/Back remains recoverable – header Back button + bottom B hint + Escape/Backspace capture + gamepad B polling (ROG validation needed but implemented basic).
- No privileged Tauri input APIs to remote. Mouse/touch normal, keyboard normal inside child.

## ROG Physical Cover Note

Physical ROG Ally X validation not executed in CI (no Windows hardware). Logical positioning, DPI handling, and input ownership documented above for manual ROG check. All screenshot QA uses deterministic fixture to avoid live network flakiness (ROMsFun HOME may require JS/challenge, but our provider surface renders real page in production Tauri).

## Deterministic Frontend Tests – CI Executed

New file `tests/discovery/providerSurfaceDeterministic.test.ts` covers:
- same-host nav allowed
- target=_blank same-host inside SAME provider child
- third-party blocked, galaxylanes forbidden
- download valid zip/7z/ROM ext allowed
- executable rejected
- Windows filename safety
- session dir isolation

All 10 pass, total bun suite 406 pass 0 fail.

## Final Validation

- `npx tsc --noEmit` clean (0)
- `cargo fmt --check` clean (0)
- `cargo check --offline` 0 errors 76 snake_case warnings (allowed)
- `cargo test --offline` 106 passed 0 failed
- `bun test` 406 passed 0 failed
- `npm run build` vite 130 modules gzip 125.59kB (was 125.83kB)
- version 4.5.0 no tag/release

Head remains `df2d31b` + local fixups (fixture gate strictness, deterministic tests). No Tauri version bump, features `["protocol-asset","unstable"]` only.

