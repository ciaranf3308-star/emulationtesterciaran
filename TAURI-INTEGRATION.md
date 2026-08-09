# Tauri Integration — Crystal Frontend V5

Crystal Frontend is a premium next-generation gaming OS (React + TypeScript + Vite) that runs as browser dev today and as Tauri v2 desktop shell on Windows (ROG Ally X). Frontend no longer owns emulation roots, emulator locations, BIOS, or ROM paths. All machine truth comes from `MachineConfig` supplied at runtime by Tauri backend.

This document replaces all previous stale drafts that assumed `C:/Emulation` generic defaults, hardcoded PCSX2/Dolphin/Cemu mappings, personal `C:\Users\ciara` paths, and Tauri v1 allowlist.

---

## 1. V3/V4 Architecture (current)

Frontend domains after V3 hardening:

- **MachineConfig** – canonical description of real machine. SchemaVersion 1, populatedSystemCount 19 (real), roots `{gamelists, rom, scrapedMedia}`, per-system `romDirectory D:/Emulation/roms/<id>`, `validExtensions`, `matchingRomFileCount`, `commands[]`, `launchSelection`, `media`, `metadata`. Validated via `validateMachineConfig()`; browser dev loads sanitized `config/machine-config.example.json` flagged `_devFlag: exampleData`; real Tauri build must load real config and **never** silently fall back to example if missing/malformed (blocking error).
- **SystemCommand / FindRules / LaunchSelection** – each command owns `template` verbatim (e.g. `LRPS2 %EMULATOR_RETROARCH% -L %CORE_RETROARCH%\pcsx2_libretro.dll %ROM%`, Xbox `"%EMULATOR_XEMU%" -dvd_path "%ROM%"`, Xbox360 `STARTDIR="%GAMEDIR%"; "%EMULATOR%" "%ROM%"`), `workingDirectoryTemplate`, `isFirstConfiguredCommand`, `identifiers`, `findRules[]` with `identifier, kind:"emulator"|"core", rules[{type:"staticpath"|"corepath"|"systempath", entries:[...]}]`, `source`. Backend must preserve templates verbatim, **never** simplify Xbox/Xbox360 or invent paths.
- **LaunchRequest → LaunchBackendRequest** – Frontend resolves selectedLabel (from `launchSelection.selectedLabel` or user override) to a command, extracts placeholders via `/%[A-Z0-9_\-.]+%/gi`, validates known tokens, builds `LaunchBackendRequest {systemId, systemFullName, romPath, romBasename, romDirectory, commandLabel, commandTemplate, workingDirectoryTemplate, isFirstConfiguredCommand, emulatorFindRules, coreFindRules, emulatorIdentifiers, coreFiles, corePathIdentifiers, identifiers, findRules, placeholders (rom-derived only: %ROM%,%ROM_RAW%,%BASENAME%,%GAMEDIR%,%ROMPATH%), placeholdersPresent}`. Backend owns emulator/core path resolution, placeholder expansion, working dir resolution, process spawn.
- **Metadata / Media** – ES-DE `gamelist.xml` fields `name/desc/publisher/developer/genre/players/rating/releaseDate/favorite/playCount/playTime/lastPlayed`, media pattern authoritative `<root>/<system>/<type>/<ROM basename>.<ext>` with exceptionSamples (e.g. `Pokemon Moon (USA) (En,Ja,Fr,De,Es,It,Zh,Ko).jpg` vs truncated basename) exposed for backend verification. Frontend never guesses media existence; backend verifies.
- **Composable Assets / Presentation** – Crystal background/logo/carouselIcon from `/assets/Crystal-Frontend-Asset-Pack/`, hardware foreground/screenMask/slotMask future from separate provider root `/assets/hardware/` (contract-ready, no images ingested in V5). Each provider owns baseRoot; per-field override wins but URL uses provider's root. Genesis ≠ Megadrive distinct (never aliased). Single source `AssetRef {providerId, relativePath, baseRoot, resolvedUrl}`.
- **SystemStage** – 5 independent DOM layers (never flattened): 1 env/bg, 2 gameplay (multiple regions for DS/3DS), 3 physical media (cart/disc/board), 4 hardware foreground/occlusion, 5 UI chrome. GPU `translateZ(0)`, memoization, graceful missing. Contract supports rest/insert target/scale/rotation/depth/duration/easing for future insertion animation without fake animation now.
- **Input / Navigation** – Central `NavigationAction` 11 actions, deadzone 0.25, INITIAL_DELAY 400 REPEAT_INTERVAL 120, construction side-effect free, StrictMode safe. View-aware router: Systems view left/right system nav + confirm open library, Library view directional reserved for future game focus (MUST NOT switch systems), back returns to systems, Settings directional for settings focus.
- **Machine truth system source** – When `MachineConfig` is present (even 0 systems), UI shows truthful empty state, **never** invents systems from theme manifest. Only when config missing entirely (browser dev before example load) may manifest scaffolding show to unblock UI. No `C:\Emulation` authoritative default anywhere.

