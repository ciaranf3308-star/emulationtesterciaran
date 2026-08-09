# Crystal Frontend — Windows ROM Launcher

Premium fullscreen Windows gaming frontend (React + TypeScript + Vite → Tauri). Replaces ES-DE visually while continuing to use the user's existing EmuDeck installation underneath.

> **Note:** This build is still web-preview (Vite). Tauri wrapper next step converts `dist/` into single 8–12 MB exe.

## What Actually Exists (Phase 2 — 2026-08-09)

### Machine-Local Truth (Never Committed)
Generated read-only from ROG Ally X:

- `CRYSTAL-MACHINE-AUDIT.md` — 60 lines, 19 populated systems table (`n3ds,dreamcast,gb,gba,gbc,gc,genesis,megadrive,n64,nds,ps2,psp,psx,snes,steam,wii,wiiu,xbox,xbox360`) with ROM counts, launch labels, `STATICALLY_RESOLVED`, authoritative paths `%USERPROFILE%\AppData\Roaming\EmuDeck\...`, ambiguities: `ps4` invalid `ShadPS4 Shortcut`, media seed conflict `D:\Emulation/storage/downloaded_media` vs `C:\Emulation/...`
- `crystal-machine-config.json` — `schemaVersion 1`, `populatedSystemCount 19`, `generatedAt 2026-08-09T20:38:48.4484774+01:00`, `roots { gamelists: %USERPROFILE%\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE\gamelists, rom: D:\Emulation\roms\, scrapedMedia: C:\Emulation\storage/downloaded_media }`, per-system `romDirectory`, `validExtensions`, `matchingRomFileCount`, `commands[]` with `findRules { identifier,kind, rules: staticpath|corepath|systempath }`, `launchSelection { selectedLabel, rule, status, source gamelist.xml, perGameOverrideCount 0 }`, `media {covers,marquees,miximages,physicalmedia,screenshots,titlescreens,videos fileCount/directRomBasenameMatches/nonDirectBasenameCount/filenamePattern/exceptionSamples }`, `metadata { exists,favorites,gameEntries,gamelistPath,entriesWithPlayCount,entriesWithLastPlayed,fields }`

Both are **machine-local** → stored in `~/workspace/` only, `.gitignore`d. Real paths never leave machine.

### Sanitized Example

`config/machine-config.example.json` — 27 KB, 5 systems (`ps2,gc,gba,n64,snes`), roots `D:/Emulation/...`, flagged `_devFlag: exampleData`, **no** `%USERPROFILE%` personal paths. Used automatically for browser dev mode.

### Asset Pack

Crystal pack preserved exactly: `public/assets/Crystal-Frontend-Asset-Pack/` 75 MB, 22 dark `.webp` + 22 light `.png` (1672×941), logos dark 22 inc `steam.png` 30007 B, light 21 (no steam – fallback handled), 231 carousel-icons 28×28, 6 `shared-ui` SVGs, `manifest.json` 784 lines. Resolutions/transparency intact, ZIP itself not committed. `genesis` ≠ `megadrive` distinct (never aliased).

### Architecture Domains

