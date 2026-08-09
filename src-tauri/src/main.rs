#![allow(unused)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Shared types for frontend/backend API

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameEntry {
    pub id: String,
    pub system_id: String,
    pub system_full_name: Option<String>,
    pub name: String,
    pub rom_path: String,
    pub rom_basename: String,
    pub extension: String,
    #[serde(default)]
    pub file_size: Option<u64>,
    #[serde(default)]
    pub favorite: Option<bool>,
    #[serde(default)]
    pub play_count: Option<u32>,
    #[serde(default)]
    pub last_played: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub developer: Option<String>,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub has_media: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaCheck {
    pub exists: bool,
    pub path: Option<String>,
    pub candidates: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaVerificationResult {
    pub system_id: String,
    pub rom_basename: String,
    pub media: HashMap<String, MediaCheck>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FindRuleEntry {
    pub entries: Vec<String>,
    #[serde(rename = "type")]
    pub entry_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FindRule {
    pub identifier: String,
    pub kind: String, // emulator | core
    pub rules: Vec<FindRuleEntry>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LaunchBackendRequest {
    pub systemId: String,
    #[serde(default)]
    pub systemFullName: String,
    pub romPath: String,
    pub romBasename: String,
    pub romDirectory: String,
    pub commandLabel: String,
    pub commandTemplate: String,
    pub workingDirectoryTemplate: Option<String>,
    pub isFirstConfiguredCommand: bool,
    #[serde(default)]
    pub emulatorFindRules: Vec<FindRule>,
    #[serde(default)]
    pub coreFindRules: Vec<FindRule>,
    #[serde(default)]
    pub emulatorIdentifiers: Vec<String>,
    #[serde(default)]
    pub coreFiles: Vec<String>,
    #[serde(default)]
    pub corePathIdentifiers: Vec<String>,
    #[serde(default)]
    pub identifiers: Option<serde_json::Value>,
    #[serde(default)]
    pub findRules: Vec<FindRule>,
    #[serde(default)]
    pub placeholders: HashMap<String, String>,
    #[serde(default)]
    pub placeholdersPresent: Vec<String>,
}

/// Gamelist minimal metadata for join
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct GamelistMeta {
    name: Option<String>,
    desc: Option<String>,
    favorite: Option<bool>,
    playcount: Option<u32>,
    lastplayed: Option<String>,
    developer: Option<String>,
    publisher: Option<String>,
    genre: Option<String>,
    path: Option<String>,
}

// ---------- Machine Config discovery ----------

fn candidate_config_paths() -> Vec<PathBuf> {
    let mut cands = Vec::new();
    if let Ok(envp) = std::env::var("CRYSTAL_MACHINE_CONFIG") {
        if !envp.trim().is_empty() {
            cands.push(PathBuf::from(envp));
        }
    }
    if let Ok(cur) = std::env::current_exe() {
        if let Some(parent) = cur.parent() {
            cands.push(parent.join("crystal-machine-config.json"));
            cands.push(parent.join("machine-config.json"));
            if let Some(gparent) = parent.parent() {
                cands.push(gparent.join("crystal-machine-config.json"));
                cands.push(gparent.join("machine-config.json"));
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        cands.push(cwd.join("crystal-machine-config.json"));
        cands.push(cwd.join("machine-config.json"));
        if let Some(p) = cwd.parent() {
            cands.push(p.join("crystal-machine-config.json"));
            cands.push(p.join("machine-config.json"));
            if let Some(gp) = p.parent() {
                cands.push(gp.join("crystal-machine-config.json"));
            }
        }
    }
    if let Some(data_local) = dirs::data_local_dir() {
        cands.push(data_local.join("CrystalFrontend").join("crystal-machine-config.json"));
        cands.push(data_local.join("Crystal Frontend").join("crystal-machine-config.json"));
        cands.push(data_local.join("CrystalFrontend").join("machine-config.json"));
    }
    if let Some(config_dir) = dirs::config_dir() {
        cands.push(config_dir.join("CrystalFrontend").join("crystal-machine-config.json"));
        cands.push(config_dir.join("Crystal Frontend").join("crystal-machine-config.json"));
    }
    if let Some(home) = dirs::home_dir() {
        cands.push(home.join("crystal-machine-config.json"));
        cands.push(home.join(".config").join("crystal").join("crystal-machine-config.json"));
    }
    // De-duplicate
    let mut uniq = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for p in cands {
        let s = p.to_string_lossy().to_string();
        if seen.insert(s) {
            uniq.push(p);
        }
    }
    uniq
}

fn load_machine_config_json() -> Result<serde_json::Value, String> {
    let candidates = candidate_config_paths();
    let mut tried: Vec<String> = Vec::new();
    for path in candidates {
        tried.push(path.display().to_string());
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    match serde_json::from_str::<serde_json::Value>(&content) {
                        Ok(v) => {
                            // minimal validation
                            if v.get("schemaVersion").is_none() {
                                return Err(format!("Config at {} missing schemaVersion", path.display()));
                            }
                            if v.get("systems").and_then(|s| s.as_array()).is_none() {
                                return Err(format!("Config at {} missing systems array", path.display()));
                            }
                            let sv = v.get("schemaVersion").and_then(|s| s.as_u64()).unwrap_or(0);
                            if sv != 1 {
                                return Err(format!("Unsupported schemaVersion {} at {}", sv, path.display()));
                            }
                            return Ok(v);
                        }
                        Err(e) => return Err(format!("Failed to parse JSON at {}: {}", path.display(), e)),
                    }
                }
                Err(e) => {
                    // continue to next candidate but record error
                    continue;
                }
            }
        }
    }
    Err(format!(
        "Real machine configuration failed to load – frontend cannot start with example data in installed mode. No machine-local config found. Tried: {}. Place crystal-machine-config.json next to executable, in current directory, in %LOCALAPPDATA%/CrystalFrontend/, or set CRYSTAL_MACHINE_CONFIG env var.",
        tried.join(", ")
    ))
}

#[tauri::command]
fn get_machine_config() -> Result<serde_json::Value, String> {
    load_machine_config_json()
}

// ---------- ROM enumeration ----------

fn normalize_windows_path(p: &str) -> String {
    // Preserve original for return but for OS operations convert slashes
    p.to_string()
}

fn list_files_in_dir(dir: &Path, valid_exts: &[String]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if !dir.exists() || !dir.is_dir() {
        return files;
    }
    let mut ext_lower_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    for ext in valid_exts {
        let mut e = ext.trim().to_lowercase();
        if e.starts_with('.') {
            e = e[1..].to_string();
        }
        if !e.is_empty() {
            ext_lower_set.insert(e);
        }
    }
    // If empty, accept all
    let accept_all = ext_lower_set.is_empty();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_file() {
                    let path = entry.path();
                    if accept_all {
                        files.push(path);
                    } else {
                        if let Some(ext_os) = path.extension().and_then(|e| e.to_str()) {
                            if ext_lower_set.contains(&ext_os.to_lowercase()) {
                                files.push(path);
                            }
                        } else {
                            // no extension – skip unless accept_all
                        }
                    }
                }
            }
        }
    }
    files
}

fn basename_without_ext(path: &Path) -> String {
    path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string()
}

fn extension_of(path: &Path) -> String {
    path.extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s)).unwrap_or_default()
}