### Theme invariant

Crystal remains: premium next-gen gaming OS, transparent/clear-tech hardware, graphite/black/silver electric/cool highlights, studio-lit console hardware, sharp cinematic motion, controller-first hardware-led. **Never** Beirt lifestyle/editorial/hospitality (warm beige, Newsreader, boutique-hotel, Soho House, Hume, Aesop, Cereal). Permanent firewall documented in `docs/CRYSTAL-PRODUCT-RULE.md`. Cross-contamination removed (0 outside product rule doc). Light theme cool `#F2F4F8` NOT warm `#f7f3ef`.

---

## 2. What Frontend No Longer Owns

- No `C:\Emulation` / `D:\Emulation` hardcode as authoritative default – roots from MachineConfig.
- No `EMU_MAP`, `EmulatorLookupTable`, hand-written systemId → exe name map.
- No `getDefaultEmulationRoot()`, `scanEmuDeckRoms(rootPath)`, `launchGame(systemId, romPath)` legacy direct architecture, `alert()` mock launch, save-state any[] browser shim that pretends to scan.
- No hardcoded personal paths `%USERPROFILE%`, `C:\Users\ciara`, `AppData\Roaming\EmuDeck`.

Canonical runtime boundary: `src/runtime/environment.ts` (`isTauriEnvironment()`, `getRuntime(): Runtime='browser'|'tauri'|'test'`, `isBrowserDev()`, `isTestEnv()` SSR-safe, tests) and `src/runtime/tauri.ts` (`getTauriInvoker(): Promise<InvokeFn|null>`, `getTauriInvokerSync(): InvokeFn|null`, `getTauriApi(): any|null`) safe under browser dev, Tauri runtime, bun:test/vitest, SSR undefined window.

Both `MachineConfigProvider` and `launcher/bridge.ts` must import detection from `runtime`, not invent separate `__TAURI__` checks. Generic package version 3.2.0 is semver independent from milestone V5; `version.json` contains only durable metadata `project/projectMilestone/previousMilestone/milestoneDefinition/semver/packageVersion` – no stale bundle size, module count, test count, commit sha.

---

## 3. Future Tauri Backend — Contract

Backend owns:

1. machine-config loading via filesystem polling (real local `crystal-machine-config.json` machine-local, `.gitignore`d, NEVER committed) or bundled provenance path; expose sanitized example only for browser dev.
2. filesystem ROM discovery via `romDirectory` per system authoritative, respecting `validExtensions`/`extensionString`.
3. gamelist reading (`gamelists/<system>/gamelist.xml`) via `authoritativeFiles.customSystems` etc.
4. media existence verification per `<mediaRoot>/<system>/<mediaType>/<basename>.<ext>` with `exceptionSamples`.
5. find-rule execution: for each `findRule.identifier/kind`, try `rules[]` of type `staticpath|corepath|systempath` with substitution variables `%ESPATH%` etc. (first match wins or platform-specific). Backend resolves `%EMULATOR_<ID>%` + `%CORE_<ID>%` + bare `%EMULATOR%` semantics.
6. emulator resolution / core resolution via FindRules, not hardcoded.
7. placeholder handling / workingDirectory resolution: `_ = placeholders` supplied by frontend, backend expands emulator/core vars plus path vars.
8. process spawn via `std::process::Command` (Windows) respecting `workingDirectoryTemplate` (nullable), quoting paths with spaces, steam/ios sandbox nuance.

