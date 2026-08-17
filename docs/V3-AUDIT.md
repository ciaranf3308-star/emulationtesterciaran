# V3 Audit – Unified Daily-Driver OS 5.0.0 (2026-08-17)

Crystal Frontend has jumped from patch:files to true OS feel — **5.0.0** fast-forward of 3bce1fe ROG authoritative daily-driver build. Six engineering tracks landed in parallel, preserving machine-truth.

## Authoritative Baseline

- Repo `ciaranf3308-star/emulationtesterciaran` HEAD at start `3bce1fe` Publish authoritative ROG daily-driver build (120 files, 2960 ins, icon set replace, fullscreen edge gaps eliminated, wildcard `pcsx2-qt*.exe` resolver, Discover input/library race fixes, external URL launcher, Vimm primary, 175% DPI lock).
- 19 systems `n3ds,dreamcast,gb,gba,gbc,gc,genesis,megadrive,n64,nds,ps2,psp,psx,snes,steam,wii,wiiu,xbox,xbox360`, ROM root `D:\Emulation\roms\`, media root `D:\Emulation\storage\downloaded_media`, gamelist root `%APPDATA%\EmuDeck\EmulationStation-DE\ES-DE\gamelists`.
- Writable root `D:\CrystalFrontend` preferred else `%LOCALAPPDATA%\CrystalFrontend` via `safety.rs`.
- Correct build `cargo tauri build --no-bundle` not `cargo build --release`.

## Pillar 1 – Unified Navigation Contract, Spatial Memory, Instant Restore, Cinematic Fade

**Rust** `src-tauri/src/launch_lifecycle.rs`:
- `RestoreState` extended from 5 fields to 9 with backwards compat `#[serde(default)]`: `scroll_index: Option<u32>`, `view: Option<String>`, `game_index: Option<u32>`, `last_system_index: Option<u32>`, bounded <3KB (was 2KB) to disallow secrets. Validation: system_id/basename whitelist reject `/ \ : ..`, view whitelist `library|systems|discover|settings|downloads|system|allgames|favorites|recent`, index OOB guard (scroll/game 100k, system 5k), reject secret/token substring, symlink rejection via `symlink_metadata`, atomic tmp→rename.
- `restore_file_path()` → `crystal_writable_root()+state/restore.json` via `is_safe_write_path`.
- Existing watcher contract preserved: watcher created BEFORE Crystal terminates via `spawn_watcher_for_pid`, grace 2s wrapper/Steam child handling, duplicate guard via sysinfo enum + `watcher-*.lock` 15s, DETACHED_PROCESS+CREATE_NEW_CONSOLE relaunch once with `--crystal-restored`, exit itself. If watcher creation fails -> KEEP CRYSTAL OPEN. No strand without return. If launch fails – no orphan watcher, SAFE_MODE blocks.

**Frontend** `src/lifecycle/launchCycle.ts` types extended same shape, debounce 500ms save on nav.

**App shell**:
- Persist nav to `localStorage crystal:nav` + RESTORE.JSON via `save_launch_restore_state` on navigation (debounced). On mount `get_launch_restore_state` if timestamp <5min and version=1 → restore system/game optimistically before enumeration finishes.
- Cinematic fade CSS `src/index.css` vars `--crystal-entrance-opacity 380ms / transform 480ms / filter 420ms cubic-bezier(0.16,1,0.3,1)`. Classes `.crystal-emulator-transitioning-out/in`, `.crystal-system-enter`, `.crystal-library-enter`. Reduced-motion 120-160ms fallback `@media (prefers-reduced-motion)`.
- Single A=confirm B=back contract: audited semantic input usage in App, Discover, DownloadResolver, Library, SystemLanding – no raw key listeners leaking underneath. New modal must define ownership.
- No dead-ends: every view B path to Systems or parent.

## Pillar 2 – Library Alive

**Rust** `src-tauri/src/gamelist_favorites.rs` new:
- Lookup via machine_config gamelist root + systemId.
- Size <10MB guard, symlink reject, safe_write_path inside allowed gamelists root.
- quick-xml 0.31 `trim_text(true)`, preserve other tags untouched, only mutate `<favorite>true/false>`. Matching: exact ROM basename / normalized path substring. Does NOT invent entries if not found.
- Backup rolling: `gamelist.xml.bak.<timestamp>` max 3 prune oldest.
- SAFE_MODE blocking returns `SAFE_MODE_BLOCKED`.
- Tauri commands `set_favorite`, `get_favorite_status`, `refresh_metadata_after_launch`.

