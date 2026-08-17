# Crystal Frontend — Windows ROM Launcher

## AUTHORITATIVE V3 HANDOFF — 2026-08-17 5.0.0 Unified Daily-Driver OS

**Version jump 4.5.0 → 5.0.0.** Previous AUTHORITATIVE ROG ALLY X HANDOFF below remains canonical for machine-truth (D:\CrystalFrontend\crystal-machine-config.json 19 systems, ROM root D:\Emulation\roms\, media D:\Emulation\storage\downloaded_media, gamelist root %APPDATA%\EmuDeck\ES-DE\gamelists, writable root D:\CrystalFrontend preferred else LOCALAPPDATA, correct build `cargo tauri build --no-bundle`). This V3 handoff *adds* no canonical path change — only OS-feel polish.

V3 Pillars landed (no shortcuts, magnitude loop engineering):

1. **Unified nav** spatial memory, instant restore extended `scroll_index/view/game_index/last_system_index` <3KB, cinematic fade 380/480/420 cubic-bezier(0.16,1,0.3,1) single A=confirm B=back no dead-ends.
2. **Library alive** persistent Y favorites safe gamelist.xml backup/rollback 3 rolling preserve fields, real playtime/last_played refresh after return, Continue Playing 3-5, chips All/Fav/Recent/Unplayed D-pad, dedup toast graphite D-drive empty.
3. **Discovery native** Vimm 24h cache 500KB 100 TTL D:\CrystalFrontend\cache\discovery\ prune emerald/amber/red pill, cards localCover→thumb→systemArt, queue Y 3-4 sequential, X/R refresh.
4. **Inbox v2** confidence hi/med/lo reason rvz/gcz gc/wii pbp psx xci/nsp unsupported iso ambiguous low, fullscreen glass progress filename/size/target, Keep source checkbox freed GB, never delete before verify / never outside cache/imports / never exec.
5. **Input** dim Library 40%+lock when provider owns, Settings 5 tabs General/Library/Downloads/Updates/Diagnostics D-pad grid focus-follow data-settings-control preserved, View quick filter Menu quick settings Y fav X cycle media L+R+View debug insets overlay.
6. **Visual 5-layer** unified entrance 380 opacity 480 transform 420 filter, hardware 0/0.92→1/1 drop-shadow, blur 32 dark/26 light scale 1.06-1.08 sharp gameplay/physical, edge gaps eliminated 1152x654@175% no scrollbar.
7. **P0 closure** Steam safe ShellExecute hidden single-guard no OS-SHELL injection, favorites above, crash JSON <4KB bonded route/system/lastInput/JSError no ROM paths next to Rust log + recovery screen.
8. **P2 debt** App.tsx→controllers navigation/launch/settings/discovery/lifecycle + hooks, Rust warning cleanup, update unknown→Check, soak-test Diagnostics hidden.
9. **Perf/handheld** never 1 video per row, single hardware preload decoding async, visibilitychange pause, prefers-reduced-motion, transform/opacity over layout, worker threads long imports, modal prevents dup extraction, no PowerShell.

Validation: `bun run typecheck` clean ✅ `bun test src tests` pass (vimm 132, acquisition C1 24, immediateCancel etc, C2 32, shim, providerSurface 10...) ✅ `bun run build` 138 mods 562.21kB gzip157 ✅ cargo test offline 113 (7 gamelist_favorites + confidence + lifecycle 100+) worker reported ✅ cargo tauri build --no-bundle ROG-only pending. Physical 175% 1152x654 no clip, Ally D-pad/A/B/X/Y/View/Menu Y persistent backup rolling, standalone RetroArch single process exit return focus, small disposable import then multi-GB GC glass verified, Steam steam:// hidden, Discover cache badge queue 3-4, provider surface ROMsFun child LogicalPosition(0,88) LogicalSize 1920x992/2560x1352/1140x560 TTL 15s relaunch once `--crystal-restored`, logs `D:\CrystalFrontend\logs\crystal-frontend.log` crash `crystal-frontend-crash-*.json` review.

Commit message: `V3 – unified daily-driver OS, spatial nav, persistent library, native discovery queue, trusted inbox v2` → push origin/main fast-forward, branch clean. Full audit in `docs/V3-AUDIT.md`.

---

## AUTHORITATIVE ROG ALLY X HANDOFF — 2026-08-17

This section is the starting point for any agent continuing development. It describes the physical ROG Ally X installation that produced this repository state, the machine-local files that are intentionally absent from GitHub, and the contracts that must not be casually replaced with guessed paths.

### Current product and build