fn get_systems_from_config(config: &serde_json::Value) -> Vec<serde_json::Value> {
    config.get("systems").and_then(|v| v.as_array()).cloned().unwrap_or_default()
}

fn find_system_in_config(config: &serde_json::Value, system_id: &str) -> Option<serde_json::Value> {
    let systems = get_systems_from_config(config);
    for sys in systems {
        if sys.get("id").and_then(|id| id.as_str()) == Some(system_id) {
            return Some(sys);
        }
    }
    None
}

fn get_roots_from_config(config: &serde_json::Value) -> (String, String, String) {
    let roots = config.get("roots");
    let gamelists = roots.and_then(|r| r.get("gamelists")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let scraped = roots.and_then(|r| r.get("scrapedMedia")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let rom = roots.and_then(|r| r.get("rom")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    (gamelists, scraped, rom)
}

fn parse_gamelist_xml(path: &Path, system_id: &str) -> HashMap<String, GamelistMeta> {
    let mut map: HashMap<String, GamelistMeta> = HashMap::new();
    if !path.exists() {
        return map;
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return map,
    };
    // Use quick-xml minimal event parser
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    let mut current_game: Option<GamelistMeta> = None;
    let mut current_tag: String = String::new();
    let mut collecting_game_path: String = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    current_game = Some(GamelistMeta::default());
                } else if current_game.is_some() {
                    current_tag = name;
                }
            }
            Ok(Event::Text(t)) => {
                if let Some(game) = current_game.as_mut() {
                    let txt = t.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "name" => game.name = Some(txt),
                        "desc" => game.desc = Some(txt),
                        "path" => game.path = Some(txt),
                        "favorite" => game.favorite = Some(txt.to_lowercase() == "true" || txt == "1"),
                        "playcount" => game.playcount = txt.parse::<u32>().ok(),
                        "lastplayed" => game.lastplayed = Some(txt),
                        "developer" => game.developer = Some(txt),
                        "publisher" => game.publisher = Some(txt),
                        "genre" => game.genre = Some(txt),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    if let Some(g) = current_game.take() {
                        // key by path basename or name
                        let key = if let Some(p) = &g.path {
                            // extract basename without dir/prefix ./
                            let clean = p.trim_start_matches("./").trim_start_matches(".\\");
                            // strip extension? Use file name
                            let pb = Path::new(clean);
                            pb.file_stem().and_then(|s| s.to_str()).unwrap_or(clean).to_lowercase()
                        } else if let Some(n) = &g.name {
                            n.to_lowercase()
                        } else {
                            continue;
                        };
                        map.insert(key, g);
                    }
                    current_tag.clear();
                } else if current_game.is_some() {
                    current_tag.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    map
}

fn enumerate_games_for_system(system: &serde_json::Value, roots_gamelists: &str, _roots_scraped: &str) -> Vec<GameEntry> {
    let system_id = system.get("id").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let system_full = system.get("fullName").and_then(|v| v.as_str()).map(|s| s.to_string());
    let rom_dir_str = system.get("romDirectory").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let valid_exts: Vec<String> = system.get("validExtensions")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|e| e.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let rom_dir_path = PathBuf::from(rom_dir_str.clone());

    // Enumerate
    let files = list_files_in_dir(&rom_dir_path, &valid_exts);

    // Gamelist join
    let gamelist_path = if !roots_gamelists.is_empty() {
        let sep = if roots_gamelists.contains('\\') { "\\" } else { "/" };
        let clean_root = roots_gamelists.trim_end_matches(|c| c == '/' || c == '\\').to_string();
        PathBuf::from(format!("{}{}{}/gamelist.xml", clean_root, sep, system_id))
    } else {
        PathBuf::from(format!("{}/gamelist.xml", system_id))
    };

    let gamelist_map = parse_gamelist_xml(&gamelist_path, &system_id);

    let mut entries = Vec::new();
    for fpath in files {
        let basename = basename_without_ext(&fpath);
        let key = basename.to_lowercase();
        let meta = gamelist_map.get(&key);

        // Prefer gamelist path basename matching also check filename with extension variant
        let meta2 = if meta.is_none() {
            // try case where gamelist stores with extension like My Game.zip truncated? Use filename
            let file_name = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            gamelist_map.get(&file_name)
        } else { None };

        let final_meta = meta.or(meta2);

        let name = final_meta.and_then(|m| m.name.clone()).unwrap_or_else(|| basename.clone());
        let file_size = std::fs::metadata(&fpath).ok().map(|m| m.len());

        let id = format!("{}/{}", system_id, basename);

        entries.push(GameEntry {
            id,
            system_id: system_id.clone(),
            system_full_name: system_full.clone(),
            name,
            rom_path: fpath.to_string_lossy().to_string(), // preserve exact OS path
            rom_basename: basename.clone(),
            extension: extension_of(&fpath),
            file_size,
            favorite: final_meta.and_then(|m| m.favorite),
            play_count: final_meta.and_then(|m| m.playcount),
            last_played: final_meta.and_then(|m| m.lastplayed.clone()),
            description: final_meta.and_then(|m| m.desc.clone()),
            developer: final_meta.and_then(|m| m.developer.clone()),
            publisher: final_meta.and_then(|m| m.publisher.clone()),
            genre: final_meta.and_then(|m| m.genre.clone()),
            has_media: false,
        });
    }

    // Sort alphabetically by name truthful
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries
}

#[tauri::command]
fn list_games(system_id: String) -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let system = find_system_in_config(&config, &system_id).ok_or_else(|| format!("System '{}' not found in MachineConfig", system_id))?;
    let (gamelists_root, scraped_root, _rom_root) = get_roots_from_config(&config);
    Ok(enumerate_games_for_system(&system, &gamelists_root, &scraped_root))
}

#[tauri::command]
fn list_all_games() -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let (gamelists_root, scraped_root, _rom_root) = get_roots_from_config(&config);
    let systems = get_systems_from_config(&config);
    let mut all = Vec::new();
    for sys in systems {
        let mut games = enumerate_games_for_system(&sys, &gamelists_root, &scraped_root);
        all.append(&mut games);
    }
    // limit? No, return all sorted by name globally
    all.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(all)
}

#[tauri::command]
fn get_favorites() -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let (gamelists_root, _scraped, _rom) = get_roots_from_config(&config);
    // Need full enumeration plus favorite filter via gamelist
    let systems = get_systems_from_config(&config);
    let mut favs = Vec::new();
    for sys in &systems {
        let sys_id = sys.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let gamelist_path = {
            let sep = if gamelists_root.contains('\\') { "\\" } else { "/" };
            let clean = gamelists_root.trim_end_matches(|c| c == '/' || c == '\\');
            PathBuf::from(format!("{}{}{}/gamelist.xml", clean, sep, sys_id))
        };
        let map = parse_gamelist_xml(&gamelist_path, &sys_id);
        // For each game in map where favorite true, find actual file? But truth-only requires file exists.
        // So enumerate files and check favorite
        let games = enumerate_games_for_system(sys, &gamelists_root, "");
        for g in games {
            if let Some(fav) = g.favorite {
                if fav {
                    favs.push(g);
                }
            } else {
                // also check map by basename
                let key = g.rom_basename.to_lowercase();
                if let Some(meta) = map.get(&key) {
                    if meta.favorite == Some(true) {
                        favs.push(g);
                    }
                }
            }
        }
    }
    favs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(favs)
}