#### Machine (`src/machine/`)
- `types.ts` — `MachineRoots`, `FindRule`, `SystemCommand`, `LaunchSelection`, `MediaAvailability`, `MetadataAvailability`, `ValidationError`, `SUPPORTED_SCHEMA_VERSIONS=[1]`
- `schema.ts` — `isMachineConfig` guards (no zod)
- `validation.ts` — 7 checks: schemaVersion, populatedSystemCount vs `systems.length` + vs `matchingRomFileCount>0`, unique IDs (case-sensitive + case-insensitive map), launchSelection label ∈ commands, ROM dir contains `\`, media directory contains systemId, find-rule structure allowed types `staticpath|corepath|systempath`
- `loader.ts` — `loadMachineConfigFromJson(json)`, `loadMachineConfigFromPath(path)` (Node/Tauri `fs/promises`), `loadExampleMachineConfig()`, `isExampleConfig()`. Tauri `plugin-fs` fallback. Throws `MachineConfigLoadError` with aggregated `validationErrors` instead of silent fallback.
- `selectors.ts` — `getPopulatedSystems()`, `getSystemById()`, `getSelectedCommand()`, `getSystemMediaSummary()`, `getThemeAssetsForSystemJoined()` (machine → asset resolver → presentation)

#### Assets (`src/assets/`)
Composable per-field override model (`ThemeAsset` fields `backgroundLight/Dark, logoLight/Dark, carouselIcon, hardwareForeground, screenMask, slotMask`). Providers merge with `mergeAssetSets()` – later provider wins per field. Resolver:
- `getAssetUrl()` canonical ` /assets/Crystal-Frontend-Asset-Pack/<rel>` preserved
- `mergeAssetSets(...sets)`
- `loadManifest()` fetches Crystal manifest, fallback `_default`
- `getThemeAssetsForSystem(id,theme)` — light fallback to dark, dark → light, → `_default`. `steam` light missing → dark logo (explicit fallback, not alias). Missing artwork → `undefined` (graceful, no throw). Genesis/megadrive distinct.

#### Stage (`src/stage/`)
5 independent DOM layers (never flattened):
1. environment/background
2. gameplay video/screenshot — **multiple** `gameplayRegions` required for DS/3DS (top/bot screens)
3. physical media
4. transparent console/hardware foreground — suppressed if missing (no ugly fake console)
5. UI chrome (children)

GPU-friendly `translateZ(0)`, `SystemStageConfig { systemId, fullName, background?, hardwareForeground?, screenMask?, slotMask?, gameplayRegions: [{id,x,y,width,height,aspectRatio?,label?}], physicalMedia?, mediaTransform?, animation? }`. Preset `SINGLE_SCREEN` vs `DUAL_SCREEN_NDS` / `3DS`. `SystemStage.tsx` implements layers, vignette, optional dev guides.

#### Launcher (`src/launcher/`)
- `types.ts` — `LaunchRequest { systemId, romPath, selectedCommandLabel? }`, `LaunchBackendRequest` preserves `commandTemplate` verbatim, splits `emulatorFindRules`/`coreFindRules`, extracts placeholders via `/%[A-Z0-9_\-.]+%/gi`
- `resolver.ts` — Xbox/xbox360 unusual templates preserved; `%INJECT%` / `%OS-SHELL%` → `ok:false` `UNSUPPORTED/INCOMPLETE` (never guessed). Handles `%EMULATOR%`, `%EMULATOR_*%`, `%CORE_*%`, `%ROM%`, `%ROM_RAW%`, `%BASENAME%`, `%GAMEDIR%`, `%ROMPATH%`, `%EMUDIR%`, `%EMUPATH%`, `%ESPATH%`, `%STARTDIR%`, `%HIDEWINDOW%`, etc. Returns `{ ok:true, backendRequest }` or `{ ok:false, reason, systemId, unsupported? }`. **No fallback silent**.
- `bridge.ts` — `__TAURI__` detect, else `BrowserMock` that logs/ta.

#### Media (`src/media/`)
Pattern authoritative: `<media root>\<system>\<media-type>\<ROM basename>.<ext>` exceptionSamples (`Pokemon Moon (USA) (En,Ja,Fr,De,Es,It,Zh,Ko).jpg` vs truncated basename) exposed for backend verification.
- `types.ts` — `MediaType` `covers|physicalmedia|screenshots|titlescreens|videos|marquees|miximages`, `GameMedia`, `MEDIA_TYPE_EXTENSIONS`
- `resolver.ts` — `resolveMediaPath()`, `resolveMediaPathDetailed()`, `expectedMediaPath()`, `resolveMediaCandidates(config, mediaType, romBasename, category?)`, `getSystemMediaSummary()`, `buildGameMedia()`, `resolveAllMedia()`. No `C:\Emulation` hardcode – caller provides `mediaRoot`.

#### Metadata (`src/metadata/`)
ES-DE `gamelist.xml` parser – no fake data:
- `types.ts` + `parser.ts` supports `name/description/developer/publisher/genre/players/rating/releaseDate/favorite/playCount/playTime/lastPlayed`. DOMParser path + Node regex fallback. Selectors `getFavorites`, `getRecentlyPlayed`, `getAllGames`.

#### Input (`src/input/`)
Centralized semantic `NavigationAction` `up/down/left/right/confirm/back/menu/favorite/search/nextSystem/previousSystem`. Components consume semantic events, **not** Tab focus.
- `keyboard.ts` — `KEY_MAP` arrows/WASD/HJKL, `Enter/Space` confirm, `Esc/Backspace` back, `M/P` menu, `F` favorite, `/ ?` search, `Q/[` prevSystem, `E/]` nextSystem. Blocks scroll for nav keys. Repeat initial 400 ms interval 120 ms, debounce, `start()/stop()/isActive()`.
- `gamepad.ts` — Browser Gamepad API, `deadzone 0.25`, D-pad 12–15, buttons `0=confirm 1=back 2=favorite 3=menu 8=search 9=menu 4=prevSystem 5=nextSystem`, repeat initial 400 ms interval 120 ms, connect/disconnect, `requestAnimationFrame` polling, `gamepadButtonToAction()`, export constants `ANALOG_DEADZONE`, `GAMEPAD_INITIAL_DELAY`, `GAMEPAD_REPEAT_INTERVAL`.

#### App Shell (`src/App.tsx` + Providers)
`App.tsx` 252-line monolith → refactored:

- `ThemeProvider` + `MachineConfigProvider` (loads real config via `window.__CRYSTAL_MACHINE_CONFIG__` injected Tauri or sanitized example in browser dev)
- `MachineConfig` is **source of truth** – systems list from `getPopulatedSystems()`, **not** theme manifest. `fullName` for UI titles, `genesis` ≠ `megadrive`.
- No `C:\Emulation` authoritative default – removed `emuRoot` state, replaced with `roots.rom` from machine config.
- `SystemStage` usage: `background` from composable asset resolver, `gameplayRegions` from `configForSystem(id)`.
- Semantic input via `useSemanticInput` hook → `NavigationAction`.
- Views: Systems (premium fullscreen art-led, logo hero, carousel, no fake counts), System Library, All Games / Favorites / Recently Played (architecture ready – will wire to metadata parsers), Settings/dev.
- Dev info never dominates – top bar wordmark, bottom hint, media summary small.

Performance hardening:
- Memoization (`useMemo`) for populated systems, current system, assets, stage config.
- Auto-scroll active carousel item into view.
- `translateZ(0)` for GPU transform, `loading="lazy"` for carousel icons, video lifecycle cautious (no autoplay storms), reduced-motion + `visibilitychange` pause ready.

### Tests (bun:test)

27 tests, 0 fail:
- Machine validation, duplicate detection, populatedSystemCount, launchSelection matching, unknown command handling, example flag, ROM dir `\\` presence
- Asset join by system ID, genesis vs megadrive distinct, steam light→dark fallback, missing artwork graceful, `mergeAssetSets` per-field override
- Launch resolver preserves template verbatim, Xbox 360 unusual, placeholder extraction, `%INJECT%/%OS-SHELL%` unsupported, selected label resolution
- Media `expectedMediaPath <root>\<system>\<type>\<basename>.<ext>`, candidates with exceptionSamples, primary extension
- Input keyboard mapping, gamepad deadzone/button constants, repeat timings
- Metadata parser name/favorite/playCount/genre, favorites/recently played selectors

`npm run build` passes: `tsc -b` + `vite build` → 50 modules, 182 kB JS gzip 57 kB (prod).

## Privacy / .gitignore

Never public (ignored):
`crystal-machine-config.json`, `machine-config.json`, `*.machine.local.json`, `CRYSTAL-MACHINE-AUDIT.md`, `*.zip`, `roms/`, `bios/`, `saves/`, `scraped_media_cache/`, `.env`, `*.key`, `*.token`, `node_modules/`, `dist/`

Committed artwork allowed: `public/assets/Crystal-Frontend-Asset-Pack/` (extracted PNG/WebP, not ZIP).

## Frontend / Backend Launch Boundary

Frontend: builds `LaunchRequest { systemId, romPath, selectedCommandLabel? }`. No `EMU_MAP`, no `C:\Emulators\...` hardcode, no command string concatenation in React.

Backend (Tauri Rust next phase): owns:
- Find-rule execution (`staticpath|corepath|systempath` entries)
- Placeholder substitution (`%EMULATOR%`, `%EMULATOR_*%`, `%CORE_*%`, `%ROM%`, `%ROM_RAW%`, `%BASENAME%`, `%GAMEDIR%`, `%ROMPATH%`, `%EMUDIR%`, `%EMUPATH%`, `%ESPATH%`, `%STARTDIR%`, `%INJECT%`, `%OS-SHELL%`, `%HIDEWINDOW%`, `%ESCAPESPECIALS%`, `%RUNINBACKGROUND%`) – ROM quoting, `STARTDIR`/`EMUDIR`/`GAMEDIR` derived from `getRomDirectory()` handling `\` and `/`, `BASENAME` via `stripExtension()`. Xbox/xbox360 `%STARTDIR%=%EMUDIR% %EMULATOR_XEMU% -dvd_path %ROM%` preserved exactly.
- Workdir substitution
- Spawn with correct ROM paths (Xbox `.xex`, `.iso`, etc)

If template semantics unclear → `UNSUPPORTED`/`INCOMPLETE`, **do not guess**.

## Media Architecture

`<scrapedMedia root>\<system>\<media-type>\<ROM basename>.<ext>` where `scrapedMedia` from `roots.scrapedMedia` (e.g. `C:\Emulation\storage/downloaded_media` or `C:\Emulation\storage\downloaded_media`), `system` is machine ID, `media-type` in `covers/marquees/miximages/physicalmedia/screenshots/titlescreens/videos`, `ROM basename` = filename without extension, `<ext>` = primary per-type (`covers .jpg .png`, `videos .mp4 .webm`) with candidate fallback. Backend verifies FS existence after frontend placeholder path built. ExceptionSamples like `SM64` vs `Super Mario 64 (USA)` flagged `hasExceptionRisk`.

## SystemStage Layer Contract

5 layers must stay independent (CSS z-index 1–5), never baked into single PNG:
- Env = background asset (22 dark webp / light png) with vignette + grain
- Gameplay = video (muted muted loop) or screenshot per region – DS/3DS dual required
- Physical = disc/cart scan
- Hardware FG = transparent console overlay (Canvas future) – optional
- Chrome = actual React UI (no faux-terminal, no orange `#FF6B26` Vault)

