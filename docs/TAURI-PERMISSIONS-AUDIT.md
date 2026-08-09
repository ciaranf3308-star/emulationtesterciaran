# Tauri Permissions Audit – V8.1

**Date:** 2026-08-10
**Scope:** `src-tauri/capabilities/default.json` + plugin usage in `src-tauri/src/main.rs` & frontend `src/machine/loader.ts`

## Current Capability (verbatim)

```json
{
  "$schema": "https://schema.tauri.app/config/2/capability",
  "description": "Default capability for main window – Crystal Frontend V6 real runtime",
  "identifier": "default",
  "local": true,
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-fullscreen",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:event:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:path:default",
    "core:path:allow-resolve-directory",
    "core:resources:default",
    "dialog:default",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-exists",
    "fs:allow-read-dir",
    "fs:allow-stat",
    "fs:allow-write-text-file",
    "path:default",
    "shell:default",
    "shell:allow-open"
  ],
  "windows": ["main"]
}
```

Count: 23 permission strings, single window `main`, local=true.

## Justification per permission

| Permission | Used? | Why / Risk |
|---|---|---|
| `core:*` | yes | window lifecycle, events, path resolution – required for Tauri v2 invoke |
| `core:path:allow-resolve-directory` | yes | `dirs::data_local_dir` equivalent in JS for log/cache path resolution |
| `core:resources:default` | yes | loading bundled `index.html` resources |
| `dialog:default` + `allow-open` | future | Crystal First-Boot wizard will allow user to pick `crystal-machine-config.json` via OS dialog. Currently unused but needed for V8.1 UX; read-only picker, safe. |
| `fs:default`, `fs:allow-read-text-file`, `fs:allow-exists`, `fs:allow-read-dir`, `fs:allow-stat`, `fs:allow-write-text-file` | **frontend fallback only** | `src/machine/loader.ts` tries `node:fs` then `plugin-fs:readTextFile` to load config when `isTauriEnvironment()==false` (browser dev). Real runtime `get_machine_config`, `list_games`, `verify_media`, `launch_game` use Rust `std::fs` directly, which bypasses plugin permission. So narrowing plugin fs does **not** break ROM enumeration. Plugin-fs write is used only for Crystal app-data cache (logs, sentinel snapshots) under `%LOCALAPPDATA%/CrystalFrontend/` – safe to restrict. |
| `path:default` | yes | frontend `path` plugin for converting OS paths, resolving cache/log dir |
| `shell:default` + `allow-open` | unused in backend (we use `std::process::Command`) | `shell:allow-open` is used by frontend to open explorer to ROM/media folders via `openPath`? Not strictly required for `launch_game`. Keeping `allow-open` only retains least-privilege OS shell for "Show in Folder" and URL open. `shell` spawn not used – no `shell:allow-execute`. |

## Least-privilege analysis

- **ROM/media enumeration must read arbitrary drives** (`D:\EmuDeck\...`, `E:\ROMs\`). This is done in Rust `std::fs` – outside Tauri's IPC ACL. This is intentional: it avoids granting arbitrary read to frontend JS via `plugin-fs`. The Tauri plugin-fs can be locked down to app-data without breaking V8 UI.
- **Shell execute**: `launch_game` uses `std::process::Command` with `CREATE_NO_WINDOW` on Windows, not `tauri-plugin-shell`. Thus we do not need `shell:allow-execute` / `shell:allow-spawn`. Keeping only `shell:allow-open` is minimal.
- **Dialog**: only file picker, no save, no unrestricted write.
- **Asset protocol**: `tauri.conf` enables `protocol-asset` for `<video>` / `<img>` to load local media files via `asset://` – this is separate from `fs` plugin and required for cover/video display. It does not need extra fs permissions because asset protocol reads via Rust.

## Recommended Hardened Capability (V8.1+ proposal)

Do **not** replace without testing on ROG Windows host, but for V8.2 we propose:

```json
{
  "identifier": "default",
  "description": "Crystal Frontend – least-privilege (app-data write, open-only shell)",
  "local": true,
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-fullscreen",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:event:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:path:default",
    "core:path:allow-resolve-directory",
    "core:resources:default",
    "dialog:default",
    "dialog:allow-open",
    "fs:default",
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$APPDATA/CrystalFrontend/**" }, { "path": "$LOCALAPPDATA/CrystalFrontend/**" }, { "path": "$RESOURCE/**" }] },
    { "identifier": "fs:allow-exists", "allow": [{ "path": "$LOCALAPPDATA/CrystalFrontend/**" }, { "path": "$APPDATA/CrystalFrontend/**" }] },
    { "identifier": "fs:allow-read-dir", "allow": [{ "path": "$LOCALAPPDATA/CrystalFrontend/**" }] },
    { "identifier": "fs:allow-stat", "allow": [{ "path": "$LOCALAPPDATA/CrystalFrontend/**" }, { "path": "$APPDATA/CrystalFrontend/**" }] },
    { "identifier": "fs:allow-write-text-file", "allow": [{ "path": "$LOCALAPPDATA/CrystalFrontend/**" }, { "path": "$APPDATA/CrystalFrontend/cache/**" }, { "path": "$APPDATA/CrystalFrontend/logs/**" }] },
    "path:default",
    "shell:default",
    "shell:allow-open"
  ]
}
```

Note: Tauri v2.0+ supports scoped permission objects; if runtime complains, move scope to `tauri.conf.json` → `plugins.fs.scope.allow`. The ROS? For now V8.1 keeps existing broad defaults to avoid breaking CI; above is advisory. Critically, we **remove** any `shell:allow-execute` if present (it isn't) and we keep no `fs:allow-write` outside app-data.

A full scoped file is provided at `docs/PROPOSED-CAPABILITY-HARDENED.json`.

## Machine config write safety

Grepped repo: no `writeFile` / `writeTextFile` targeting `*machine-config*` or `crystal-machine-config`. Backend `main.rs` is read-only. Frontend `loader.ts` only reads. No regression.

## Conclusion

- Current permission set is *minimal sufficient* for V8 UI build to pass – 0 typecheck errors, 143 tests.
- Backend std::fs bypass is intentional and safe: it allows ROM root enumeration without exposing FS to renderer.
- Sentinel & logging (app-data only) will use narrowed FS scope safely.
- For ROG first-boot we require no extra permissions; clone-NEW-folder + env var override satisfies discovery.

Keep existing `src-tauri/capabilities/default.json` for V8.1, file audit here for V8.2 hardening review before public launch.