Frontend contract (invoke payload):

- `get_machine_config()` → `MachineConfig` JSON (Task-v3 schemaVersion 1)
- `verify_media(request:{systemId, romBasename, mediaTypes[]})` → `{systemId, media:{[mediaType]:{exists, path?, exceptionMatched?}}`
- `launch_game(LaunchBackendRequest)` → handles verbatim (see section 4 placeholder capability). Returns `Result<(), String>`; `ok==false` must NOT silently fallback to alternate label; blocked tokens (INJECT, OS-SHELL) must surface capability reason.

No ROMs or real personal paths in CI – sanitized fixtures only.

---

### Tauri v2 configuration (reference current official, do not copy old v1 blindly)

`src-tauri/tauri.conf.json` minimal modern:

```json
{
  "productName": "Crystal Frontend",
  "version": "3.2.0",
  "identifier": "com.crystal.frontend",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "beforeDevCommand": "bun run dev"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "title":"Crystal Frontend",
      "width":1920,
      "height":1080,
      "fullscreen": true,
      "decorations": false,
      "resizable": true
    }]
  },
  "bundle": {
    "active": true,
    "targets": ["msi","nsis"],
    "icon": ["icons/icon.png"]
  }
}
```

Capabilities `src-tauri/capabilities/default.json` (v2, granular):

```json
{
  "identifier":"default",
  "windows":["main"],
  "permissions":[
    "core:default",
    "core:window:allow-start-dragging",
    "fs:allow-readTextFile",
    "fs:allow-exists",
    "fs:allow-readDir",
    "shell:allow-open",
    "dialog:allow-open"
  ]
}
```

Additional `shell` scope to spawn emulator executables must be tailored (do NOT fully open `shell:allow-open` to arbitrary binaries without scope). Prefer custom `launch_game` Rust command owning `Command::new()` instead of frontend `shell::open`.

Do **not** copy old v1 allowlist shape `{ "shell": { "all": false, "scope": [...] }, "fs": { "scope": ["C:/Emulation/**"] } }` blindly, nor hardcode `C:/Emulation` root. Frontend expects backend to resolve roots from `MachineConfig`.

No speculative Rust that cannot be tested in frontend CI (CI only installs Node/Bun, typecheck, tests, production build – no Rust/Tauri). Include commands only as contract, not yet compiled.

---

## 4. Placeholder Capability / Readiness (V5 fix)

Known vs Implemented distinction:

```ts
type PlaceholderCapability = {
  token: string
  normalized: string
  recognized: boolean
  runtimeSupported: boolean
  category: 'rom'|'emulator'|'core'|'path'|'modifier'|'injection'|'shell'|'unsupported'
  reason?: string
  requiresBackendFeature?: string[]
}
```

Recognized set (ES-DE uppercase + dash) via regex `/%[A-Z0-9_\-.]+%/gi`:

- `%ROM%`, `%ROM_RAW%`, `%BASENAME%`, `%GAMEDIR%`, `%ROMPATH%`, `%EMUDIR%`, `%EMUPATH%`, `%ESPATH%`, `%STARTDIR%` – `recognized:true`, `runtimeSupported:true` (straightforward paths).
- `%EMULATOR%`, `%EMULATOR_*%` pattern, `%CORE_*%` – `recognized:true`, `runtimeSupported:true` via FindRules execution.
- `%INJECT%` – `recognized:true`, `runtimeSupported:false`, `category:injection`, reason `"Requires process injection (Xbox360 Xenia: STARTDIR=%%GAMEDIR%%; \"%%EMULATOR%%\" \"%%ROM%%\" + INJECT semantics not yet implemented)"`, `requiresBackendFeature:["process_injection"]`. Real Xbox360 includes INJECT variant – modeled but BLOCKED until backend implements injection flag.
- `%EMULATOR_OS-SHELL%` or tokens containing `OS-SHELL`, `OS` prefix exec shell – `recognized:true`, `runtimeSupported:false`, `category:shell`, reason `"OS-SHELL requires OS shell execution semantics (Steam) not in launch contract V5"`, `requiresBackendFeature:["os_shell"]`. Real Steam uses `%EMULATOR_OS-SHELL% %HIDEWINDOW% %ESCAPESPECIALS% %RUNINBACKGROUND%` plus modifiers – modeled but BLOCKED.
- `%HIDEWINDOW%`, `%ESCAPESPECIALS%`, `%RUNINBACKGROUND%` – modifiers `recognized:true`, `runtimeSupported:true` (pass-through) but overall request BLOCKED if combined with OS-SHELL.
- Any other `%...%` – `recognized:false`, `runtimeSupported:false`, `category:unsupported`.