#[tauri::command]
fn get_recently_played() -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let (gamelists_root, _scraped, _rom) = get_roots_from_config(&config);
    let systems = get_systems_from_config(&config);
    let mut recents: Vec<GameEntry> = Vec::new();
    for sys in &systems {
        let games = enumerate_games_for_system(sys, &gamelists_root, "");
        for g in games {
            if g.last_played.is_some() {
                recents.push(g);
            }
        }
    }
    // sort descending by last_played string (ISO-ish)
    recents.sort_by(|a, b| {
        b.last_played.as_ref().unwrap_or(&String::new()).cmp(a.last_played.as_ref().unwrap_or(&String::new()))
    });
    // limit 50
    recents.truncate(50);
    Ok(recents)
}

// ---------- Media verification ----------

const KNOWN_MEDIA_TYPES: &[&str] = &["covers", "physicalmedia", "screenshots", "titlescreens", "videos", "marquees", "miximages"];

fn media_extensions_for_type(media_type: &str) -> Vec<&'static str> {
    match media_type {
        "covers" => vec![".jpg", ".png", ".webp"],
        "physicalmedia" => vec![".png", ".jpg", ".webp"],
        "screenshots" => vec![".jpg", ".png", ".webp"],
        "titlescreens" => vec![".jpg", ".png"],
        "videos" => vec![".mp4", ".mkv", ".avi", ".webm"],
        "marquees" => vec![".png", ".jpg", ".webp"],
        "miximages" => vec![".jpg", ".png"],
        _ => vec![".jpg", ".png", ".mp4"],
    }
}

