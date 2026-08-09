# ROG First Boot – Safe Sequence (Crystal Frontend V8)

**Hardware:** ASUS ROG Ally / ROG Ally X – Windows 11 primary target – EmuDeck for Windows + ES-DE installed.
**Goal:** Verify Crystal Frontend on real ROG hardware without modifying existing EmuDeck/ES-DE install or ROMs.
**Invariant:** Never write EmuDeck/ES-DE configs, gamelists, themes, ROM folders. Read-only.

---

## 0. Pre-reqs (one-time)

- EmuDeck for Windows installed and working (ES-DE boots, ROMs scanned).
- Node 20+, Bun or npm, Rust 1.77+, Tauri v2 CLI `cargo install tauri-cli --version 2`.
- Git.

---

## 1. Clone to a NEW folder (do not reuse EmuDeck / ES-DE folder)

```bat
C:\> mkdir D:\CrystalLab
C:\> cd D:\CrystalLab
C:\CrystalLab> git clone https://github.com/ciaranf3308-star/emulationtesterciaran.git Crystal
C:\CrystalLab> cd Crystal
```

> Why NEW folder: Crystal must never live inside `C:\EmuDeck`, `D:\Emulation`, or `%APPDATA%\ES-DE` to avoid accidental gamelist overwrite or theme collision. `.gitignore` already blocks `crystal-machine-config.json`/`machine-config.json` from commit – never move your generated config into that ignored pattern inside ES-DE.

## 2. Install deps only (no global system changes)

```bat
D:\CrystalLab\Crystal> bun install   :: or npm install
D:\CrystalLab\Crystal> cargo fetch  :: Rust deps under target\ only
```