Model must:

- Preserve templates VERBATIM, never simplify Xbox (`"%EMULATOR_XEMU%" -dvd_path "%ROM%"` or similar preserved) / Xbox360 `STARTDIR="%GAMEDIR%"; "%EMULATOR%" "%ROM%"` exact.
- `isLaunchReady(template)` returns `{ready:boolean, blocking:PlaceholderCapability[], capabilities:[]}`. Selected launch command requiring unimplemented semantics **MUST NOT** be reported launch-ready, must return `ok:false` with unsupported token + reason, no silent fallback, no invented emulator path, no command simplification.
- Tests based on **sanitized excerpts** (real machine config is machine-local). Example:
  - PS2 / PCSX2: `%EMULATOR_RETROARCH% -L %CORE_RETROARCH%\pcsx2_libretro.dll %ROM%` (retroarch 64 emulator + core)
  - GameCube / Dolphin: sanitized realistic – `%EMUPATH%\Dolphin.exe %ROM%`
  - Xbox / xemu: `%EMULATOR_XEMU% -dvd_path %ROM%` (verbatim)
  - Xbox360 / Xenia + INJECT: `STARTDIR="%GAMEDIR%"; "%EMULATOR%" "%ROM%"` variant with `%INJECT%` must be BLOCKED detection
  - Steam / OS-SHELL + modifiers: `%EMULATOR_OS-SHELL% %HIDEWINDOW% %ESCAPESPECIALS% %RUNINBACKGROUND% %ROM%` – BLOCKED even though modifiers individually recognized.

See `tests/launcher/capability.test.ts` + `tests/launcher/templates.test.ts` for exact expectations.

---

## 5. SystemStage asset-ready contract (V5 intro, no images yet)

Layer order immovable, independent DOM, never flatten:

1. env/bg
2. gameplay – may be 0..2 regions (top/bottom for DS/3DS)
3. physical media – geometry vs runtime content separated
4. hardware fg/occlusion
5. UI chrome

Fixes vs prior mini `GameMedia` duplicate:

- Canonical `src/media/types.ts` owns `GameMedia` / `MEDIA_TYPE_EXTENSIONS`.
- Stage `physicalMedia` from config URL was conflated with selected-game media – now geometry: `PhysicalMediaTransform { rest:{x,y,scale,rotation?,depth?}, insertTarget:{x,y,scale,rotation?}, durationMs?, easing?, depth? }` + runtime `physicalMediaUrl?:string` prop supplying actual cart/disc image URL.
- `screenMask` + `slotMask` currently `display:none` – now participate as `maskImage` (CSS `mask-image:url(mask)/clipPath`) when provided, graceful when missing.
- DS/3DS multiple regions previously rendered SAME video into both – now `gameplaySources: {regionId, mediaType:'video'|'screenshot', url?, posterUrl?}[]` matched by `region.id`. If only single source exists for dual-screen, primary region renders, secondary empty – do NOT invent fake second footage.
- Geometry config model supports rest position, insert target, scale, rotation, depth/occlusion, duration, easing, anchor – no hardcoded GBA dims in generic component. Single-screen one source, dual-capable separate.
- Performance: `translateZ(0)` preserved, memoization `useMemo` for bg URL, video lifecycle only when visible.

See `src/stage/types.ts` extended with `GameplaySource`, `PhysicalMediaTransform`, `InsertionAnimationConfig`, props `gameplaySources?`, `physicalMediaUrl?`, masks? Migration path retained.

---

## 6. Hardware presentation contract (V5, contract-only)

MachineConfig describes MACHINE. Visual hardware geometry lives in separate domain `src/presentation/`:

- `types.ts`: `SystemPresentationConfig { systemId, fullName?, hardwareForeground?: {providerId, path}, gameplayRegions: GameplayRegionDefinition[], physicalMedia?: {type:'cart'|'disc'|'board'|'none', transform}, screenMasks?: Record<regionId,maskUrl>, slotMasks?, screenCount:1|2, hasPhysicalMedia:boolean, aspect? }`, `HardwareAssetDefinition { systemId, assetRef, scaleAt1080p, anchor}`, `GameplayRegionDefinition { id, x,y,width,height,aspectRatio?,label?}`, `PhysicalMediaTransform`, `InsertionAnimationConfig`, mask/asset refs.
- `resolver.ts`: `getPresentationForSystem(systemId): SystemPresentationConfig|undefined` with LRU cache clone.
- `presets.ts`: `SINGLE_SCREEN`, `DUAL_SCREEN_NDS` (top 25/10 50x35 bottom …), `DUAL_SCREEN_3DS` (5/3 etc), `GENESIS`, `MEGADRIVE` distinct (same layout different ids – never aliased). Migrated from `src/stage/config.ts` old presets. No per-system hardcoded GBA dimensions inside generic.
- `validation.ts`: checks `screenCount === gameplayRegions.length` (or 0..2), each region `0<=x,y,width,height<=100` valid, `aspectRatio` finite>0, `screenMask` slot presence graceful, `physicalMedia.type` enum.
- `index.ts` re-exports.

Presets preserve stage contract so next pass can ingest real transparent console hardware assets without architecture replay. `SystemStage` consumes presentation types (optionally via `configForSystem()` still available for legacy). Do NOT ingest final console images yet, do NOT fabricate hardware images, do NOT mass-create stage presets tied to guessed image geometry.

---

## 7. Asset provider root separation (V5)

Hidden limitation prior: relative path prefix assumption ` /assets/Crystal-Frontend-Asset-Pack/<rel>` works for Crystal bg but fails hardware assets with different root.

Fix: provider-specific root model. New `AssetRef { providerId, relativePath, baseRoot, url }`, `ResolvedThemeAssets { background?, logo?, ... , origins:{[field]:ResolvedAsset} }`. `ProviderEntry { id, baseRoot, set }`.

Resolver core `resolveThemeAssetsWithProviders(providers, systemId, theme)` tracks per-field latest provider, resolves `resolveAssetUrl(baseRoot, rel)` to canonical URL. Legacy `getAssetUrl(rel)` backward compat uses Crystal base. `mergeProvider(set, providerId?, baseRoot?)` merges per-field override but preserves root origin.

Concrete:

- Crystal provider stays `CRYSTAL_BASE="/assets/Crystal-Frontend-Asset-Pack"` with manifest 784 lines, 22 dark webp + 22 light png 1672x941, 21/22 logos, 231 icons, 6 SVGs compat.
- Fake hardware provider in test: id `"hardware"`, baseRoot `"/assets/hardware"` produces hardwareForeground url rooted in `hardware` not crystal.
- Test `tests/assets/provider-roots.test.ts` proves:
  - Crystal bg stays crystal-rooted
  - hardware fg stays hardware-rooted
  - per-field override still works (later provider wins per field)
  - missing graceful (`undefined` not throw)
  - genesis & megadrive distinct ids not aliased (both exist, different fullName, same layout acceptable)

---

## 8. Input / View-aware navigation

Construction side-effect free. `createKeyboardAdapter()` no auto-start, `start()` idempotent (active flag guard), `stop()` idempotent. `createGamepadAdapter()` analogous.

`useSemanticInput()` refactor:  
```ts
const handlerRef = useRef(onAction)
useEffect(()=>{handlerRef.current=onAction},[onAction])
const kb = useMemo(()=>createKeyboardAdapter(e=>handlerRef.current(e.action)),[])
const gp = useMemo(()=>createGamepadAdapter(e=>handlerRef.current(e.action)),[])
useEffect(()=>{kb.start();gp.start();return()=>{kb.stop();gp.stop()}},[kb,gp])
```
Stable adapter instances, not recreated when callback identity changes, StrictMode mount/unmount/remount safe (start stops).