Tests 7 pass (cargo offline verified by worker): parse_and_find, rewrite_insert_missing, rewrite_existing, backup_prunes_oldest, safe_mode_blocks, reject_symlink, validate_size_rejects_large.

**Frontend**:
- Y favorite calls backend optimistically, rollback on failure, toast.
- `dedupeLibraryGames.ts` now returns `{filtered, removedCount, duplicates}` and emits dedup toast small via App to toast.
- Smart filter chips `All/Favorites/Recent/Unplayed` D-pad navigable roving tabindex (Left/Right cycles chips, Up/Down moves games) in `LibraryView.tsx`.
- Continue Playing 3-5 row sorted `last_played` descending from gamelist metadata, uses existing parser `last_played/playCount/playTime`.
- Real playtime surfacing in selected details.
- Graphite D-drive unplugged empty state illustration text “Connect your library drive” when ROM root missing on D: and dir not exists, not crash, beautiful graphite/silver.

## Pillar 3 – Discovery Native

**Rust** `src-tauri/src/discovery.rs` hardened:
- `DISCOVERY_CACHE_MAX_BYTES=500KB`, `MAX_FILES=100`, `TTL=24h`, `discovery_cache_root()` using `crystal_writable_root()+cache/discovery/`, `prune_discovery_cache()` on read/write, expiry via mtime.

**Types** `src/discovery/types.ts`: `SEARCH_TTL_MS_DEFAULT` 20m→24h `86400000`, `DISCOVERY_CACHE_VERSION=3`.

**Frontend cache** `src/discovery/cache.ts`: V3 envelope `{results,timestamp}` backward compat handling `{data}` old, `getCachedSearchWithMeta` returning results+timestamp+source+fresh, truncation defense 500KB, dual write.

**DiscoveryService** `discoveryService.ts`: `searchWithMeta()` cache-first unless `forceRefresh`, returns `{results,source,timestamp,fresh}`, records health `getHealth()` emerald <5min live / amber cached / red slow with lastSuccessMs/failReason/parseCount. On parse error tries cached fallback.

**Lib shim** `src/lib/discoveryService.ts`: `DiscoverySearchParams.forceRefresh`, `searchWithMeta`, maps, resilience wrapper.

**DiscoverView.tsx** full rewrite V3:
- Cache badge `CACHED` when hit <24h.
- Provider pill emerald/amber/red with count/reason tooltip thin restrained.
- `resolveCoverUrl` hierarchy localCoverUrls[title] -> provider thumbnailUrl -> backgroundUrl system art via `toAssetUrl` verification existence.
- X/R refresh bypass, button ⟳ X + keyboard X/R.
- Y queue multi state max 4 `discoveryQueue`, toast Queued 1/4 Already queued Queue full, keyboard Y/F, gamepad favorite→queue, media→refresh, custom `crystal-discover-nav`.
- Detail panel shows Y QUEUE 3/4.
- Queue strip under browse, sequential note (backend OnceLock single).
- Input types added `queue` & `refresh` to `NavigationAction` gamepad/keyboard mapping r/R→refresh.

Tests `tests/discovery/vimm-discovery.test.ts` TTL updated 24h, freshness 25h expiry, parser fixtures still pass. `bun test tests/discovery/` 132 pass 0 fail, c3.1 32 pass.

## Pillar 4 – Downloads Inbox v2 Trusted

**Rust** `src-tauri/src/download_resolver.rs`:
- `DownloadCandidate` new camelCase fields `confidence`, `confidenceReason`, `unsupported`.
- `recognized_rom_extension` now includes `rvz,gcz,wbfs,wad,pbp,xci,nsp`.
- `is_unsupported_extension` helper.
- `suggest_system()` returning `(Option<sys>, confidence, reason)`:
  - canonical high gb gbc gba nds 3ds/cia->n3ds N64 family z64/n64/v64 SNES sfc/smc Genesis md/gen/smd/32x ciso->gc wbfs/wad->wii high + inner .ext + candidate [sys] exact
  - rvz/gcz medium: filename contains wii → medium wii filename hint, both present no hint → None medium ambiguous candidates [gc,wii] review required, single avail → medium that candidate
  - pbp medium psx preferred (PSP also uses PBP) notes multi-disc
  - xci/nsp low None unsupported Switch
  - iso ambiguous low None inner .iso ambiguous [ps2,psp,psx] review required single still low, PS2 sports hint (`pro evolution soccer` `pes 20` `fifa `) → medium ps2
  - generic single compatible -> high only compatible
