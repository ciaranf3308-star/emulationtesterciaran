# Logging – Crystal Frontend V8

**Principle:** All writable outputs live under OS app-data, never beside ROMs, never inside EmuDeck/ES-DE, never in repo working dir unless explicitly `cargo tauri dev`.

## Locations (Windows primary – ROG Ally)

| Purpose | Resolved Path | Notes |
|---------|---------------|-------|
| App data | `%LOCALAPPDATA%\CrystalFrontend\` | `dirs::data_local_dir()` – primary install target |
| Logs | `%LOCALAPPDATA%\CrystalFrontend\logs\` | `crystal-frontend-{YYYY-MM-DD}.log` – tailed |
| Cache / Sentinel | `%LOCALAPPDATA%\CrystalFrontend\cache\` | `sentinel-before.json`, `sentinel-after.json`, `sentinel-*.json` – read-only audits |
| Roaming fallback | `%APPDATA%\CrystalFrontend\logs\` | Used when local data not resolvable, or on Linux/macOS CI |
| Machine config (read-only) | `%LOCALAPPDATA%\CrystalFrontend\crystal-machine-config.json` (optional) | One of discovery candidates – never written by app |

Resolution in Rust:

```rust
let base = dirs::data_local_dir().unwrap_or(dirs::config_dir().unwrap());
let log_dir = base.join("CrystalFrontend").join("logs");
let cache_dir = base.join("CrystalFrontend").join("cache");
```

In TS frontend (dev panels):

```ts
import { localDataDir } from '@tauri-apps/api/path'
const base = await localDataDir(); // C:\Users\…\AppData\Local
const logFile = base + '/CrystalFrontend/logs/crystal-frontend.log';
```

## What is logged

- `get_machine_config` – tried candidate list, chosen path, parse errors (no ROM paths dumped in prod error to UI, full in log file)
- `list_games` / `list_all_games` – systemId, file counts, gamelist join misses, extension filter set
- `verify_media` – per-system/rom media type candidates, exists bool, found path
- `launch_game` – expanded command template with placeholders resolved, workingDir, existence check of emulator exe, spawn success/failure, PID, `CREATE_NO_WINDOW` flag, STARTDIR prefix handling
- `sentinel` – Node tool logs its own scan count and diff unexpectedCount (separate from app log)
- Hardware stage – calibration warnings if unknown systemId (should never for 19 systems), outer scaling 1.16-1.22 invariance checks
- Golden screens – landing/library view transitions, media race debounce cancellation (mediaRequestIdRef monotonic)

## What is NOT logged (privacy)

- Full ROM file hash / ROM content
- Emulator contents or emulator absolute paths beyond existence check (only first 100 chars)
- No write of machine config (read-only)
- No telemetry to network – offline-only by default

## Retention

- Logs rotate daily, retain 7 days in `%LOCALAPPDATA%\CrystalFrontend\logs\` – guarded by `tauri-plugin-fs:allow-write-text-file` scoped to that path only (see TAURI-PERMISSIONS-AUDIT.md). Sentinel JSONs not auto-deleted – user may delete `cache/` manually.
- In `cargo tauri dev`, logs also mirrored to console `stdout` with prefix `[crystal]`.

## Safe-mode interaction

- In `CRYSTAL_SAFE_MODE=1`, logging is verbose but still app-data only – no external file touches. Sentinel diff verifies this: `crystal:cache-dir` and `crystal:logs-dir` targets are expected to change and excluded from unexpected check.

## How to tail on ROG

```bat
C:\Users\%USERNAME%\AppData\Local\CrystalFrontend\logs> powershell Get-Content crystal-frontend-2026-08-10.log -Wait -Tail 50
```

## Build env handling

- `CRYSTAL_DRYRUN=1` (CI non-Windows) – `launch_game` returns Ok() without spawn to simulate Windows exe existence – logs "dryrun success" instead of "spawn".
- `CRYSTAL_MACHINE_CONFIG` – env var highest priority for config discovery – logs candidate list with chosen path when load succeeds, all tried when fails.

This doc satisfies E) Logging doc requirement – logs under app-data mentioned in ROG-FIRST-BOOT, TAURI-PERMISSIONS-AUDIT, and here.