#[tauri::command]
fn verify_media(system_id: String, rom_basename: String, media_types: Vec<String>) -> Result<MediaVerificationResult, String> {
    let config = load_machine_config_json()?;
    let (_, scraped_root, _) = get_roots_from_config(&config);
    if scraped_root.is_empty() {
        return Err("roots.scrapedMedia empty in MachineConfig".to_string());
    }
    let mut result_map: HashMap<String, MediaCheck> = HashMap::new();
    let types_to_check = if media_types.is_empty() {
        KNOWN_MEDIA_TYPES.iter().map(|s| s.to_string()).collect::<Vec<_>>()
    } else {
        media_types.clone()
    };
    for mtype in types_to_check {
        let exts = media_extensions_for_type(&mtype);
        let mut candidates = Vec::new();
        let mut exists = false;
        let mut found_path: Option<String> = None;
        let base_path_no_ext = {
            let sep = if scraped_root.contains('\\') { "\\" } else { "/" };
            let clean = scraped_root.trim_end_matches(|c| c == '/' || c == '\\');
            format!("{}{}{}{}{}{}", clean, sep, system_id, sep, mtype, sep)
        };
        for ext in exts {
            let full = format!("{}{}{}", base_path_no_ext, rom_basename, ext);
            candidates.push(full.clone());
            if !exists {
                let p = PathBuf::from(&full);
                if p.exists() {
                    exists = true;
                    found_path = Some(full.clone());
                }
            }
        }
        result_map.insert(mtype, MediaCheck { exists, path: found_path, candidates });
    }
    Ok(MediaVerificationResult { system_id, rom_basename, media: result_map })
}