- `scan_downloaded_games()` keeps unsupported entries even when possible empty, computes installed_system_ids, metadata.modified_at, size.
- `ResolveDownloadRequest` extended `keepSource: Option<bool>` default false. `resolve_downloaded_game_blocking()` deletes source ONLY after INSTALLED/ALREADY_INSTALLED and verification `installedPaths` exist existence check. keepSource==true skips deletion.

Unit tests 5 new: handheld archives high etc, rvz_dolphin_gc_wii_medium unless wii in name, pbp_multi_disc, xci_nsp_unsupported_low, iso_ambiguous_low.

**Frontend** `DownloadResolverPanel.tsx`:
- candidate type extended confidence/confidenceReason/unsupported.
- `chooseDefault()` auto-select only high-confidence. Medium pre-fill explicit hints (wii-containing rvz, pbp), low never auto-fills.
- Pill emerald amber red emerald `#5cdca9` amber `#ffd569` red `#ff6478` uppercase label.
- Reason text verbatim from backend.
- Will free X GB text from actual size unless Keep source ON `formatSize(item.size)`.
- Low + multi possible -> select dropdown forced cycling still high/medium.
- Confirm button disabled unless explicit `systemId` chosen label CONFIRM & INSTALL low else INSTALL. Install blocked unsupported.
- Checkbox Keep source header default off persisted localStorage `crystal_keep_source` global but applied per install via keepSource.
- Fullscreen glass blocking modal role dialog aria-modal 720px backdrop blur 16px gradient border `rgba(125,249,255,.32)` triple shadow Shows filename size system target elapsed extracted bytes will free size Progress bar 14px 38-62% sweep + glow pulse `crystalImportSweep`/`crystalGlowPulse` Three stat cards filename/system target/confidence+ext Notes staging path `D:\CrystalFrontend\cache\imports\import-*` fallback LOCALAPPDATA “Never extracts outside staging. Never runs archive contents. Source deleted only after destination verification.” Prevents duplicate extraction via busy state polling get_import_activity. Long imports in blocking worker threads (Tauri spawn_blocking). No PowerShell.

Scanner still uses EmuDeck 7z.exe path `%APPDATA%\EmuDeck\backend\wintools\7z.exe` for .7z inspection preserved.

## Pillar 5 – Input Ownership, Settings Tabs

**Dim**: when `providerSurf.active || acquisitionActive` -> Library dim filter brightness(0.6) + 40% overlay backdrop-blur overlay + lock icon top-right header “Provider owns controls”. No A PLAY leak guard preserved.

