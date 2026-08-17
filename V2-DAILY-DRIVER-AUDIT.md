# Crystal V2 Daily-Driver Audit

Date: 2026-08-16  
Machine: ROG Ally X, Windows, 175% display scaling

## Executive status

Crystal is now suitable for regular testing across the populated EmuDeck console library, but it is not yet feature-complete enough to replace ES-DE for every workflow. The core console path—browse, inspect media, launch one emulator process, return, Discover, and resolve completed downloads—is operational. Steam launching, persistent favorite editing, first-party scraping, and crash telemetry remain the largest daily-driver gaps.

## Fixed in this V2 stabilization pass

- ES-DE wildcard emulator paths are resolved correctly. PCSX2's `pcsx2-qt*.exe` rule now selects an installed executable instead of treating `*` literally.
- A real PS2 launch was validated with Burnout 3. Exactly one `pcsx2-qt.exe` process was created with the correct ISO and `-batch` argument.
- Duplicate launch protection remains active at the input, frontend lock, and backend cooldown layers.
- Settings now uses spatial D-pad navigation with focus-follow scrolling instead of a fragile flat button cycle.
- Discover now renders visual cards using existing local covers, selected-item provider artwork, and system art fallback.
- Discover removes provider navigation links that were incorrectly parsed as games.
- Crystal suspends video, animation, keyboard, and gamepad work while an emulator owns focus.
- A controller-accessible React recovery screen now prevents a component error from becoming an unexplained blank/crashed interface.
- Download installation remains asynchronous with visible progress and verified cleanup of completed source archives.

## Verified machine readiness

- 19 populated/configured systems were audited.
- All populated non-Steam systems resolve their selected emulator executable on disk.
- All selected RetroArch cores for Dreamcast, GB, GBA, GBC, Genesis, Mega Drive, N64, NDS, and SNES exist.
- PCSX2, Dolphin, Azahar, PPSSPP, DuckStation, Cemu, xemu, and Xenia selected standalone executables resolve.
- The release app starts and remains responsive with low idle CPU usage.

## Remaining P0 daily-driver blockers

1. **Steam launch capability** — the authoritative ES-DE command uses `%EMULATOR_OS-SHELL%`; Crystal deliberately blocks that capability. Steam entries display but cannot yet be launched through the same safe backend.
2. **Persistent favorites** — Y currently changes only the in-memory game object. It does not safely update ES-DE metadata, so the choice is lost after refresh/restart.
3. **Crash diagnostics** — the new UI recovery boundary prevents a blank screen, but there is no structured frontend crash report persisted beside the Rust log.

## Remaining P1 improvements

1. **Scraping/media management** — Crystal reads ES-DE media well but does not provide a ScreenScraper-compatible workflow. ES-DE remains the media scraper.
2. **Discovery resilience** — the provider is a live third-party HTML surface. Parsers, availability, thumbnails, and catalog completeness can change outside Crystal's control. Cache and schema detection reduce failure impact but cannot guarantee service.
3. **Settings information architecture** — navigation is now reliable, but the page is still long. A future tabbed layout (General, Library, Downloads, Updates, Diagnostics) would reduce cognitive load.
4. **Download classification** — ambiguous archives still require a console choice. Content-based detection should be expanded for disc descriptors and platform-specific signatures.
5. **Media storage consistency** — the machine manifest declares a D: media root while several per-system media directories still point to C:. This reflects the current ES-DE data and should be migrated deliberately, not silently by Crystal.

## Remaining P2 engineering debt

- `App.tsx` owns too many responsibilities and should be split into navigation, launch, settings, discovery, and lifecycle controllers.
- Rust emits numerous naming/dead-code warnings; these do not block runtime but reduce signal in build output.
- The update panel currently reports an unknown remote version when the release endpoint is unavailable.
- Add long-duration soak tests for rapid controller navigation, provider timeouts, repeated emulator return cycles, and multi-gigabyte archive imports.

## Daily-driver recommendation

Use Crystal as the primary browsing and emulator-launch frontend for the validated console systems. Continue using ES-DE for scraping and as a fallback for Steam/per-game configuration until the P0 items above are implemented. Keep the stable EmuDeck/ES-DE installation unchanged as Crystal's source of truth.