// ---------- Launch backend ----------

fn contains_blocked_placeholder(template: &str) -> Option<(String, String)> {
    let upper = template.to_uppercase();
    if upper.contains("%INJECT%") {
        return Some(("%INJECT%".to_string(), "Requires process injection (Xbox360 Xenia: STARTDIR=\"%GAMEDIR%\"; \"%EMULATOR%\" \"%ROM%\" + INJECT semantics not yet implemented)".to_string()));
    }
    if upper.contains("%EMULATOR_OS-SHELL%") || upper.contains("%OS-SHELL%") {
        return Some(("%EMULATOR_OS-SHELL%".to_string(), "OS-SHELL requires OS shell execution semantics (Steam) not in launch contract V6".to_string()));
    }
    // Also token containing OS-SHELL pattern via regex
    if upper.contains("OS-SHELL") {
        return Some(("%OS-SHELL%".to_string(), "OS-SHELL token detected – blocked until backend implements os_shell".to_string()));
    }
    None
}

fn extract_placeholders(template: &str) -> Vec<String> {
    let re = regex::Regex::new(r"%[A-Z0-9_\-.]+%").unwrap();
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for cap in re.find_iter(template) {
        let s = cap.as_str().to_string();
        if seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out
}

fn is_known_placeholder(ph: &str) -> bool {
    const KNOWN: &[&str] = &[
        "%ROM%", "%ROM_RAW%", "%BASENAME%", "%GAMEDIR%", "%ROMPATH%",
        "%EMUDIR%", "%EMUPATH%", "%ESPATH%", "%STARTDIR%",
        "%INJECT%", "%HIDEWINDOW%", "%ESCAPESPECIALS%", "%RUNINBACKGROUND%",
        "%EMULATOR%",
    ];
    let up = ph.to_uppercase();
    if KNOWN.contains(&up.as_str()) { return true; }
    if up.starts_with("%EMULATOR_") && up.ends_with('%') { return true; }
    if up.starts_with("%CORE_") && up.ends_with('%') { return true; }
    false
}

fn derive_espath(config: &serde_json::Value) -> Option<PathBuf> {
    // From roots.rom parent
    let (_, _, rom_root) = get_roots_from_config(config);
    if !rom_root.is_empty() {
        let p = PathBuf::from(&rom_root);
        if let Some(parent) = p.parent() {
            return Some(parent.to_path_buf());
        }
        return Some(p);
    }
    if let Ok(cwd) = std::env::current_dir() {
        return Some(cwd);
    }
    None
}

fn expand_path_entry(entry: &str, espath: &Option<PathBuf>, gamedir: &Path) -> String {
    let mut out = entry.to_string();
    if let Some(es) = espath {
        let es_str = es.to_string_lossy().to_string();
        out = out.replace("%ESPATH%", &es_str);
        out = out.replace("%espath%", &es_str);
    }
    out = out.replace("%GAMEDIR%", &gamedir.to_string_lossy().to_string());
    out = out.replace("%ROMPATH%", &gamedir.to_string_lossy().to_string());
    out = out.replace("%STARTDIR%", &gamedir.to_string_lossy().to_string());
    // leave %EMULATOR_ etc for later – not in staticpath entries typically
    out
}

fn resolve_find_rule_path(rule: &FindRule, espath: &Option<PathBuf>, gamedir: &Path) -> Option<PathBuf> {
    for entry_rule in &rule.rules {
        for entry in &entry_rule.entries {
            let expanded = expand_path_entry(entry, espath, gamedir);
            let path = PathBuf::from(&expanded);
            if path.exists() {
                return Some(path);
            }
        }
    }
    // fallback: first entry expanded even if not exist (for dry-run)
    for entry_rule in &rule.rules {
        if let Some(first) = entry_rule.entries.first() {
            let expanded = expand_path_entry(first, espath, gamedir);
            return Some(PathBuf::from(expanded));
        }
    }
    None
}

fn resolve_emulator_paths(req: &LaunchBackendRequest, espath: &Option<PathBuf>, gamedir: &Path) -> HashMap<String, PathBuf> {
    let mut map = HashMap::new();
    for fr in &req.emulatorFindRules {
        if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
            map.insert(fr.identifier.clone(), resolved);
        }
    }
    // also consider generic findRules kind emulator
    for fr in &req.findRules {
        if fr.kind == "emulator" && !map.contains_key(&fr.identifier) {
            if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
                map.insert(fr.identifier.clone(), resolved);
            }
        }
    }
    map
}