Nothing here touches `%LOCALAPPDATA%\CrystalFrontend` yet, and must not touch `%APPDATA%\ES-DE\`.

## 3. Do NOT modify EmuDeck / ES-DE

- Do not copy ROMs.
- Do not run ES-DE theme installer.
- Do not edit `es_settings.xml`, `es_systems.xml`, `settings.sh`.
- Crystal will read those paths via `std::fs::read_dir` only – see `src-tauri/src/main.rs` `list_files_in_dir`.

## 4. Discover – supply machine config read-only

Generate or copy an existing machine config (real Windows paths) to a location in discovery order, read-only:

**Deterministic order (highest→lowest) – documented in `main.rs`:**

1. `$CRYSTAL_MACHINE_CONFIG` env var – absolute path override
2. `<exe>/crystal-machine-config.json` and `<exe>/machine-config.json`
3. `<exe_parent>/crystal-machine-config.json`
4. `./crystal-machine-config.json` (CWD)
5. CWD parent / grandparent search
6. `%LOCALAPPDATA%\CrystalFrontend\crystal-machine-config.json`
7. `%APPDATA%\CrystalFrontend\crystal-machine-config.json`
8. `~ /crystal-machine-config.json`, `~/.config/crystal/crystal-machine-config.json`

For ROG first boot:

```bat
D:\CrystalLab\Crystal> set CRYSTAL_MACHINE_CONFIG=D:\CrystalLab\machine.json
D:\CrystalLab\Crystal> notepad D:\CrystalLab\machine.json
```

Example machine.json must contain:

```json
{
  "schemaVersion": 1,
  "roots": {
    "rom": "D:\\EmuDeck\\Emulation\\roms",
    "gamelists": "D:\\EmuDeck\\EmulationStation\\.emulationstation\\gamelists",
    "scrapedMedia": "D:\\EmuDeck\\EmulationStation\\.emulationstation\\downloaded_media"
  },
  "systems": [ /* 19 systems with id, fullName, romDirectory, validExtensions, EmuDeck findRules */ ]
}
```

No write occurs – `load_machine_config_json()` never calls `writeFile`. If invalid (missing `schemaVersion` or `systems` array or wrong version), backend returns `Err` and frontend blocks start – never falls back to fake/example in Tauri mode. Browser dev example fallback lives only in `src/machine/loader.ts` gated by `isTauriEnvironment()==false`.

## 5. START IN SAFE MODE

Safe mode = Crystal truth-only, no external mutations.

- Ensure env: `CRYSTAL_SAFE_MODE=1` (frontend flag checked before any write paths) and launch via cargo:

```bat
D:\CrystalLab\Crystal> set CRYSTAL_SAFE_MODE=1
D:\CrystalLab\Crystal> set CRYSTAL_SENTINEL_DIR=%LOCALAPPDATA%\CrystalFrontend\cache
D:\CrystalLab\Crystal> cargo tauri dev
```

- Verify window title shows `Crystal Frontend` 1920×1080 borderless with controller hint.
- In Tauri devtools console, `localStorage.getItem('crystal:safeMode')` should be `'1'`. Safe mode disables any future auto-write migrators, ROM cache writes outside app-data, and hides dangerous emulator reinstall prompts.

If you see "Real machine configuration failed to load" – stop, fix machine config path, do not create dummy ROM folders inside ES-DE.

## 6. Verify enumeration / artwork / metadata / media / controller – all read-only

In SAFE MODE:

- **Enumeration:** SYSTEM view → `01 / 19 CONSOLE` real count, not hardcoded. `list_games` should show real ROM counts per system from `enumerate_games_for_system`. Check logs at `%LOCALAPPDATA%\CrystalFrontend\logs\` (see LOGGING.md).
- **Artwork:** RIGHT hero 66-70% empty – Crystal bg, no opaque panel. Platform logo swappable – no raw IDs.
- **Metadata:** Select system → landing shows facts 2-3 chips, YOUR LIBRARY total/fav real, CONTINUE PLAYING if `last_played` truthy else collapsed. No "No history" fabrications.
- **Media:** Enter Library (`A`) – LEFT 37% meta clamped 640 chars, RIGHT hardware stage transparent (22 PNGs), BOTTOM 22% carousel 5-7 covers. `verify_media` returns `covers/physicalmedia/screenshots/titlescreens/videos/marquees/miximages` – no N/A invent. `dual-screen truthful primary only` flag preserved for NDS/N3DS.
- **Controller:** L/R cycle systems in landing, L/R cycle games in library, `A PLAY` spawns detached (`CREATE_NO_WINDOW`), `B` returns to system, `X MEDIA` cycles media, `Y FAVORITE` marks. No mouse required. No flash/bounce.

All enumeration uses `std::fs::read_dir` + gamelist.xml join – no ES-DE process started; ES-DE settings untouched.

## 7. Exit cleanly

`Alt+F4` or `B` back → close window. No extra tray processes. Validate `target/` build artifacts only – no creation of `D:\EmuDeck\tools\Crystal*`.

## 8. Confirm no external changes via Sentinel

Before safe-mode run you should have taken a BEFORE snapshot:

```bat
D:\CrystalLab\Crystal> node tools/sentinel.mjs snapshot --config D:\CrystalLab\machine.json --out %LOCALAPPDATA%\CrystalFrontend\cache\sentinel-before.json
```

After exit, take AFTER snapshot and diff:

```bat
D:\CrystalLab\Crystal> node tools/sentinel.mjs snapshot --config D:\CrystalLab\machine.json --out %LOCALAPPDATA%\CrystalFrontend\cache\sentinel-after.json
D:\CrystalLab\Crystal> node tools/sentinel.mjs diff %LOCALAPPDATA%\CrystalFrontend\cache\sentinel-before.json %LOCALAPPDATA%\CrystalFrontend\cache\sentinel-after.json --json sentinel-diff.json
```

Sentinel scans (pure read):
- ES-DE settings xml, custom systems xml, features xml, find-rules xml, gamelists dir file counts
- Per-system `gamelist.xml` mtimeMs/size
- Crystal theme dir file counts
- EmuDeck `settings.sh`, `emus.json` mtimes
- ROM/scrapedMedia root existence (no ROM file hashing – avoids heavy I/O)

If `unexpectedCount>0` (non-Crystal paths modified), DIFF exits code 1 and lists MOD/ADDED/REMOVED. Safe-mode fails – restore from backup before continuing.

Crystal-internal `%LOCALAPPDATA%\CrystalFrontend\cache\` changes are expected and ignored in unexpected check (logs, sentinel snapshots).

## 9. Only then disable safe mode

If sentinel reports:

```
=> Safe-mode PASSED – no external ES-DE/EmuDeck/gamelist changes detected.
```

You may launch normal mode for extended testing:

```bat
D:\CrystalLab\Crystal> set CRYSTAL_SAFE_MODE=
D:\CrystalLab\Crystal> cargo tauri dev
```

Normal mode still read-only for machine config – it never writes `crystal-machine-config.json`. Future V8.2 may add opt-in cache writes inside app-data only, gated by explicit user consent.

## 10. Logging & Audit trail

All logs live under app-data – see `docs/LOGGING.md`:

- `%LOCALAPPDATA%\CrystalFrontend\logs\crystal-frontend-{date}.log` – launch attempts, enumeration counts, verify_media misses, hardware calibration warnings.
- `%LOCALAPPDATA%\CrystalFrontend\cache\sentinel-*.json` – provenance for audits.
- `%APPDATA%\CrystalFrontend\logs\` fallback on non-Windows or when local data resolves to roaming.

Never copy logs containing absolute ROM paths to public GitHub issues – sanitize machine config before posting (`roots` redacted).

---

### Safety Summary for ROG Ally

- Clone NEW folder (not inside EmuDeck)
- Deps only – no global installs outside cargo/bun
- Read-only machine config discovery, deterministic precedence, env var highest
- Real config mandatory in Tauri – no fake fallback
- SAFE MODE start
- Verify truth-only gaming OS: boutique hotel language NOT in Crystal, graphite/electric only
- Exit clean
- Sentinel BEFORE/AFTER diff – pure read, zero external writes
- Only then disable safe mode
- All logs under app-data, no repo commits

This doc satisfies V8.1 ROG-FIRST-BOOT 10-point spec.
