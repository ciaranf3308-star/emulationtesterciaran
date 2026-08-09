# Tauri Integration — Crystal Frontend

Environment at scaffold time had no `cargo` (Rust toolchain missing), so full `src-tauri` shell was not generated in this pass. Frontend is built cleanly now with integration boundary/interfaces, ready for Tauri.

## What Is Ready
- `src/desktop/emuDeckBridge.ts` — all IPC definitions typed:
  - `scanEmuDeckRoms(rootPath)`
  - `getSystemList()`
  - `launchGame(systemId, romPath)`
  - `readSaveStates(systemId?)`
  - `getBackgroundPath(systemId, theme)`
  - `getLogoPath(systemId, theme)`
  - `isTauri()`, `getDefaultEmulationRoot()`
  - `Desktop` facade object re-exported
- `src/tauri/index.ts` — re-export facade for future Rust bindings
- `vite.config.ts` — `server.port=1420 strictPort true` as Tauri expects, `assetsInlineLimit=0`
- Frontend respects Tauri detection (`'__TAURI__' in window`) and falls back to browser mock without faking data.

## What's Remaining (do when cargo available)

### 1. Install Rust + Tauri CLI
On Windows dev PC with admin, install Rust via rustup, then:
```bash
npm install -D @tauri-apps/cli @tauri-apps/api
```

### 2. Init src-tauri
```bash
npx @tauri-apps/cli init --yes
# or manual:
mkdir src-tauri
# fill src-tauri/Cargo.toml, src-tauri/tauri.conf.json
```

### Suggested tauri.conf.json (Windows fullscreen)
```json
{
  "build": { "frontendDist": "../dist", "devUrl": "http://localhost:1420", "beforeBuildCommand": "bun run build", "beforeDevCommand": "bun run dev" },
  "package": { "productName": "Crystal Frontend", "version": "0.1.0" },
  "tauri": {
    "windows": [{ "width":1920,"height":1080,"fullscreen":true,"decorations":false,"resizable":true,"title":"Crystal Frontend"}],
    "bundle": { "active": true, "targets": ["msi","nsis"], "icon": ["icons/icon.png"], "windows": {"wix":{"language":{"default":"en-US"}}}},
    "security": {"csp": null},
    "allowlist": {
      "shell": { "all": false, "open": true, "scope": [{"name":"pcsx2","path":"$APPDATA/Roaming/EmuDeck/Emulators/pcsx2/pcsx2-qt.exe","args":true},{"name":"retroarch","path":"*retroarch*","args":true},{"name":"dolphin","path":"*Dolphin*","args":true},{"name":"cemu","path":"*Cemu*","args":true}]},
      "fs": { "all": false, "scope": ["$HOME/Emulation/**","$HOME/Desktop/Emulation/**","C:/Emulation/**","D:/Emulation/**","$APPDATA/EmuDeck/**","$APPDATA/ES-DE/**","$APPDATA/Roaming/EmuDeck/**"]},
      "path": { "all": true },
      "dialog": { "all": true, "open": true }
    }
  }
}
```

### 3. Rust Commands (src-tauri/src/main.rs)
Implement:
```rust
#[tauri::command]
fn scan_emu_deck_roms(root_path: String) -> Result<ScanResult,String> {
  // walk Emulation/roms/<system> folders, list files with allowed extensions per system (from systems.json)
  // return [{systemId, romCount, roms: [{systemId, path, basename, name}]}]
}
#[tauri::command] fn get_system_list() -> Vec<String> { /* list subfolders in roms/ that have >0 files */ }
#[tauri::command] fn launch_game(system_id: String, rom_path: String) -> Result<(), String> {
  // map system_id -> emulator exe from EmuDeck locations:
  // %APPDATA%\EmuDeck\Emulators\{pcsx2,cemu,dolphin}\*.exe or Emulation/tools/launchers/*.bat
  // emulate ES %ROM_RAW% replacement, spawn with std::process::Command
}
#[tauri::command] fn read_save_states(system_id: Option<String>) -> Vec<SaveStateMeta> { /* read Emulation/saves/{system} */ }
#[tauri::command] fn get_background_path(system_id: String, theme: String) -> Option<String> { /* return asset pack path if override exists on disk */ }
#[tauri::command] fn get_logo_path(system_id: String, theme: String) -> Option<String> { /* similar */ }
fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![scan_emu_deck_roms,get_system_list,launch_game,read_save_states,get_background_path,get_logo_path]).run(tauri::generate_context!()).expect("error while running tauri"); }
```

### 4. Permissions
For Tauri v1/v2 allowlist above, also configure CSP null during dev (later lock down).
Ensure shell permission arguments pass through `%ROM_RAW%` quoted correctly (Windows paths with spaces).

### 5. Asset Pack on Disk vs Bundled
Currently asset pack 73 MB is bundled into `dist` via `public/assets`. For Tauri, you have two options:
- Keep bundled (simpler first pass, but installer large)
- At runtime, read from user's existing ES-DE theme path `C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE\themes\fullscreen-my-theme-es-de\` and copy/mirror, falling back to bundled.

We chose bundled for now to preserve filenames exactly and avoid regeneration.

### 6. Testing on Windows PC
- Point Crystal at Emulation folder (commonly `C:\Emulation` or `C:\Users\<you>\Emulation`).
- Verify `launchGame` spawns same exe that ES-DE would (check via Task Manager).
- Verify save sync remains untouched (EmuDeck's symlinks).
- No orange Vault branding present; original Vault only in `prototype/original-vault.html`.

### 7. Missing Light Steam Logo
Manifest has `steam.logoDark` but no `logoLight`. Implementation falls back to dark. Inventory documents this. Do not generate fake light version.

### 8. No Fake Data
When Tauri not available (browser dev), UI shows empty-state messages, not fake ROM counts/compatibility/emulator stats. This must be preserved after Tauri wiring.

Proceed to implement Rust side when env has cargo.