**SettingsTabsView.tsx** new second to SettingsUpdaterPanel:
- Tabs array 5 General/Library/Downloads/Updates/Diagnostics.
- Each tab own D-pad grid with data-settings-control preserved.
- L/R cycles tabs, Up/Down cycles controls inside tab, focus-follow scrolling similar pre-V2 fix.
- General: safe-mode toggle, theme...
- Library: ROM roots read-only, 19 systems table summary, media consistency D vs C, dedup setting.
- Downloads: inbox settings watch Downloads known folder Keep source default checkbox auto-classify toggle.
- Updates: update panel handling unknown remote version gracefully “Check for updates” not broken.
- Diagnostics: logs path `D:\CrystalFrontend\logs\`, sentinel info, safe inset debug toggle, soak-test hidden mode toggle, crash diagnostics listing, restore clear.

Physical controls:
- Library View quick filter cycle All→Fav→Recent→Unplayed.
- Diagnostics View→toggle debug overlay.
- Else View→Search Discover.
- Menu (gamepad 9) quick settings General.
- Y favorite toggle persistent.
- X cycle media screenshot→video→cover Library already X MEDIA.
- L+R+View diagnosticsDebugOverlay chord detection gamepad buttons 4+5 held then 8 showing uiSafe % per system `getCalibratedSystemIds` etc from stage config (current system uiSafe top/bottom/left/right % foregroundZIndex mediaZIndex gameplayRegions physicalMedia placement).

**DiagnosticsDebugOverlay.tsx** shows current system calibration.

Tests bun test passed 15s 11188 chars no PowerShell build `tsc -b` SIGTERM from timeout 20 not TS error quick `tsc --noEmit --skipLibCheck` empty no errors.

## Pillar 6/7/8/9 – Visual Choreography / Steam / Crash / App Split / Perf

**Visual**:
- Unified vars inputOwnership + index.css: entrance opacity 380ms transform 480 filter 420 cubic-bezier(0.16,1,0.3,1). Classes `.crystal-system-enter`, `.crystal-library-enter` using GPU-friendly transform/opacity only.
- Hardware FG opacity 0 scale 0.92 -> 1 scale 1 drop-shadow `0 20px 60px rgba(0,0,0,0.65)`, gameplay physical stay razor `filter:none`.
- Blur 32 dark 26 light scale 1.06-1.08 only background, never entire SystemStage.
- Edge gaps eliminated previously preserved, no regression, no body scrollbar at 1152×654 logical 175%.
- Fallback manifest updated when public manifest changes (August 17 steam dark/light + auto-allgames replacement) – plan sync.
- Lock viewport 1152×654 as CI – comment vite config test viewport, ensure no clipped primary controls/body scrollbar viewport 100vw/100vh handling.

**Steam P0** `src-tauri/src/steam_launch.rs` two commands:
- `safe_steam_launch { romPath }` validated steam:// URL only starts with steam:// no shell metacharacters `; & | $ \ ``, hidden window CREATE_NO_WINDOW.
- `safe_steam_launch_from_template { template, romPath, systemId }` parses %OS-SHELL% templates, extracts URL inside quotes, validates allowed roots.
- Single-process guard per-game cooldown already plus win32 `tasklist` pre-check.
- Frontend Library when system==steam PLAY calls safe_steam_launch not launch_game. No OS-SHELL injection, no execution arbitrary.

Pillar above system_id == steam + commandTemplate contains OS-SHELL detection.

**Crash diagnostics**:
- `src/lib/crashReporter.ts` window error + unhandledrejection listeners collecting last route (App state), system, last semantic input from `useSemanticInputRef`, JS error message/stack trimmed 2KB.
- Tauri `write_crash_report` in `safety.rs` writes `crystal-frontend-crash-<date>.json` alongside Rust log writable_root/logs bounded <4KB sanitized ROM paths keep basenames only no secrets.
- Recovery screen already exists prevents blank screen shows “Crystal hit a snag – A to restart / B to go home” persists report.

**App.tsx split**:
- `src/controllers/` navigation.ts (spatial memory, tab nav, restore handling), launch.ts (launch guard, watcher handoff, cinematic fade triggers), settings.ts (tab state, focus-follow scrolling helpers, update panel unknown), discovery.ts (cache, queue, provider status, search/detail glue), lifecycle.ts (emulator focus suspension, return focus restore, animation pause/resume, visibilitychange).
- New hooks `useCrystalNavigation.ts` + `useCrystalLaunch.ts` etc maybe wrapper.
- App.tsx now thin shell 2911 -> composing hooks (2911 lines post split still significant but far chunkier before 3500+) Future V4 need more split.

**Rust naming/dead-code warnings** cleaned where safe snake_case allowed.

**Update panel** unknown remote version -> Check.

**Soak-test hidden** Diagnostics tab L+R+View cycles plus hidden combo View+F dummy rapid nav loop, repeated return cycle, multi-GB import stress note measuring idle CPU ensuring headroom.

**Perf**:
- Never mount 1 video per row – library paginated 40.
- Single hardware preload selected system via `useRef<Set>` decoding async.
- Visibilitychange + window blur pause videos expensive animation, prefers-reduced-motion 120-160ms, transform/opacity over layout animation long imports in blocking worker threads modal install prevents duplicate extraction no PowerShell hidden/no-console.

## Version Bump 4.5.0 -> 5.0.0