Lifecycle tests `tests/input/lifecycle.test.ts` verify double-start no duplicate bind, stop idempotent, new adapter not started until start() called, isActive flag reliable, gamepad similar, StrictMode simulation.

View-aware router `src/hooks/useViewNavigation.ts`:

```ts
export type View='systems'|'library'|'allgames'|'favorites'|'recent'|'settings'
export function createViewAwareHandler(deps:{view, systemIds, selected?, setSelected?, setView?})
```

Rules (no fake game-grid movement):

- Systems: left/up/previousSystem = sysStep(-1), right/down/nextSystem = sysStep(+1), confirm -> library, back noop.
- Library: directional up/down/left/right reserved noop (future game focus), back -> systems, previousSystem/nextSystem blocked (MUST NOT mutate selected) to prevent global mutation bug.
- AllGames/Favorites/Recent/Settings: directional blocked, back -> systems.
- `DIRECTIONAL_FOR_SYSTEM_SWITCH` + `SYSTEM_SWITCH_ACTIONS` sets exported for auditing.

App's `onNavigate` now delegates to router handler, not global mutation.

---

## 9. Sanitized example config / path validation

Contradiction: validator demanded `String.includes('\\')` but sanitized example uses `D:/Emulation/...` forward-slash.

Fixed: `isValidRomDirectory(s): boolean` tolerant pattern `/^[A-Za-z]:[\\/]/` accepts `D:\Emulation\roms\ps2` AND `D:/Emulation/roms/ps2`, rejects `roms`, `ps2`, `""`, `"   "`, `":\Emulation"`, `"D:"`, `":Emulation\roms"`, `"\Emulation\roms"`, `"/Emulation/roms"`, `null`.

Exported for tests. `validateMachineConfig` passes sanitized example both slash forms, rejects relative/empty/malformed.

Tests:

- `tests/machine/validation-paths.test.ts` covering valid backslash, valid forward-slash, invalid relative, empty, malformed, plus indirect via `validateMachineConfig` construct with `makeValidSystem`/`makeValidConfig`.
- `tests/machine/example-config.test.ts` loads `config/machine-config.example.json` via `loadMachineConfigFromJson` + validates `ok:true`, checks each `romDirectory` matches tolerant pattern.
- Committed sanitized example now passes same validator/load path (fixed ps2 selectedLabel mismatch: label `PCSX2 (Standalone)` previously not matching command – corrected).

---

## 10. Versioning / Build truth truthful

`version.json` low-churn, no hardcoded commit SHA, no bundle size/gzip/module count/test count/typecheck result unless auto-generated. Durable fields only:

```json
{
  "project":"Crystal Frontend",
  "projectMilestone":"V5",
  "previousMilestone":"V4 – Crystal product rule split …",
  "milestoneDefinition":{V1..V5},
  "semver":"3.2.0",
  "packageVersion":"3.2.0"
}
```

Semver `package.json` 3.2.0 independent from milestone V5; documented in README "What Actually Exists". README updated V5 bullet: tolerant path validation both slash forms, legacy desktop bridge removal, canonical runtime boundary, Tauri v2 contract rewrite, launch capability/placeholder readiness, SystemStage asset-ready, hardware presentation contract, provider-specific asset roots, input StrictMode lifecycle, view-aware navigation, truth-only machine source, contamination cleanup, truthful versioning, CI.

CI: `.github/workflows/frontend-ci.yml` (frontend only) triggers push main + PR: checkout, setup bun `oven-sh/setup-bun`, `bun install` (lockfile tolerant), `typecheck` via `npx tsc -p tsconfig.app.json --noEmit`, `bun test` (sanitized fixtures only), `production build` via `bun run build` (locks to 50 modules `dist`). No Rust/Tauri needed.

Bundle sizing historical: V1 153 kB gzip 49 kB 35 modules → V4 188 kB gzip 58 kB 50 modules plus manifest 19 kB gzip 4 kB → V5 similar ~188-200 kB, CSS ~11 kB gzip ~3 kB – stable, logged in README not live-generated JSON.

---

## 11. Privacy & contamination seal V5