## Input Architecture

Controller-first. Keyboard adapter auto-starts, gamepad `requestAnimationFrame` poll, both export `start()/stop()/isActive()`. `NavigationAction` semantic, not `keyCode`. Components consume events via `useSemanticInput(onAction)`. Mouse secondary.

## Dev Modes

Desktop = Tauri (future `src-tauri/`): `window.__TAURI__.invoke('get_machine_config')` returns machine-local JSON, backend does fs verification + launching.

Browser = dev fallback loads sanitized example `config/machine-config.example.json` + shows `EXAMPLE manifest • dev` badge.

## Tauri Next Steps

`cargo` not available in web VM. Integration documented in `TAURI-INTEGRATION.md` + `vite.config.ts` extern `@tauri-apps/*`. Frontend `src/tauri/index.ts` placeholder ready, `bridge.ts` dual mode. Next real machine: `cargo tauri init` then implement `get_machine_config`, `verify_media`, `launch_game` commands.

## Performance Notes

Avoid mounting hundreds videos – Library view paginates placeholder list (40). Memoize stage config. Preload background via `decoding="async"`. State isolation via providers to avoid rerenders on carousel nav. GPU transforms `translateZ(0)` on bg/logo/carousel.

## Creative Rule (always)

Push for most impressive creative/aesthetic solution, not safe/basic. Push back hard on flat/boxed admin-panel/tech-dashboard. Boutique-hotel polish bar (Soho House + Hume + Aesop/Cereal). Boutique-hotel polish, Not orange Vault terminal.

---

*Phase 2 built 2026-08-09 by subagents + manual merge, typecheck 0, tests 27 pass, build 182 kB.*