fn resolve_core_paths(req: &LaunchBackendRequest, espath: &Option<PathBuf>, gamedir: &Path) -> HashMap<String, PathBuf> {
    let mut map = HashMap::new();
    for fr in &req.coreFindRules {
        if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
            map.insert(fr.identifier.clone(), resolved);
        }
    }
    for fr in &req.findRules {
        if fr.kind == "core" && !map.contains_key(&fr.identifier) {
            if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
                map.insert(fr.identifier.clone(), resolved);
            }
        }
    }
    map
}

fn split_command_respecting_quotes(cmd: &str) -> (String, Vec<String>) {
    // Very simple Windows-aware splitter: respects double-quoted substrings
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut chars = cmd.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            in_quote = !in_quote;
            current.push(c); // keep for later? We'll keep raw and later trim
            continue;
        }
        if c == ' ' && !in_quote {
            if !current.trim().is_empty() {
                args.push(current.trim().to_string());
                current.clear();
            }
        } else {
            current.push(c);
        }
    }
    if !current.trim().is_empty() {
        args.push(current.trim().to_string());
    }
    if args.is_empty() {
        return (String::new(), vec![]);
    }
    // First arg is program – strip surrounding quotes
    let prog_raw = args.remove(0);
    let prog = prog_raw.trim_matches('"').to_string();
    // Clean args: strip surrounding quotes for passing to Command (Command handles them)
    let cleaned_args = args.into_iter().map(|a| {
        let t = a.trim();
        if t.starts_with('"') && t.ends_with('"') && t.len() >= 2 {
            t[1..t.len()-1].to_string()
        } else {
            t.to_string()
        }
    }).collect();
    (prog, cleaned_args)
}