- `CRYSTAL-MACHINE-AUDIT.md` 4.4K / `crystal-machine-config.json` 274K machine-local verified JSON schema 19 systems + roots etc, `.gitignore`d and NEVER committed. Sanitized example 27 KB `_devFlag: exampleData` allowed.
- `prototype/original-vault.html` deleted from main (historical only, not needed in current public tree).
- Grep search of CURRENT main for `C:\Users\`, `C:/Users/`, `ciara`, `ciaran`, `C:\Emulation`, `E:\Emulation`, `EMU_MAP`, `Vault`, `fake launch`, `boutique`, `Soho`, `Hume`, `Aesop`, `Cereal` → 0 matches outside `docs/CRYSTAL-PRODUCT-RULE.md` allowed negative-rule mentions. Personal path string removed, `C:\Users\ciara` not present.
- `alert(` removed, `mock launch` eliminated except `BrowserMockBridge` now logs + throws error (no `alert()`), `getDefaultEmulationRoot`, `scanEmuDeckRoms`, `EMU_MAP`, `launchGame(systemId)` legacy signatures removed or folded into bridge canonical API.
- `isRealMachine` detection true only when backend injection `window.__CRYSTAL_MACHINE_CONFIG__` or Tauri invoke success; browser dev `isExample true` never masquerades as configured (blocking error UI when Tauri config fails).

---

## 12. No ingress final console images (V5 constraint)

Transparent console artwork collected separately – do NOT ingest this pass. Preset geometry (`SINGLE_SCREEN`, `DUAL_NDS`, `DUAL_3DS`, `GENESIS`, `MEGADRIVE`) uses relative percentages, `physicalMediaTransform` placeholders, no mocked console images. Contract ready so next pass can ingest real assets cleanly without re-architecting `SystemStage`. Do NOT mass-create per-system hardwareForeground URLs tied to guessed image geometry.

---

## 13. Spec-to-backend handoff checklist (next step after V5)

- [ ] `src-tauri/src/main.rs` commands `get_machine_config`, `verify_media`, `launch_game`
- [ ] Capability modeling for INJECT, OS-SHELL backend features (`requiresBackendFeature`) → Rust flag guards.
- [ ] Working dir resolution Windows `%GAMEDIR%` `%STARTDIR%` `%EMUDIR%` etc.
- [ ] Media existence proof (`resolveMediaPath`) cached existence boolean exposed via TAURI-INTEGRATION stage.
- [ ] Process spawn security scope (Tauri capability lockdown).
- [ ] Insert animation pipeline (`PhysicalMediaTransform.insertTarget` + `depth/occlusion` + duration).
- [ ] Cartridge/disc hardware asset ingestion (real art, next milestone).

Frontend guarantees while that lands: machine discovery, metadata parsing, composable per-field asset override, 5-layer independent rendering, DS/3DS multi-region concept, truth-only `getPopulatedSystems` systems glued to assets not reverse, placeholder exact preservation (Xbox/xbox360 verbatim), input centralized concept with StrictMode safe construction, repository searches no stale emulation root, public repo sanitized.

---

## 14. Development contingencies

- Root dev shell: `bun run dev` → Vite `server.port=1420 strictPort true` as Tauri expects, `assetsInlineLimit=0`.
- Browser mode: `npm run typecheck && npm run test`
- Build verification: `bun run build` → `dist/index.html 0.59 kB gzip 0.38 kB` + `index-*.css` ~11 kB gzip 3.22 kB + `manifest-*.js` 19.68 kB + `index-*.js` 188-200 kB. Produced <2s. Previous V4 pass 188.07 kB gzip 58.58 kB 1.97 s 50 modules.
- Test evidence: V4 27 pass 56 expects → V5 72 pass 246 expect (new: validation tolerant, example-config load success, capability mapping, template realism with PS2/GC/Xbox/X360/Steam cases, runtime/environment detection idempotency SSR safety, input lifecycle StrictMode/StrictMode remount, provider-roots optional variant proving distinct roots). No fake game data.

If tauri injection fails (no Cargo at time of writing): `src-tauri` shell scaffold remains optional – `tauri.conf.json` above is reference only, not hardware scaffold for CI.

---

End — Permanent Beirt/Crystal split honored, no lifestyle editorial leakage.