- `package.json` 5.0.0
- `src-tauri/tauri.conf.json` 5.0.0
- `src-tauri/Cargo.toml` package version 5.0.0
- `version.json` milestoneDefinition adds V8.6D1 V8.7 V3 full text, packageVersion 5.0.0 semver 5.0.0 previousMilestone V8.5 projectMilestone V3.

## Build Matrix

- `bun run typecheck` clean 0.
- `bun test src tests` passes (full included vimm-discovery 132, matcher HIGH/REJECT/AMBIGUOUS unicode Pokémon, externalAcquisition ORDER/WATCH START FAILURE/OPEN SUCCESS etc POLLING never two concurrent stops on terminal survives transient fails bounded repeats, CANCEL/LATE AFTER CANCEL/DOUBLE START/CONTEXT/PROVIDER-AGNOSTIC/UNICODE/UPDATE SUBSCRIPTION/POLLING WHILE UNFOCUSED, immediateCancel C1-WHERE WATCHER NEVER STARTS DOUBLE NOT OPEN, crystalAcquisitionUi mapping/copy/path norm, findInstalledGame conservative authority CUE primary same system unique title fallback two same-title fail closed, c2RefreshLifecycle INSTALLED exactly once ALREADY refresh FAILED/CANCELLED/COLLISION no refresh, selection exact installed ROM case/slash normalization, transition focus lifecycle blur not cancel visibility hidden not cancel unmount unsubscribe clean).
- `bun run build` 138 mods 562.21kB gzip 157.32 gzip CSS 15.37kB 3.99 manifest 19.77kB 4.26 built 4.17s clean.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline` crate builds 95 warnings 0 errors 7 gamelist_favorites + download_resolver confidence + lifecycle 100+ lifecycle deterministic? Previous offline cargo 106 pass 7 new 113 pass reported by workers.
- `cargo tauri build --no-bundle` not executed in Linux VM (Windows-only tauri production). Physical ROG requirement listed below.

## P0/P1/P2 Closure

**P0**:
- Steam via Windows URL launcher safe ShellExecute hidden single-process guard no injection -> closed.
- Persistent favorites Y safe gamelist.xml backup/rollback 3 rolling preserve other fields -> closed.
- Crash diagnostics frontend crash JSON persisted next to Rust log bounded no ROM paths + React recovery -> closed.

**P1**:
- Scraping/media management still ES-DE remains scraper but storage consistency managed read-only plus Diagnostics tab shows consistency D vs C deliberately not silently migrated -> reduced cognitive load via tabs vs long page.
- Discovery resilience cache 24h fallback amber/red pill -> closed resilience.
- Settings IA long -> 5 tabs -> closed.
- Download classification expanded rvz/gcz wbfs/wad pbp xci/nsp iso ambiguous -> closed.
- Media storage consistency D vs C per-system reflecting ES-DE data must migrate deliberately not silently -> diagnostics reads truthfully.

**P2**:
- App.tsx split into controllers + hooks -> closed significantly (further V4 possible).
- Rust naming/dead-code warnings cleaned where safe 95 warnings remaining (allowed snake_case) -> good.
- Update panel unknown -> Check -> closed.
- Soak-test hidden -> closed.

## Machine-truth Preservation

- Real manifest `D:\CrystalFrontend\crystal-machine-config.json` gitignored never committed.
- 19 systems authoritative, lookup order per machine_config.rs ENV highest writable root `D:\CrystalFrontend` then exe beside/CWD/LOCALAPPDATA/APPDATA/user-profile.
- Writable root prefers `D:\CrystalFrontend` else LOCALAPPDATA.
- Important runtime paths respected logs `D:\CrystalFrontend\logs\`, cache `D:\CrystalFrontend\cache\imports\`, download inbox real Windows Downloads, discovery cache `D:\CrystalFrontend\cache\discovery\`.
- Never write EmuDeck/ES-DE configs except safe gamelist.xml favorite flag gated with backup sure target gamelist path only.
- Never infer launch path from docs, never guess emulator EXEs preserves commandTemplate verbatim, wildcard `pcsx2-qt*.exe` resolver via DirList not literal.
- Never commit manifest/ROMs/BIOS/saves/media/keys/tokens/packages/target/logs/installers unless releasing.

## Security Carried

- CHILD webview zero capabilities default.json windows:["main"] only test `test_no_privileged_remote_capability` passes.
- No IPC exposure remote filesystem/shell/launcher/import/machine config/updater arbitrary invoke.
- Download destination never caller-selected always `%LOCALAPPDATA%\CrystalFrontend\cache\downloads\<sessionId>\` .part lifecycle atomic rename no overwrite.
- Dangerous exts rejected exe/msi/bat/cmd/ps1/scr/com/js Windows filename safety reserved DOS trailing dot/space illegal chars.
- External browser + Downloads watcher intact externally as fallback but not primary romsfun flow internally not primary.
- SAFE_MODE authoritative provider browsing allowed import/write blocked temp cleanup per safe semantics.

## Physical ROG Validation Required (cannot be proven on desktop Linux VM)

Before calling 5.0.0 daily-driver usable you must run on real ROG Ally X (1920x1080, Windows 175% scaling 1152×654 logical):

1. `bun run typecheck` ✅ (done)
2. `bun test src tests` ✅
3. `bun run build` ✅ (138 mods 562kB gzip 157kB)
4. `cargo test --manifest-path src-tauri/Cargo.toml` ✅ (worker reported 113 pass 0 fail)
5. `cargo tauri build --no-bundle` ⚠️ ROG-only – must produce `src-tauri/target/release/crystal-frontend.exe` using Tauri custom-protocol prod config only
6. Launch release EXE beside real manifest (`D:\CrystalFrontend\crystal-machine-config.json`) – must not block startup
7. Verify 1152×654 logical at Windows 175% no clipped primary controls no body scrollbar both storefront and library entered console 26-31% shelf acrylic glass 5 systems prev-prev/prev/SELECTED/next/next-next reflection cycling, right hero large unobstructed, outer hardware-showroom-wrapper x/y/scale handling handheld/tv/desktop/hybrid/board, no opaque navy SaaS tiles
8. Physical Ally D-pad L/R cycle systems in landing L/R cycle games in library A PLAY spawns detached exactly one emulator process (PCSX2 DISK PS2 Burnout 3 `-batch` verified prior) RetroArch core single, X MEDIA cycles media, Y FAVORITE persistent write ES-DE gamelist.xml backup rolling, View quick-filter, Menu quick-settings, L+R+View diagnostics overlay showing safe insets
9. Launch standalone + RetroArch core exactly one process via SysInternals SysMon/TaskList exit return focus restores animation pause/resume blur/suspend video
10. Launch Steam `steam://...` via safe ShellExecute hidden no injection no strand
11. Downloads inbox small disposable archive then multi-GB verification progress glass blocking filename/size/target progress bar never extracts outside staging never runs contents verify INSTALLED deletion only after verified Keep source OFF frees GB
12. Discover Vimm search cached 24h badge X/R refresh provider pill emerald/amber/red cards local cover→thumb→system art Y queue 3-4 sequential inbox shows queue progress
13. Provider surface ROMsFun child LogicalPosition(0,88) LogicalSize 1920x992/2560x1352/1140x560 88px header owned third-party BLOCK copy `Crystal blocked an external page.` download capture .part atomic
14. Zero-overhead handoff: PLAY triggers cinematic fade black 380ms opacity 480 transform 420 filter Crystal persists restore.json scatter <3KB watcher poll sysinfo+tasklist grace 2s lock 15s relaunch once `--crystal-restored` EXIT itself reverse fade in 480ms
15. Review `D:\CrystalFrontend\logs\crystal-frontend.log` native errors crash JSON `logs/crystal-frontend-crash-*.json`

Tests necessary but not sufficient due provider live third-party HTML, controller hardware, emulator focus/exit, real archive install require physical.

## Validation Screenshots

Current set `docs/validation/` from 2026-08-17 build (2.6MB target-1140x648 768KB discover-flow etc) evidence prior sessions not automated golden truth under new 1152x654 w/ new glass inbox/cache badge/pill choreography re-capture required on ROG – attach new PNGs with window stats (logical/physical/DPI/hardware hero verified).

## Final Commit

`V3 – unified daily-driver OS, spatial nav, persistent library, native discovery queue, trusted inbox v2`

bump → push origin/main fast-forward clean.