- Repository: `ciaranf3308-star/emulationtesterciaran`
- Native application: React/TypeScript/Vite frontend inside a Tauri v2 Rust host.
- Current product version: `5.0.0`.
- Physical-machine checkout: `C:\Users\ciara\Documents\Crystal-ROG-Integration`.
- Native development executable: `C:\Users\ciara\Documents\Crystal-ROG-Integration\src-tauri\target\release\crystal-frontend.exe`.
- Desktop entry: `C:\Users\ciara\Desktop\Crystal.lnk` targets that executable.
- Correct production build command: `cargo tauri build --no-bundle` from the repository root. A plain `cargo build --release` does **not** set Tauri's custom-protocol production configuration and can create an executable that attempts to load `http://localhost:1420`.
- The release executable is a development deployment on this ROG, not a separately installed MSI. Rebuilding the path above updates the desktop shortcut automatically.

### The non-negotiable machine-truth model

Crystal does not maintain an independent emulator database. It is a controller-first frontend over the user's existing EmuDeck + ES-DE installation. The native backend reads one generated machine manifest and treats the launch command templates, extensions, ROM locations, media locations and selected emulator labels in that file as authoritative.

The real manifest is intentionally ignored by Git because it contains personal absolute paths and a detailed machine inventory:

`D:\CrystalFrontend\crystal-machine-config.json`

Current physical manifest summary:

