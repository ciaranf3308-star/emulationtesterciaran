# Crystal Frontend — Premium Fullscreen Windows Gaming Frontend for EmuDeck

Replaces ES-DE's *visual* layer only. Keeps your existing EmuDeck installation — emulators, BIOS, saves, tools — exactly where it is.

## Core Idea
- EmuDeck already sets up `Emulation/roms/{system}/`, `bios/`, `saves/`, `tools/launchers/`, and installs emulators to `%APPDATA%\Roaming\EmuDeck\Emulators\` on Windows.
- ES-DE is just a scanner + `%ROM%` template → spawner.
- Crystal keeps that proven flow, but with a boutique-hotel, Soho House + Hume intimate-warm UI instead of weak ES themes. Fullscreen 100vw 100vh, no window chrome, no faux terminal/orange Vault dashboard.

## What This Repo Contains (after refactor)
This branch is no longer Vault. Vault was prototype only:
- `prototype/original-vault.html` — preserved as historical reference, not used.
- `src/` — React + TypeScript + Vite app
- `public/assets/Crystal-Frontend-Asset-Pack/` — real asset pack from existing working ES-DE theme (22 light/dark backgrounds, 21 light/22 dark logos, 231 carousel icons, 6 shared UI, manifest.json, ASSET-INVENTORY.md). Steam Light logo is known missing → fallback to dark.

## Tech Stack
- React 18 + TypeScript + Vite 5 (Node 18 compat)
- Ready for Tauri shell (Windows .exe, single 8-12 MB installer, not Electron)
- Tauri boundary in `src/desktop/emuDeckBridge.ts` and `src/tauri/index.ts`
- No fake stats: when running in browser, ROM counts are empty placeholders. Real scan via Tauri.

## Asset Pack Contract
- **Never rename/regenerate/recompress artwork.** Preserve supplied filenames and system IDs exactly.
- Manifest is source of truth: `manifest.json` maps systemId → backgroundLight/Dark, logoLight/Dark, carouselIcon
- Inventory doc `ASSET-INVENTORY.md` lists dimensions and missing counterpart (Steam Light)
- Light backgrounds are 1672×941 PNGs, dark are 256×128 WEBP (intentionally small, we keep as-is, blur/scale handled via CSS)
- Logos similar resolution, dark has steam.png, light missing steam.
- Carousel icons 28×28 WEBP, used at 28 px size inside 72 px well.
- Shared UI SVGs used for chrome/favorites.

### Primary Systems Filter
Pack has 231 icons, but primary carousel is filtered to systems that actually have backgrounds/logos:
`auto-allgames, dreamcast, gb, gba, gbc, gc, genesis, n3ds, n64, nds, nes, pokemon, ps2, psp, psx, snes, wii, wiiu, windows, xbox, xbox360, steam`

This list is derived from `manifest` and `ASSET-INVENTORY`.

## Running Frontend Without Tauri (browser dev)
```bash
cd emulationtesterciaran-refactor
bun install
bun run dev   # vite on port 1420
```
App will fetch `/assets/Crystal-Frontend-Asset-Pack/manifest.json`, show carousel, allow light/dark toggle (swaps backgrounds/logos), show detail pane with real asset paths (no fake launch details). Keyboard ←→ to switch, mouse click carousel.

Theme toggle respects manifest: Steam light → fallback to dark logo.

Fullscreen CSS: `html,body,#root { width:100vw; height:100vh; overflow:hidden }`

## Tauri Desktop Shell (when ready)
Boundary interfaces:

```ts
scanEmuDeckRoms(rootPath: string): Promise<{root, discoveredSystems}>
getSystemList(): Promise<string[]>
launchGame(systemId, romPath): Promise<void>
readSaveStates(systemId?): Promise<any[]>
getBackgroundPath(systemId, theme): Promise<string|null>
getLogoPath(systemId, theme): Promise<string|null>
```

In browser, these are mock no-ops returning empty placeholders — UI must not fake counts.

### Tauri setup (when cargo available)
```bash
npm install -D @tauri/cli
npx tauri init # choose app identifier com.crystal.frontend, window fullscreen true
# configure tauri.conf.json:
# - windows bundle: Windows msi/nsis, fullscreen, no decoration
# - permissions: shell (open emulator exes), fs scope = Emulation folder + %APPDATA%\EmuDeck
# - build.frontendDist = ../dist
# npx tauri dev
# npx tauri build
```

See `TAURI-INTEGRATION.md` for full checklist.

## GitHub Repo Prep
Fresh clone from https://github.com/ciaranf3308-star/emulationtesterciaran currently only had `index.html` single Vault prototype. This refactor replaces it with Vite structure plus `prototype/` folder. Do not push Vault branding. Original file is kept solely as historical reference.

## EmuDeck Underneath
- No move of ROMs needed. Point Crystal at your existing `C:\Emulation` or custom EmuDeck install path.
- BIOS stays in `Emulation/bios/`
- Saves remain in `%EMUDECK%\Emulators\{emu}\` + `Emulation/saves/` symlink pattern
- Launch strings mimic EmuDeck/ES-DE templates: RetroArch `-L cores\<core>_libretro.dll "%ROM_RAW%"`, Dolphin `-b -e`, PCSX2 `-batch -nogui`, Cemu `-f -g`, etc. Vault logic reused, UI replaced.

## Remaining Work
- Wire Tauri FS + shell real impl in Rust (`src-tauri/src/main.rs`)
- EmuDeck path picker + persistent config (`localStorage` → Tauri store)
- Real gamelist.xml parsing for favorites/recent (from `%APPDATA%\ES-DE\gamelists\{sys}\gamelist.xml` or `roms\{sys}\gamelist.xml`)
- Scrape cache reuse: ES-DE downloaded_media reuse for boxart
- Game grid per system after ROM scan (currently carousel-only)
- Launch overlay progress + error handling
- .bat exporter for Steam ROM Manager compatibility
- Controller navigation polish

Built boutique-hotel warm, no cheap flashing, polished micro-interactions only.