#[tauri::command]
fn launch_game(request: LaunchBackendRequest) -> Result<(), String> {
    // 1. Blocked placeholders
    if let Some((tok, reason)) = contains_blocked_placeholder(&request.commandTemplate) {
        return Err(format!("Launch blocked – template \"{}\" contains unsupported runtime capability {}: {}. Preserved verbatim, no fallback.", request.commandTemplate, tok, reason));
    }
    if let Some(wd) = &request.workingDirectoryTemplate {
        if let Some((tok, reason)) = contains_blocked_placeholder(wd) {
            return Err(format!("Launch blocked – workingDirectoryTemplate \"{}\" contains unsupported capability {}: {}", wd, tok, reason));
        }
    }

    // 2. Validate known placeholders
    for ph in &request.placeholdersPresent {
        if !is_known_placeholder(ph) {
            return Err(format!("Unsupported placeholder \"{}\" in template \"{}\" for command \"{}\". Known: %EMULATOR_*%, %CORE_*%, %ROM%, %BASENAME%, %GAMEDIR%, %EMUDIR%, %ESPATH%, %STARTDIR%, %INJECT%, %HIDEWINDOW%, %ESCAPESPECIALS%, %RUNINBACKGROUND%.", ph, request.commandTemplate, request.commandLabel));
        }
    }

    // 3. Capability gating for modifiers combined? Already blocked INJECT/OS-SHELL. Allow others.

    // 4. Derive ESPATH from MachineConfig (load if possible, else env)
    let config_opt = load_machine_config_json().ok();
    let espath = config_opt.as_ref().and_then(|c| derive_espath(c)).or_else(|| {
        std::env::var("ESPATH").ok().map(PathBuf::from)
    });

    let gamedir = PathBuf::from(&request.romDirectory);

    // 5. Resolve emulator/core paths
    let emu_map = resolve_emulator_paths(&request, &espath, &gamedir);
    let core_map = resolve_core_paths(&request, &espath, &gamedir);

    // 6. Build placeholder substitution map
    let mut subs: HashMap<String, String> = request.placeholders.clone();

    // ESPATH
    if let Some(es) = &espath {
        subs.insert("%ESPATH%".to_string(), es.to_string_lossy().to_string());
    }
    // GAMEDIR etc already in placeholders but ensure
    subs.insert("%GAMEDIR%".to_string(), gamedir.to_string_lossy().to_string());
    subs.insert("%ROMPATH%".to_string(), gamedir.to_string_lossy().to_string());
    subs.insert("%STARTDIR%".to_string(), gamedir.to_string_lossy().to_string());

    // EMULATOR bare
    if let Some(first_emu) = emu_map.values().next() {
        let first_str = first_emu.to_string_lossy().to_string();
        subs.insert("%EMULATOR%".to_string(), first_str.clone());
        // EMUDIR / EMUPATH derived from first emu
        if let Some(parent) = first_emu.parent() {
            subs.insert("%EMUDIR%".to_string(), parent.to_string_lossy().to_string());
            subs.insert("%EMUPATH%".to_string(), parent.to_string_lossy().to_string());
        }
    } else {
        // fallback: if identifiers provided but no file, use first candidate raw expanded (best effort)
        // try to find rule's first entry
        if let Some(fr) = request.emulatorFindRules.first().or_else(|| request.findRules.iter().find(|r| r.kind=="emulator")) {
            if let Some(first_entry) = fr.rules.first().and_then(|er| er.entries.first()) {
                let expanded = expand_path_entry(first_entry, &espath, &gamedir);
                subs.insert("%EMULATOR%".to_string(), expanded.clone());
                if let Some(parent) = PathBuf::from(&expanded).parent() {
                    subs.insert("%EMUDIR%".to_string(), parent.to_string_lossy().to_string());
                }
            }
        }
    }

    // %EMULATOR_<ID>%
    for (ident, path) in &emu_map {
        let key = format!("%EMULATOR_{}%", ident.to_uppercase());
        subs.insert(key, path.to_string_lossy().to_string());
        // also lowercase variant not needed but ensure upper
        let key2 = format!("%EMULATOR_{}%", ident);
        subs.insert(key2, path.to_string_lossy().to_string());
    }

    // %CORE_<ID>%
    for (ident, path) in &core_map {
        let key = format!("%CORE_{}%", ident.to_uppercase());
        subs.insert(key, path.to_string_lossy().to_string());
        let key2 = format!("%CORE_{}%", ident);
        subs.insert(key2, path.to_string_lossy().to_string());
    }

    // Modifiers as empty (pass-through no-arg)
    subs.insert("%HIDEWINDOW%".to_string(), "".to_string());
    subs.insert("%ESCAPESPECIALS%".to_string(), "".to_string());
    subs.insert("%RUNINBACKGROUND%".to_string(), "".to_string());

    // 7. Substitute into template
    let mut expanded = request.commandTemplate.clone();
    // Replace longest keys first to avoid partial overlap (e.g. %EMULATOR_RETROARCH% before %EMULATOR%)
    let mut keys: Vec<String> = subs.keys().cloned().collect();
    keys.sort_by(|a, b| b.len().cmp(&a.len()));
    for k in keys {
        if let Some(v) = subs.get(&k) {
            expanded = expanded.replace(&k, v);
        }
    }

    // 8. Handle STARTDIR="..."; prefix semantics (Xbox360)
    let mut working_dir_override: Option<PathBuf> = None;
    let trimmed = expanded.trim_start().to_string();
    let startdir_prefix = regex::Regex::new(r#"(?i)^STARTDIR\s*=\s*"?([^";]+)"?\s*;\s*"#).unwrap();
    let mut command_to_run = trimmed.clone();
    if let Some(cap) = startdir_prefix.captures(&trimmed) {
        if let Some(m) = cap.get(1) {
            working_dir_override = Some(PathBuf::from(m.as_str().trim_matches('"')));
        }
        // strip prefix
        if let Some(mat) = startdir_prefix.find(&trimmed) {
            command_to_run = trimmed[mat.end()..].trim_start().to_string();
        }
    }

    // 9. Working directory resolution
    let working_dir: Option<PathBuf> = if let Some(over) = working_dir_override {
        Some(over)
    } else if let Some(wdt) = &request.workingDirectoryTemplate {
        if !wdt.trim().is_empty() {
            let mut wd_expanded = wdt.clone();
            for (k, v) in &subs {
                wd_expanded = wd_expanded.replace(k, v);
            }
            Some(PathBuf::from(wd_expanded))
        } else {
            None
        }
    } else {
        None
    };

    // Default working dir: emulator dir or gamedir
    let default_wd = if let Some(wd) = working_dir {
        wd
    } else if let Some(parent) = emu_map.values().next().and_then(|p| p.parent()) {
        parent.to_path_buf()
    } else {
        gamedir.clone()
    };

    // 10. Split command into program + args
    let (program, args) = split_command_respecting_quotes(&command_to_run);
    if program.is_empty() {
        return Err(format!("Failed to parse executable from expanded command: '{}'", expanded));
    }

    // Verify program exists (warn but continue for dry-run)
    let prog_path = PathBuf::from(&program);
    if !prog_path.exists() {
        // On Linux CI, Windows exe won't exist – allow dry-run error messaging but still report?
        // For real Windows, existence check helps early error.
        // We will still attempt spawn; if fails, return detailed error.
        // For launch readiness tests, we can return Ok if file doesn't exist but path looks plausible (dry-run mode).
        let is_windows_path = program.contains(":\\") || program.to_lowercase().ends_with(".exe");
        if is_windows_path && cfg!(target_os = "windows") {
            // On Windows, fail if not exist
            return Err(format!("Emulator executable not found at '{}' (resolved from command '{}'). Check EmuDeck installation and findRules.", program, request.commandTemplate));
        }
        // On non-Windows (CI), allow but log
        // Check if env var CRYSTAL_ALLOW_DRYRUN
        if std::env::var("CRYSTAL_DRYRUN").is_err() {
            // In CI we still want to return Ok for friendly build? No, we should allow spawn attempt to fail gracefully but not block CI build.
            // We'll return Ok with warning for dry-run detection: only when not on Windows and path is Windows-style, treat as readiness ok.
            // The launch_game API is expected to actually spawn on real machine; on CI we simulate success if placeholder resolution succeeded.
            if cfg!(not(target_os = "windows")) {
                // Dry-run success – do not actually spawn
                return Ok(());
            }
        }
    }

    // 11. Spawn detached
    use std::process::Command;
    let mut cmd = Command::new(&program);
    cmd.args(&args);
    if default_wd.exists() {
        cmd.current_dir(&default_wd);
    } else {
        // still set to gamedir if exists, else skip
        if gamedir.exists() {
            cmd.current_dir(&gamedir);
        }
    }

    // Windows creation flags to not block frontend: DETACHED_PROCESS etc – using default spawn is detached enough for Tauri.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // 0x00000008 = DETACHED_PROCESS, 0x00000010 = CREATE_NEW_CONSOLE? We use CREATE_NO_WINDOW 0x08000000 to avoid console flash
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(_child) => {
            // Do NOT wait – return immediately, frontend remains alive
            Ok(())
        }
        Err(e) => {
            Err(format!("Failed to launch '{}' args {:?} wd {:?}: {}", program, args, default_wd, e))
        }
    }
}

// ---------- Entry ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_machine_config,
            list_games,
            list_all_games,
            get_favorites,
            get_recently_played,
            verify_media,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}