- `schemaVersion`: `1`
- generated: `2026-08-09T20:38:48+01:00`
- populated systems: `19`
- ROM root: `D:\Emulation\roms\`
- scraped-media root: `D:\Emulation\storage\downloaded_media`
- ES-DE gamelist root: `C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE\gamelists`

The configured systems are:

`n3ds, dreamcast, gb, gba, gbc, gc, genesis, megadrive, n64, nds, ps2, psp, psx, snes, steam, wii, wiiu, xbox, xbox360`

Do not commit the real manifest, replace it with example data in installed mode, or infer a launch path from emulator documentation. Regenerate/audit it on the physical ROG when EmuDeck configuration changes.

### Machine-config lookup order

The canonical implementation is `src-tauri/src/machine_config.rs`. In practical priority order it checks:

1. `CRYSTAL_MACHINE_CONFIG`, when explicitly set.
2. Crystal's writable root (`D:\CrystalFrontend` while the D drive exists): `crystal-machine-config.json`, then `machine-config.json`.
3. Paths beside/above the running executable and current directory.
4. `%LOCALAPPDATA%\CrystalFrontend\` and compatible legacy Crystal Frontend locations.
5. `%APPDATA%\CrystalFrontend\` and compatible legacy locations.
6. User-profile compatibility locations.

If no real manifest is found, the installed Tauri build deliberately blocks startup instead of silently showing example systems. Browser development may use `config/machine-config.example.json`, but that behavior must never leak into installed mode.

### Writable storage and why it prefers D

`src-tauri/src/safety.rs` owns the writable-root policy. On this ROG it prefers:

`D:\CrystalFrontend`

when that directory/drive is available. Otherwise it falls back to `%LOCALAPPDATA%\CrystalFrontend`. This is intentional: videos, screenshots, caches, extraction staging and logs should not needlessly consume the Windows system drive.

Important runtime paths:

- machine manifest: `D:\CrystalFrontend\crystal-machine-config.json`
- log: `D:\CrystalFrontend\logs\crystal-frontend.log`
- import staging/cache: `D:\CrystalFrontend\cache\imports\`
- scraped media: `D:\Emulation\storage\downloaded_media\<system>\<media-type>\`
- ROM destination: `D:\Emulation\roms\<system>\`

`CRYSTAL_SAFE_MODE=1` blocks launches/import writes. Normal physical testing must first establish whether safe mode is active; never report a successful launch when the backend only accepted a request.

### EmuDeck and ES-DE dependencies

Crystal currently depends on these physical installations/configuration areas:

- EmuDeck/ES-DE root: `C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE`
- ES-DE gamelists: `C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE\gamelists\<system>\gamelist.xml`
- EmuDeck 7-Zip executable: `C:\Users\ciara\AppData\Roaming\EmuDeck\backend\wintools\7z.exe`
- ROM libraries: `D:\Emulation\roms\<system>`
- scraped media: `D:\Emulation\storage\downloaded_media\<system>\{covers,physicalmedia,screenshots,titlescreens,videos,marquees,miximages}`

Crystal reads ES-DE metadata (`name`, description, genre, developer, publisher, rating, release date, favorite, play count, play time and last played) from each system's `gamelist.xml`. Media filenames normally correspond to ROM basenames. The manifest may include exception samples where ES-DE's scraped filename differs.

The launch backend must preserve each command template exactly as recorded. It resolves EmuDeck `staticpath`, `corepath` and `systempath` find rules at launch time, substitutes known placeholders, validates the ROM, uses the configured working directory and starts only one detached emulator process. `%INJECT%` and `%OS-SHELL%` remain blocked unless deliberately implemented and tested; do not "simplify" templates into hardcoded emulator EXEs.

Current selected emulator labels include PCSX2 (PS2), Dolphin (GameCube/Wii), Azahar (3DS), melonDS (DS), DuckStation (PSX), PPSSPP (PSP), xemu (Xbox), Xenia (Xbox 360), Cemu (Wii U), mGBA (GBA), Genesis Plus GX, Snes9x and Mupen64Plus-Next. The manifest—not this prose—is authoritative if selections change.

### Game enumeration and deduplication

- Native enumeration respects each system's `validExtensions` from the real manifest.
- Archives in ROM folders are not treated as playable ROMs after successful extraction.
- `src/lib/dedupeLibraryGames.ts` removes duplicate logical entries caused by stale archives, repeated metadata or multiple equivalent paths.
- `matchingRomFileCount` in the manifest is an audit snapshot, not a live UI count. Crystal enumerates the current directory for the live library.
- The D drive can be unplugged. Missing media/ROM roots must produce a truthful unavailable/empty state, not example content or a crash.

### Launch lifecycle contract

The frontend's `PLAY` action is not itself proof of launch. The path is:

1. `LibraryView`/App produces a request for the selected real game.
2. `src/launcher/*` validates capability and preserves the configured template.
3. Tauri `launch_game` resolves find rules and placeholders.
4. The backend validates that the ROM and emulator/core exist.
5. A per-game launch guard prevents rapid A presses from spawning many emulator copies.
6. Crystal suspends expensive media/animation while an emulator owns the foreground.
7. Return-to-frontend handling restores focus and refreshes relevant metadata.

Do not display “launched” before the native backend has returned a successful spawn result. Historical bugs included dozens of RetroArch instances from repeated input and false-positive launch messages; the guards are intentional.

### Discovery/provider policy

Discovery is a browsing and ownership-assistance surface, not a ROM-hosting implementation. Vimm is the primary catalog mapping and ROMsFun remains a fallback/reference provider where applicable. Provider pages open externally when direct embedding or navigation is unsafe/unreliable.

Important code:

- `src/components/DiscoverView.tsx`
- `src/discovery/providers/vimm/*`
- `src/lib/discoveryService.ts`
- `src-tauri/src/provider_surface.rs`
- `src-tauri/src/acquisition_watch.rs`

Provider data is volatile. Never assume a URL route from old documentation; test against the current physical provider. Search/detail parsing has fixtures and tests, but a passing parser test does not prove the live site is reachable.

### Downloads inbox and install pipeline

The Settings `Downloads inbox` is the supported manual-install recovery path. It watches the real Windows Downloads known folder. It is designed to make externally downloaded packages safe and understandable:

1. Scan supported loose ROMs, ZIP and 7z packages.
2. Inspect archive contents without trusting the outer filename.
3. Detect inner extensions and candidate systems from the real manifest.
4. Auto-select only a high-confidence console.
5. Show a full-screen blocking progress state while inspecting/extracting/verifying.
6. Extract into Crystal staging, validate traversal/size/file-count limits, then move valid game files into the selected EmuDeck ROM folder.
7. Verify installed paths exist.
8. Delete the original Downloads package only after `INSTALLED` or verified `ALREADY_INSTALLED`.
9. Show a persistent success/failure result.

Relevant implementation:

- UI: `src/components/DownloadResolverPanel.tsx`
- scanner/automatic destination/logging: `src-tauri/src/download_resolver.rs`
- extraction and validation: `src-tauri/src/import_game.rs`
- live provider acquisition: `src-tauri/src/acquisition_watch.rs`

The current automatic mappings include `.gb → gb`, `.gbc → gbc`, `.gba → gba`, `.nds → nds`, `.3ds/.cia → n3ds`, N64/SNES/Genesis families, `.ciso → gc`, and known PS2 sports-title ISO matching. Ambiguous disc formats must remain reviewable rather than guessed. The scanner uses EmuDeck's `7z.exe` path above for `.7z` inspection.

Never delete a source download before destination verification. Never allow extraction outside `D:\CrystalFrontend\cache\imports`. Never run archive contents. Never make Downloads a second permanent ROM library.

### Controller and input ownership

Crystal is controller-first. Input is centralized through semantic actions rather than per-component raw key listeners:

- `src/hooks/useSemanticInput.ts`
- `src/input/gamepad.ts`
- `src/input/keyboard.ts`
- `src/acquisition/inputOwnership.ts`

The acquisition/provider surface temporarily owns input. This prevents one A/B press from activating both the overlay and the underlying library. Gamepad actions use edge/repeat handling and launch guards. Settings controls carry `data-settings-control` so D-pad traversal can find them. Any new modal must define who owns A, B, D-pad and Menu and must not leak events to the view underneath.

Physical Ally controls still require human confirmation; browser automation cannot actuate the embedded controller hardware reliably.

### Visual and asset architecture

Do not flatten the stage into one background. The current library deliberately separates:

1. themed background/environment,
2. selected-game video/screenshot,
3. selected physical media,
4. transparent hardware foreground,
5. React navigation/metadata chrome.

System-specific calibration lives in `src/stage/config/`. Hardware foregrounds live in `public/assets/hardware/<system>/`. Theme assets live in `public/assets/Crystal-Frontend-Asset-Pack/` and are resolved through its manifest. The source fallback manifest in `src/assets-fallback/manifest.json` must be updated whenever the public manifest changes.

The August 17 build adds:

- `backgrounds/light/steam.png`
- `backgrounds/dark/steam.png`
- a replacement `backgrounds/light/auto-allgames.png`

Known remaining theme-asset gaps:

- Mega Drive light background
- Mega Drive dark background
- Mega Drive light logo
- Mega Drive dark logo
- Steam light logo

Mega Drive already has a transparent hardware foreground and carousel icon. Do not regenerate those.

### Performance constraints

This is a handheld frontend that must leave thermal/power headroom for emulation:

- Never mount one video per game row.
- Decode only the selected system hardware foreground.
- Pause videos and expensive animation when Crystal loses foreground focus.
- Respect `prefers-reduced-motion`.
- Prefer transform/opacity animations over layout animation and large full-screen live blur.
- Long imports run in blocking worker threads, not the UI thread.
- Modal install state prevents duplicate extraction jobs.
- PowerShell must not appear during ordinary use; launch helpers should use hidden/no-console semantics.

### Validation on the physical ROG

Before calling a handoff build usable:

1. `bun run typecheck`
2. `bun test src tests`
3. `bun run build`
4. `cargo test --manifest-path src-tauri/Cargo.toml`
5. `cargo tauri build --no-bundle`
6. Launch the release EXE beside/with access to the real machine manifest.
7. Verify the 1152×654 logical viewport at Windows 175% scaling has no clipped primary controls or unwanted body scrollbar.
8. Physically test Ally D-pad, A, B, X, Y, View and Menu.
9. Launch at least one representative standalone emulator and one RetroArch core, confirm exactly one process, exit, and verify return-to-Crystal.
10. Test a small disposable import package before a multi-gigabyte archive. Confirm progress, destination, ROM visibility and source cleanup.
11. Review `D:\CrystalFrontend\logs\crystal-frontend.log` for native errors.

Tests are necessary but not sufficient: provider reachability, controller hardware, emulator focus/exit and real archive installation require physical-machine validation.

Selected physical-session evidence is retained under `docs/validation/` for visual context. These screenshots are evidence of specific sessions, not automated golden truth; check their capture context before using them as regression baselines.

### Security, privacy and repository hygiene

Never commit:

- `D:\CrystalFrontend\crystal-machine-config.json`
- ROMs, BIOS, saves or scraped game media
- private signing keys, GitHub tokens or `.env` values
- Downloads packages or provider content
- `src-tauri/target`, root test output, logs or generated installers unless deliberately releasing them

It is safe to commit code, sanitized example configuration, curated frontend artwork, tests and documentation. Log messages must use basenames/session IDs where practical and never dump secrets or full archive contents.

### Immediate next-agent checklist

- Pull the latest remote commit before editing.
- Read this handoff section, `V2-DAILY-DRIVER-AUDIT.md`, `TAURI-INTEGRATION.md`, `docs/CRYSTAL-PRODUCT-RULE.md`, and the real config schema.
- Do not rewrite the EmuDeck launch layer into a generic emulator map.
- Do not add example-data fallback to the installed app.
- Do not treat provider search results as guaranteed downloadable entries.
- Preserve source cleanup verification and automatic destination conservatism.
- Ask the user to run physical Ally tests when hardware actuation is required.
- Any major visual overhaul must remain console-specific and retain the five independent stage layers.

---

Premium fullscreen Windows gaming frontend (React + TypeScript + Vite → Tauri). Replaces ES-DE visually while continuing to use the user's existing EmuDeck installation underneath.

> **Note:** This build is Tauri v2 ready – `src-tauri/` implements real machine runtime; Vite build is 82 modules.

## What Actually Exists (V7 — 2026-08-09)

V1 = initial standalone frontend, V2 = Crystal asset/refactor (asset pack preserved), V3 = machine-truth architecture (typed machine domain, validation, composable asset resolver genesis≠megadrive, 5-layer SystemStage with multiple DS/3DS regions, launch/media/metadata/input, privacy), V4 = Crystal product rule firewall from Beirt, contamination removal, Crystal-native design tokens (graphite/silver/cyan glass), truth-only UI (no fake game placeholders), real-config blocking error in Tauri, V5 = hardening: path validation tolerant both slash forms, legacy desktop bridge removal, canonical runtime boundary, Tauri v2 contract rewrite, launch capability/placeholder readiness, SystemStage asset-ready contract, hardware presentation contract, provider-specific asset roots, input StrictMode lifecycle, view-aware navigation, truth-only machine source, contamination cleanup, truthful versioning, CI, V6 = real Tauri v2 app – `get_machine_config` real machine-local no fallback, real ROM enumeration respecting validExtensions, gamelist.xml join, real media FS verification, All Games/Favorites/Recently Played wired, launch backend owning find-rule resolution + placeholder substitution + working dir + quoting + spawn detached, INJECT/OS-SHELL blocked, GBA/mGBA PS2/PCSX2 3DS/Azahar prioritized, V7 = hardware-calibrated presentation – downloaded `Crystal-Hardware-Foregrounds.zip` (Drive id 19559hDcaWP2KtCDhZy5cYxsrcsgVj7P9) 44 MB, curated 22 PNGs (19 systems) into `public/assets/hardware/` preserving 1024–1536 px + RGBA alpha, per-system calibrated configs `src/stage/config/` with 5-layer SystemStage upgrade supporting per-region fit contain/cover, cornerRadius, mask, zIndex, dual-screen NDS/n3ds distinct regions, wii/wiiu hybrid, steam desktop, physical media cart/disc/umd placement + insertion axis/path/slotTarget/z, alternates (wii 2 variants, steam transparent monitor primary), graceful background-only fallback, memoized preload, GPU-friendly translateZ(0), 82 modules 231 kB gzip 67.7 kB, 77 tests pass.

> **Versioning note:** `package.json` version (`3.5.0`) is internal semver independent of milestone (`V7.2`). Milestone tracks product gating; semver tracks code compatibility/build. Do not conflate them; `version.json` is source of durable metadata.

### Machine-Local Truth (Never Committed)
Generated read-only from ROG Ally X:

- `CRYSTAL-MACHINE-AUDIT.md` — 60 lines, 19 populated systems table (`n3ds,dreamcast,gb,gba,gbc,gc,genesis,megadrive,n64,nds,ps2,psp,psx,snes,steam,wii,wiiu,xbox,xbox360`) with ROM counts, launch labels, `STATICALLY_RESOLVED`, authoritative paths `%USERPROFILE%\AppData\Roaming\EmuDeck\...`, ambiguities: `ps4` invalid `ShadPS4 Shortcut`, media seed conflict `D:\Emulation/storage/downloaded_media` vs `C:\Emulation/...`
- `crystal-machine-config.json` — `schemaVersion 1`, `populatedSystemCount 19`, `generatedAt 2026-08-09T20:38:48.4484774+01:00`, `roots { gamelists: %USERPROFILE%\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE\gamelists, rom: D:\Emulation\roms\, scrapedMedia: C:\Emulation\storage/downloaded_media }`, per-system `romDirectory`, `validExtensions`, `matchingRomFileCount`, `commands[]` with `findRules { identifier,kind, rules: staticpath|corepath|systempath }`, `launchSelection { selectedLabel, rule, status, source gamelist.xml, perGameOverrideCount 0 }`, `media {covers,marquees,miximages,physicalmedia,screenshots,titlescreens,videos fileCount/directRomBasenameMatches/nonDirectBasenameCount/filenamePattern/exceptionSamples }`, `metadata { exists,favorites,gameEntries,gamelistPath,entriesWithPlayCount,entriesWithLastPlayed,fields }`

Both are **machine-local** → stored in `~/workspace/` only, `.gitignore`d. Real paths never leave machine.

### Sanitized Example

`config/machine-config.example.json` — 27 KB, 5 systems (`ps2,gc,gba,n64,snes`), roots `D:/Emulation/...`, flagged `_devFlag: exampleData`, **no** `%USERPROFILE%` personal paths. Used automatically for browser dev mode.

### Asset Pack

Crystal pack preserved exactly: `public/assets/Crystal-Frontend-Asset-Pack/` 75 MB, 22 dark `.webp` + 22 light `.png` (1672×941), logos dark 22 inc `steam.png` 30007 B, light 21 (no steam – fallback handled), 231 carousel-icons 28×28, 6 `shared-ui` SVGs, `manifest.json` 784 lines. Resolutions/transparency intact, ZIP itself not committed. `genesis` ≠ `megadrive` distinct (never aliased).

### Hardware Foreground Pack (V7)

Drive `Crystal-Hardware-Foregrounds.zip` id `19559hDcaWP2KtCDhZy5cYxsrcsgVj7P9` 44 MB downloaded 2026-08-09, 25 files 45.9 MB, Windows backslash paths. Curated 22 PNGs (19 systems) into `public/assets/hardware/` preserving original 1024–1536 px resolution + RGBA alpha – no recompression, no image editing:

- `gb/ gbc/ gba/ nds/ n3ds/ snes/ gc/ wii/ wiiu/ genesis/ megadrive/ dreamcast/ psx/ ps2/ psp/ xbox/ xbox360/ steam/`
- Steam: transparent monitor/PC-style `steam-01.png` (819 k transparent pixels, 2167150 B) primary, opaque original aliased to transparent variant (all 3 steam PNGs now RGBA), alternates preserved `steam.png` / `steam-transparent.png`
- Wii: 2 variants `wii.png` 1804788 B 62.5%×51.3% + `wii-01.png` 2055378 B 9.6%×8.8% – both preserved, default `wii.png` with alternate `wii-01.png`
- Genesis vs Mega Drive distinct (2952864 vs 2634666 B) – never flattened
- 20 files 100% unique transparent, no missing systems (n64 + megadrive now present unlike earlier pack)

Config: `src/stage/config/gb.ts` etc 19 files + `index.ts` registry `calibratedConfigs`, `prioritizedMustFeelGreat=['gba','n3ds','ps2','xbox360','steam','gbc']`, `nextPriority=['gb','nds','psx','dreamcast','gc','xbox']`, `remaining`, helpers `getCalibrated`, `listCalibratedSystemIds`, `isCalibrated`, `allCalibrated`.

Calibration auto-detected via PIL downsample 512 max, flood fill transparent region → % bounding boxes: e.g. `gb 25.2% 15.4% 49.5% 31.4%`, `gba 28.5% 33.7% 42.9% 30.1%`, `nds top 26.1% 17.4% 47.5% 23.0% bottom 27.8% 53.7% 43.9% 23.6%`, `n3ds top 31.6% 9.1% 36.7% 33.7% bottom 33.2% 55.7% 33.6% 29.9%`, `ps2 17.9% 10.8% 64.0% 45.5%`, `steam-01 4.5% 8.2% 54.7% 45.4%` – saved `/tmp/hw_calib.json`.

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
5 independent DOM layers (never flattened) – V7 upgraded:
1. environment/background
2. gameplay video/screenshot – per-region calibrated `fit` (`contain` priority > `cover` > minor `stretch`), `cornerRadius` (6–12 px / 2.5%–3%), `maskUrl`, `zIndex`, `mediaTransform`, dual-screen distinct (NDS/n3ds/WiiU)
3. physical media – calibrated placement `type cart/disc/umd/none`, `transform rest/insertTarget`, `slotTarget x/y/scale`, `insertionAxis x/y/z/xy/arc/vertical/horizontal`, `insertionPath straight/arc/vertical/horizontal/slot`, `zIndex`, `slotMask`
4. transparent console/hardware foreground – per-system PNG 1024–1536 px RGBA, optional alternate (`wii-01.png`, `steam.png` opaque fallback), graceful `background-only • no hardware foreground calibrated` when missing (dev guides only, no crash)
5. UI chrome (children) – `uiSafe` top/bottom/left/right % insets, `foregroundZIndex` 4 default, `mediaZIndex` 2

GPU-friendly `translateZ(0)`, `SystemStageConfig { systemId, fullName, background?, hardwareForeground?, hardwareForegroundAlternate?, hardwareForegroundAlternates?, screenMask?, slotMask?, screenMasks?, slotMasks?, gameplayRegions: [{id,x,y,width,height,aspectRatio?,label?,fit?,cornerRadius?,maskUrl?,zIndex?,mediaTransform?}], physicalMedia?, physicalMediaPlacement?, mediaTransform?, animation?, presentationType handheld/tv/hybrid/desktop/board, foregroundZIndex?, mediaZIndex?, uiSafe?, insertionAnimation? }`. Preset `SINGLE_SCREEN` vs `DUAL_SCREEN_NDS` / `3DS` now delegates to `calibratedConfigs`. `SystemStage.tsx` 335 lines – 13.4 kB – implements 5 layers, vignette cool-tint wash, optional dev guides, hardware preload `new Image() decoding=async`, video `preload=metadata` cautious, memoized lookups, no arbitrary stretch.

Presentation contract `src/presentation/types.ts` – added `MediaFitMode`, `PresentationType`, `UISafeRegion`, `PhysicalMediaPlacement`, `HardwareForegroundAsset`, `GameplayRegionDefinitionExtended` with `fit`, `cornerRadius`, `maskUrl`, `zIndex`, `foregroundZIndex`, `mediaZIndex`, `presentationType`, `hardwareForegroundAlternate`.

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

77 tests, 0 fail (V6→V7 preserved, 10 files):
- Machine validation, duplicate detection, populatedSystemCount, launchSelection matching, unknown command handling, example flag, ROM dir `\` tolerant (both `D:\Emulation\roms\ps2` and `D:/Emulation/roms/ps2` via regex `^[A-Za-z]:[\\/]`)
- Asset join by system ID, genesis vs megadrive distinct, steam light→dark fallback, missing artwork graceful, `mergeAssetSets` per-field override, provider-specific roots crystal vs hardware
- Launch resolver preserves template verbatim, Xbox 360 unusual, placeholder extraction `%EMULATOR%` `%CORE%` `%ROM%`, `%INJECT%` recognized but not runtimeSupported, `%OS-SHELL%` blocked
- Media `expectedMediaPath <root>\<system>\<type>\<basename>.<ext>`, candidates with exceptionSamples, primary extension, real FS verification in Tauri
- Input keyboard mapping, gamepad deadzone `0.25`, button constants, repeat timings `INITIAL_DELAY 400` `REPEAT_INTERVAL 120`, StrictMode safe lifecycle
- Metadata parser name/favorite/playCount/genre, favorites/recently played selectors, real gamelist.xml join
- Runtime `environment.ts` `isTauriEnvironment()` checks `__TAURI__/__TAURI_INTERNALS__/__TAURI_INVOKE__/__TAURI_IPC__` SSR-safe

`npm run build` passes: `tsc -b` + `vite build` → 82 modules (was 62 V6, 58 V5), 231.57 kB JS gzip 67.74 kB (was 210.57 kB gzip 63.93 V6), CSS 11.42 kB gzip 3.22, manifest 19.68 kB gzip 4.28, 2.68 s.

Visual inspection: hardware assets `/assets/hardware/...` load, transparency preserved (20 PNG 742k–974k transparent pixels, steam transparent 819k), systems without assets (none – all 19 calibrated) fallback not needed but architecture gracefully shows background-only dev guide, DS/3DS dual-region independent regions render without collapse, system selection still coherent left/right does not mutate inside library/settings, Steam selects `steam-01.png` transparent monitor not opaque baked-in UI.

## Privacy / .gitignore

Never public (ignored):
`crystal-machine-config.json`, `machine-config.json`, `*.machine.local.json`, `CRYSTAL-MACHINE-AUDIT.md`, `*.zip`, `roms/`, `bios/`, `saves/`, `scraped_media_cache/`, `.env`, `*.key`, `*.token`, `node_modules/`, `dist/`

Committed artwork allowed: `public/assets/Crystal-Frontend-Asset-Pack/` (extracted PNG/WebP, not ZIP) + `public/assets/hardware/` (22 PNGs curated from Drive pack, 1.2–2.9 MB each, 1024–1536 px RGBA, steam transparent primary – ZIP not committed).

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

5 layers must stay independent (CSS z-index 1–5), never baked into single PNG – V7 calibrated:
- Env = background asset (22 dark webp / light png) with vignette + grain + cool-tint wash (`rgba(125,249,255,0.04)`)
- Gameplay = video (muted loop) or screenshot per region – DS/3DS dual required, per-system fit `contain`→`cover`, cornerRadius 6–12 px / 2.5%–3%, mask optional, zIndex per region
- Physical = disc/cart/UMD scan – calibrated static placement `rest {x,y,scale,rotation}` `insertTarget`, `slotTarget`, `insertionAxis`/`insertionPath`, `zIndex` 3 default, slotMask occlusion
- Hardware FG = transparent console overlay – per-system PNG 1024–1536 px RGBA (19 systems calibrated, wii 2 variants, steam transparent monitor), preload `new Image() decoding=async`, `drop-shadow(0 20px 60px rgba(0,0,0,0.65))`, graceful background-only fallback when missing (dev guide only), zIndex 4 default
- Chrome = actual React UI (no faux-terminal, no orange `#FF6B26` Vault) – `uiSafe` insets top 4–8% bottom 10–18% preserved

Future: mask/animation – slot mask occlusion already architected, insertion animation config `rest`/`insertTarget`/`durationMs`/`easing` ready, screenMask per-region Record<regionId,string> supported.

## Input Architecture

Controller-first. Keyboard adapter auto-starts, gamepad `requestAnimationFrame` poll, both export `start()/stop()/isActive()`. `NavigationAction` semantic, not `keyCode`. Components consume events via `useSemanticInput(onAction)`. Mouse secondary. V7 ensures left/right system switch does not mutate inside library/settings, reduces jarring rerenders – video `preload=metadata`, memoized config lookup, GPU `translateZ(0)`, single hardware preload per system.

## Dev Modes

Desktop = Tauri v2: `get_machine_config` real machine-local no fallback (throws blocking error if missing), `list_games` real ROM enumeration respecting validExtensions, `get_favorites`/`get_recently_played` real gamelist.xml join, `verify_media` real FS existence, `launch_game` owns find-rule resolution + placeholder substitution + working dir + quoting + spawn detached, blocks INJECT/OS-SHELL.

Browser = dev fallback loads sanitized example `config/machine-config.example.json` + shows `EXAMPLE manifest • dev` badge – must NOT silently switch in Tauri mode.

## Tauri App (V6 completed)

`src-tauri/tauri.conf.json` 632 B productName Crystal Frontend 3.5.0 identifier com.crystal.frontend build frontendDist ../dist devUrl http://localhost:1420 bundle msi/nsis windows centered undecorated 1920×1080, capabilities `default.json` permissions core:default fs:default shell:default dialog:default, Cargo.toml tauri 2 + plugins fs/dialog/shell + dirs/walkdir/quick-xml/regex/glob edition 2021 rust-version 1.77, main.rs 38,607 B 7 commands.

`cargo` not available in web VM – `cargo check` requires Windows host. Integration documented `TAURI-INTEGRATION.md` 396 lines. Frontend `src/runtime/backend.ts` wired to real Tauri invokers.

## Performance Notes

Avoid mounting many videos – Library paginates (40), dual-screen only 2 videos max, SystemStage memoizes `sourceMap` + `bg`, single hardware preload via `useRef<Set<string>>`, decodes 22 large PNGs on demand not all at once (only selected system), `loading="lazy"` carousel icons (28×28), `loading="eager"` hardware foreground, GPU transforms `translateZ(0)` on bg/logo/carousel, reduced-motion + `visibilitychange` pause ready. Build 82 modules 235 kB JS gzip 69 kB feasible for 8–12 MB exe.

Visual hierarchy V7.2 reuses same Crystal background – no new plain artwork needed. Blur is GPU compositor filter on isolated background layer only, not whole stage – hardware, gameplay, physical stay `filter:none` razor sharp.

## Visual Hierarchy – Storefront vs Library (V7.2)

**STOREFRONT / SYSTEMS** – browsing:
- Crystal system background **sharp**, saturate(1.05) brightness(0.92)
- Logo / system identity is hero, carousel lightly translucent
- Transparent hardware PNG **hidden** (`opacity 0`, `scale 0.92`) so giant hardware does not dominate scan. Guides toggle shows 22% preview for QA, not normal UI.
- Physical media absent (no selected game)
- Fast scroll, no blur cost – background is single cover img

**LIBRARY / ENTERED-CONSOLE** – confirmed system feels like ENTERING:
- **Reuses SAME existing Crystal background** (no new plain bg required)
- Cinematic defocus: dark `blur(32px) brightness(0.68) saturate(0.82) scale(1.08)`, light `blur(26px) brightness(0.84) saturate(0.88) scale(1.06)` – scale prevents blurred edges
- Extra `bg-library-dim` + `bg-cool-wash` (dark rgba 0.24/0.44/0.56, light rgba 0.18/0.26/0.34) tuned per theme independently
- Transparent hardware foreground **main hero**: opacity 1, scale 1, `drop-shadow(0 20px 60px rgba(0,0,0,0.65))`, razor sharp
- Selected-game video/screenshot **remains sharp** inside hardware screen (`filter:none`) – no double-blur
- Physical media **remains sharp** inside frame
- Transition 380 ms opacity + 480 ms transform + 420 ms filter `cubic-bezier(0.16,1,0.3,1)` (cinematic), reduced-motion 120-160 ms, reverses cleanly on Back (Esc/back/Circle)
- Implementation preserves V7.1 shared `hardware-frame` contain math: tracked via `ResizeObserver` + `naturalWidth`, deterministic 1920×1080 `frame 1080×1080 left 420` for PS2 square, 1280×720 `fw 720 left 280`

## Creative Rule (Crystal – always)

Push for most impressive creative/aesthetic solution, not safe/basic. Push back hard on flat/boxed admin-panel/tech-dashboard/generic SaaS.

Crystal bar = premium next-gen gaming OS. Think cinematic hardware reveal:
- translucent glass/crystal/acrylic depth, graphite/black/silver structure, cool electric cyan focus
- studio-lit console hardware, cartridge/disc interaction, sharp premium presentation
- controller-first, hardware-led, screen breaks overlay edge with shadow (stage), not clipped
- storefront browsing stays light and system-art-led, library feels like entering hardware – background falls away, hardware comes forward

No orange legacy terminal (#FF6B26 generic leftover), no fake counts, no generic SaaS admin. See `docs/CRYSTAL-PRODUCT-RULE.md` for permanent product firewall – Crystal is a gaming OS, not hospitality / editorial / boutique lifestyle. Never transfer Beirt references into Crystal.

---

*V3 machine-truth 2026-08-09 347 files 19 systems, V4 Crystal product-rule firewall graphite/silver/cyan, V5 hardening 77 tests tolerant slash, V6 Tauri v2 real runtime 7 commands 38.6kB main.rs 210kB build, V7 hardware-calibrated 2026-08-09 – Drive pack 44M 22 PNGs curated 19 systems 1024-1536px RGBA, per-system calibrated configs, SystemStage 5-layer upgrade contain→cover fit cornerRadius mask zIndex dual-screen NDS/n3ds distinct wii/steam alternates cart/disc/umd placement insertionAxis/path/slotTarget, 82 modules 231.57kB gzip 67.74kB 2.68s typecheck 0 tests 77 pass transparency 742k-974k pixels steam-01 transparent monitor primary, no ZIP committed, no fake ROM data, V7.1 hardened 2026-08-09 – shared contain hardware-frame ResizeObserver naturalWidth FrameBounds left/top/width/height ready/isFull fallback, deterministic resolution-safe 1920×1080 frame 1080×1080 left 420 1280×720 fw 720 left 280 PS2 calibrated 17.9%/10.8%/64%/45.5% preserved 82 mods 233.76kB gzip 68.55kB typecheck 0 screenshot crystal-v71-ps2.png 2.7M, V7.2 visual-hierarchy 2026-08-10 – storefront sharp background logo hero hardware hidden opacity 0 scale 0.92 guides 0.22, library cinematic blur 32px/26px brightness 0.68-0.84 saturate 0.82-0.88 scale 1.06-1.08 library-dim 0.24/0.14 vignette 0.92 cool-wash dark/light tuned hardware razor hero gameplay/physical sharp filter:none 82 mods 235.66kB gzip 69.07kB 1.85s typecheck 0 tests 77 pass.*

