mod acquisition_watch;
mod discovery;
mod import_game;
mod machine_config;
mod safety;
mod test_env_lock;

use safety::{
    crystal_writable_root, ensure_writable_dirs, init_safe_mode_from_env, is_safe_mode, log_event,
};
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
    pub players: Option<String>,
    pub rating: Option<f64>,
    pub releasedate: Option<String>,
    pub playtime: Option<u64>,
    pub cover_path: Option<String>,
    pub marquee_path: Option<String>,
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
    players: Option<String>,
    rating: Option<f64>,
    releasedate: Option<String>,
    playtime: Option<u64>,
    path: Option<String>,
}

// ---------- Machine Config discovery ----------
// Single authority – delegates to machine_config module
fn candidate_config_paths() -> Vec<PathBuf> {
    machine_config::candidate_config_paths()
}

fn load_machine_config_json() -> Result<serde_json::Value, String> {
    machine_config::load_machine_config_json()
}

#[tauri::command]
fn get_machine_config() -> Result<serde_json::Value, String> {
    // get_machine_config must work in safe mode (read-only)
    let res = load_machine_config_json();
    match &res {
        Ok(v) => {
            let sys_len = v
                .get("systems")
                .and_then(|s| s.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            log_event(
                "info",
                &format!(
                    "get_machine_config success systems={} safe_mode={}",
                    sys_len,
                    is_safe_mode()
                ),
            );
        }
        Err(e) => {
            log_event("warn", &format!("get_machine_config failed: {}", e));
        }
    }
    res
}

// ---------- ROM enumeration ----------

fn normalize_windows_path(p: &str) -> String {
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
                        }
                    }
                }
            }
        }
    }
    files
}

fn basename_without_ext(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s))
        .unwrap_or_default()
}

fn get_systems_from_config(config: &serde_json::Value) -> Vec<serde_json::Value> {
    config
        .get("systems")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn find_system_in_config(config: &serde_json::Value, system_id: &str) -> Option<serde_json::Value> {
    machine_config::find_system_in_config(config, system_id).cloned()
}

fn get_roots_from_config(config: &serde_json::Value) -> (String, String, String) {
    let roots = config.get("roots");
    let gamelists = roots
        .and_then(|r| r.get("gamelists"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let scraped = roots
        .and_then(|r| r.get("scrapedMedia"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let rom = roots
        .and_then(|r| r.get("rom"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    (gamelists, scraped, rom)
}

fn parse_gamelist_xml(path: &Path, _system_id: &str) -> HashMap<String, GamelistMeta> {
    let mut map: HashMap<String, GamelistMeta> = HashMap::new();
    if !path.exists() {
        return map;
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return map,
    };
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);

    let mut current_game: Option<GamelistMeta> = None;
    let mut current_tag: String = String::new();
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
                        "favorite" => {
                            game.favorite = Some(txt.to_lowercase() == "true" || txt == "1")
                        }
                        "playcount" => game.playcount = txt.parse::<u32>().ok(),
                        "lastplayed" => game.lastplayed = Some(txt),
                        "developer" => game.developer = Some(txt),
                        "publisher" => game.publisher = Some(txt),
                        "genre" => game.genre = Some(txt),
                        "players" => game.players = Some(txt),
                        "rating" => game.rating = txt.parse::<f64>().ok(),
                        "releasedate" => game.releasedate = Some(txt),
                        "playtime" => game.playtime = txt.parse::<u64>().ok(),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    if let Some(g) = current_game.take() {
                        let key = if let Some(p) = &g.path {
                            let clean = p.trim_start_matches("./").trim_start_matches(".\\");
                            let pb = Path::new(clean);
                            pb.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or(clean)
                                .to_lowercase()
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

fn enumerate_games_for_system(
    system: &serde_json::Value,
    roots_gamelists: &str,
    roots_scraped: &str,
) -> Vec<GameEntry> {
    let system_id = system
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let system_full = system
        .get("fullName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let rom_dir_str = system
        .get("romDirectory")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let valid_exts: Vec<String> = system
        .get("validExtensions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let rom_dir_path = PathBuf::from(rom_dir_str.clone());

    let files = list_files_in_dir(&rom_dir_path, &valid_exts);

    let gamelist_path = if !roots_gamelists.is_empty() {
        let sep = if roots_gamelists.contains('\\') {
            "\\"
        } else {
            "/"
        };
        let clean_root = roots_gamelists
            .trim_end_matches(|c| c == '/' || c == '\\')
            .to_string();
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
        let meta2 = if meta.is_none() {
            let file_name = fpath
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            gamelist_map.get(&file_name)
        } else {
            None
        };
        let final_meta = meta.or(meta2);
        let name = final_meta
            .and_then(|m| m.name.clone())
            .unwrap_or_else(|| basename.clone());
        let file_size = std::fs::metadata(&fpath).ok().map(|m| m.len());
        let id = format!("{}/{}", system_id, basename);
        entries.push(GameEntry {
            id,
            system_id: system_id.clone(),
            system_full_name: system_full.clone(),
            name,
            rom_path: fpath.to_string_lossy().to_string(),
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
            players: final_meta.and_then(|m| m.players.clone()),
            rating: final_meta.and_then(|m| m.rating),
            releasedate: final_meta.and_then(|m| m.releasedate.clone()),
            playtime: final_meta.and_then(|m| m.playtime),
            cover_path: find_media_path(roots_scraped, &system_id, "covers", &basename),
            marquee_path: find_media_path(roots_scraped, &system_id, "marquees", &basename),
            has_media: false,
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries
}

#[tauri::command]
fn list_games(system_id: String) -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let system = find_system_in_config(&config, &system_id)
        .ok_or_else(|| format!("System '{}' not found in MachineConfig", system_id))?;
    let (gamelists_root, scraped_root, _rom_root) = get_roots_from_config(&config);
    let games = enumerate_games_for_system(&system, &gamelists_root, &scraped_root);
    log_event(
        "info",
        &format!(
            "list_games system='{}' count={} safe_mode={}",
            system_id,
            games.len(),
            is_safe_mode()
        ),
    );
    Ok(games)
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
    all.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    log_event(
        "info",
        &format!(
            "list_all_games total={} safe_mode={}",
            all.len(),
            is_safe_mode()
        ),
    );
    Ok(all)
}

#[tauri::command]
fn get_favorites() -> Result<Vec<GameEntry>, String> {
    let config = load_machine_config_json()?;
    let (gamelists_root, _scraped, _rom) = get_roots_from_config(&config);
    let systems = get_systems_from_config(&config);
    let mut favs = Vec::new();
    for sys in &systems {
        let sys_id = sys
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let gamelist_path = {
            let sep = if gamelists_root.contains('\\') {
                "\\"
            } else {
                "/"
            };
            let clean = gamelists_root.trim_end_matches(|c| c == '/' || c == '\\');
            PathBuf::from(format!("{}{}{}/gamelist.xml", clean, sep, sys_id))
        };
        let map = parse_gamelist_xml(&gamelist_path, &sys_id);
        let games = enumerate_games_for_system(sys, &gamelists_root, "");
        for g in games {
            if let Some(fav) = g.favorite {
                if fav {
                    favs.push(g);
                }
            } else {
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
    log_event(
        "info",
        &format!(
            "get_favorites count={} safe_mode={}",
            favs.len(),
            is_safe_mode()
        ),
    );
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
    recents.sort_by(|a, b| {
        b.last_played
            .as_ref()
            .unwrap_or(&String::new())
            .cmp(a.last_played.as_ref().unwrap_or(&String::new()))
    });
    recents.truncate(50);
    log_event(
        "info",
        &format!(
            "get_recently_played count={} safe_mode={}",
            recents.len(),
            is_safe_mode()
        ),
    );
    Ok(recents)
}

// ---------- Media verification ----------

const KNOWN_MEDIA_TYPES: &[&str] = &[
    "covers",
    "physicalmedia",
    "screenshots",
    "titlescreens",
    "videos",
    "marquees",
    "miximages",
];

fn media_extensions_for_type(media_type: &str) -> Vec<&'static str> {
    match media_type {
        "covers" => vec![".jpg", ".png", ".webp"],
        "physicalmedia" => vec![".png", ".jpg", ".webp"],
        "screenshots" => vec![".jpg", ".png", ".webp"],
        "titlescreens" => vec![".jpg", ".png"],
        "videos" => vec![".mp4", ".mkv", ".avi", ".webm"],
        "marquees" => vec![".png", ".jpg", ".webp"],
        "miximages" => vec![".jpg", ".png"],
        "fanart" => vec![".jpg", ".png", ".webp"],
        "3dboxes" => vec![".png", ".jpg", ".webp"],
        "backcovers" => vec![".png", ".jpg", ".webp"],
        _ => vec![".jpg", ".png", ".mp4"],
    }
}

fn find_media_path(
    root: &str,
    system_id: &str,
    media_type: &str,
    rom_basename: &str,
) -> Option<String> {
    if root.is_empty() {
        return None;
    }
    let clean = root.trim_end_matches(|c| c == '/' || c == '\\');
    for ext in media_extensions_for_type(media_type) {
        let path = PathBuf::from(clean)
            .join(system_id)
            .join(media_type)
            .join(format!("{}{}", rom_basename, ext));
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}

#[tauri::command]
fn verify_media(
    system_id: String,
    rom_basename: String,
    media_types: Vec<String>,
) -> Result<MediaVerificationResult, String> {
    let config = load_machine_config_json()?;
    let (_, scraped_root, _) = get_roots_from_config(&config);
    if scraped_root.is_empty() {
        return Err("roots.scrapedMedia empty in MachineConfig".to_string());
    }
    let mut result_map: HashMap<String, MediaCheck> = HashMap::new();
    let types_to_check = if media_types.is_empty() {
        KNOWN_MEDIA_TYPES
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>()
    } else {
        media_types.clone()
    };
    for mtype in types_to_check {
        let exts = media_extensions_for_type(&mtype);
        let mut candidates = Vec::new();
        let mut exists = false;
        let mut found_path: Option<String> = None;
        let base_path_no_ext = {
            let sep = if scraped_root.contains('\\') {
                "\\"
            } else {
                "/"
            };
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
        result_map.insert(
            mtype,
            MediaCheck {
                exists,
                path: found_path,
                candidates,
            },
        );
    }
    Ok(MediaVerificationResult {
        system_id,
        rom_basename,
        media: result_map,
    })
}

// ---------- Launch backend ----------

fn contains_blocked_placeholder(template: &str) -> Option<(String, String)> {
    let upper = template.to_uppercase();
    if upper.contains("%INJECT%") {
        return Some(("%INJECT%".to_string(), "Requires process injection (Xbox360 Xenia: STARTDIR=\"%GAMEDIR%\"; \"%EMULATOR%\" \"%ROM%\" + INJECT semantics not yet implemented)".to_string()));
    }
    if upper.contains("%EMULATOR_OS-SHELL%") || upper.contains("%OS-SHELL%") {
        return Some((
            "%EMULATOR_OS-SHELL%".to_string(),
            "OS-SHELL requires OS shell execution semantics (Steam) not in launch contract V6"
                .to_string(),
        ));
    }
    if upper.contains("OS-SHELL") {
        return Some((
            "%OS-SHELL%".to_string(),
            "OS-SHELL token detected – blocked until backend implements os_shell".to_string(),
        ));
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
        "%ROM%",
        "%ROM_RAW%",
        "%BASENAME%",
        "%GAMEDIR%",
        "%ROMPATH%",
        "%EMUDIR%",
        "%EMUPATH%",
        "%ESPATH%",
        "%STARTDIR%",
        "%INJECT%",
        "%HIDEWINDOW%",
        "%ESCAPESPECIALS%",
        "%RUNINBACKGROUND%",
        "%EMULATOR%",
    ];
    let up = ph.to_uppercase();
    if KNOWN.contains(&up.as_str()) {
        return true;
    }
    if up.starts_with("%EMULATOR_") && up.ends_with('%') {
        return true;
    }
    if up.starts_with("%CORE_") && up.ends_with('%') {
        return true;
    }
    false
}

fn derive_espath(config: &serde_json::Value) -> Option<PathBuf> {
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
    out
}

fn resolve_find_rule_path(
    rule: &FindRule,
    espath: &Option<PathBuf>,
    gamedir: &Path,
) -> Option<PathBuf> {
    for entry_rule in &rule.rules {
        for entry in &entry_rule.entries {
            let expanded = expand_path_entry(entry, espath, gamedir);
            let path = PathBuf::from(&expanded);
            if path.exists() {
                return Some(path);
            }
        }
    }
    for entry_rule in &rule.rules {
        if let Some(first) = entry_rule.entries.first() {
            let expanded = expand_path_entry(first, espath, gamedir);
            return Some(PathBuf::from(expanded));
        }
    }
    None
}

fn resolve_emulator_paths(
    req: &LaunchBackendRequest,
    espath: &Option<PathBuf>,
    gamedir: &Path,
) -> HashMap<String, PathBuf> {
    let mut map = HashMap::new();
    for fr in &req.emulatorFindRules {
        if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
            map.insert(fr.identifier.clone(), resolved);
        }
    }
    for fr in &req.findRules {
        if fr.kind == "emulator" && !map.contains_key(&fr.identifier) {
            if let Some(resolved) = resolve_find_rule_path(fr, espath, gamedir) {
                map.insert(fr.identifier.clone(), resolved);
            }
        }
    }
    map
}

fn resolve_core_paths(
    req: &LaunchBackendRequest,
    espath: &Option<PathBuf>,
    gamedir: &Path,
) -> HashMap<String, PathBuf> {
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
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut chars = cmd.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            in_quote = !in_quote;
            current.push(c);
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
    let prog_raw = args.remove(0);
    let prog = prog_raw.trim_matches('"').to_string();
    let cleaned_args = args
        .into_iter()
        .map(|a| {
            let t = a.trim();
            if t.starts_with('"') && t.ends_with('"') && t.len() >= 2 {
                t[1..t.len() - 1].to_string()
            } else {
                t.to_string()
            }
        })
        .collect();
    (prog, cleaned_args)
}

#[tauri::command]
fn launch_game(request: LaunchBackendRequest) -> Result<(), String> {
    // SAFE MODE guard – must be first
    if is_safe_mode() {
        let msg = format!(
            "SAFE_MODE_BLOCKED_LAUNCH: Crystal SAFE MODE active – launch blocked for '{}' (rom '{}'). Disable CRYSTAL_SAFE_MODE to allow launching.",
            request.systemId, request.romBasename
        );
        log_event("warn", &msg);
        return Err("SAFE_MODE_BLOCKED_LAUNCH: Crystal SAFE MODE active – launch blocked. Disable CRYSTAL_SAFE_MODE to allow launching.".to_string());
    }

    log_event(
        "info",
        &format!(
            "launch_attempt system='{}' rom='{}' label='{}' template='{}'",
            request.systemId, request.romBasename, request.commandLabel, request.commandTemplate
        ),
    );

    if let Some((tok, reason)) = contains_blocked_placeholder(&request.commandTemplate) {
        return Err(format!("Launch blocked – template \"{}\" contains unsupported runtime capability {}: {}. Preserved verbatim, no fallback.", request.commandTemplate, tok, reason));
    }
    if let Some(wd) = &request.workingDirectoryTemplate {
        if let Some((tok, reason)) = contains_blocked_placeholder(wd) {
            return Err(format!("Launch blocked – workingDirectoryTemplate \"{}\" contains unsupported capability {}: {}", wd, tok, reason));
        }
    }

    for ph in &request.placeholdersPresent {
        if !is_known_placeholder(ph) {
            return Err(format!("Unsupported placeholder \"{}\" in template \"{}\" for command \"{}\". Known: %EMULATOR_*%, %CORE_*%, %ROM%, %BASENAME%, %GAMEDIR%, %EMUDIR%, %ESPATH%, %STARTDIR%, %INJECT%, %HIDEWINDOW%, %ESCAPESPECIALS%, %RUNINBACKGROUND%.", ph, request.commandTemplate, request.commandLabel));
        }
    }

    let config_opt = load_machine_config_json().ok();
    let espath = config_opt
        .as_ref()
        .and_then(|c| derive_espath(c))
        .or_else(|| std::env::var("ESPATH").ok().map(PathBuf::from));

    let gamedir = PathBuf::from(&request.romDirectory);

    let emu_map = resolve_emulator_paths(&request, &espath, &gamedir);
    let core_map = resolve_core_paths(&request, &espath, &gamedir);

    let mut subs: HashMap<String, String> = request.placeholders.clone();

    if let Some(es) = &espath {
        subs.insert("%ESPATH%".to_string(), es.to_string_lossy().to_string());
    }
    subs.insert(
        "%GAMEDIR%".to_string(),
        gamedir.to_string_lossy().to_string(),
    );
    subs.insert(
        "%ROMPATH%".to_string(),
        gamedir.to_string_lossy().to_string(),
    );
    subs.insert(
        "%STARTDIR%".to_string(),
        gamedir.to_string_lossy().to_string(),
    );

    if let Some(first_emu) = emu_map.values().next() {
        let first_str = first_emu.to_string_lossy().to_string();
        subs.insert("%EMULATOR%".to_string(), first_str.clone());
        if let Some(parent) = first_emu.parent() {
            subs.insert("%EMUDIR%".to_string(), parent.to_string_lossy().to_string());
            subs.insert(
                "%EMUPATH%".to_string(),
                parent.to_string_lossy().to_string(),
            );
        }
    } else {
        if let Some(fr) = request
            .emulatorFindRules
            .first()
            .or_else(|| request.findRules.iter().find(|r| r.kind == "emulator"))
        {
            if let Some(first_entry) = fr.rules.first().and_then(|er| er.entries.first()) {
                let expanded = expand_path_entry(first_entry, &espath, &gamedir);
                subs.insert("%EMULATOR%".to_string(), expanded.clone());
                if let Some(parent) = PathBuf::from(&expanded).parent() {
                    subs.insert("%EMUDIR%".to_string(), parent.to_string_lossy().to_string());
                }
            }
        }
    }

    for (ident, path) in &emu_map {
        let key = format!("%EMULATOR_{}%", ident.to_uppercase());
        subs.insert(key, path.to_string_lossy().to_string());
        let key2 = format!("%EMULATOR_{}%", ident);
        subs.insert(key2, path.to_string_lossy().to_string());
    }

    for (ident, path) in &core_map {
        let key = format!("%CORE_{}%", ident.to_uppercase());
        subs.insert(key, path.to_string_lossy().to_string());
        let key2 = format!("%CORE_{}%", ident);
        subs.insert(key2, path.to_string_lossy().to_string());
    }

    subs.insert("%HIDEWINDOW%".to_string(), "".to_string());
    subs.insert("%ESCAPESPECIALS%".to_string(), "".to_string());
    subs.insert("%RUNINBACKGROUND%".to_string(), "".to_string());

    let mut expanded = request.commandTemplate.clone();
    let mut keys: Vec<String> = subs.keys().cloned().collect();
    keys.sort_by(|a, b| b.len().cmp(&a.len()));
    for k in keys {
        if let Some(v) = subs.get(&k) {
            expanded = expanded.replace(&k, v);
        }
    }

    let mut working_dir_override: Option<PathBuf> = None;
    let trimmed = expanded.trim_start().to_string();
    let startdir_prefix = regex::Regex::new(r#"(?i)^STARTDIR\s*=\s*"?([^";]+)"?\s*;\s*"#).unwrap();
    let mut command_to_run = trimmed.clone();
    if let Some(cap) = startdir_prefix.captures(&trimmed) {
        if let Some(m) = cap.get(1) {
            working_dir_override = Some(PathBuf::from(m.as_str().trim_matches('"')));
        }
        if let Some(mat) = startdir_prefix.find(&trimmed) {
            command_to_run = trimmed[mat.end()..].trim_start().to_string();
        }
    }

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

    let default_wd = if let Some(wd) = working_dir {
        wd
    } else if let Some(parent) = emu_map.values().next().and_then(|p| p.parent()) {
        parent.to_path_buf()
    } else {
        gamedir.clone()
    };

    let (program, args) = split_command_respecting_quotes(&command_to_run);
    if program.is_empty() {
        let err = format!(
            "Failed to parse executable from expanded command: '{}'",
            expanded
        );
        log_event("error", &err);
        return Err(err);
    }

    let prog_path = PathBuf::from(&program);
    if !prog_path.exists() {
        let is_windows_path = program.contains(":\\") || program.to_lowercase().ends_with(".exe");
        if is_windows_path && cfg!(target_os = "windows") {
            let err = format!("Emulator executable not found at '{}' (resolved from command '{}'). Check EmuDeck installation and findRules.", program, request.commandTemplate);
            log_event("error", &err);
            return Err(err);
        }
        if std::env::var("CRYSTAL_DRYRUN").is_err() {
            if cfg!(not(target_os = "windows")) {
                log_event(
                    "info",
                    &format!(
                        "dry-run launch ok (non-windows) program='{}' args={:?}",
                        program, args
                    ),
                );
                return Ok(());
            }
        }
    }

    use std::process::Command;
    let mut cmd = Command::new(&program);
    cmd.args(&args);
    if default_wd.exists() {
        cmd.current_dir(&default_wd);
    } else {
        if gamedir.exists() {
            cmd.current_dir(&gamedir);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(_child) => {
            log_event(
                "info",
                &format!(
                    "launch_success program='{}' wd='{}' safe_mode={}",
                    program,
                    default_wd.display(),
                    is_safe_mode()
                ),
            );
            Ok(())
        }
        Err(e) => {
            let err = format!(
                "Failed to launch '{}' args {:?} wd {:?}: {}",
                program, args, default_wd, e
            );
            log_event("error", &err);
            Err(err)
        }
    }
}

// ---------- Entry ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Init SAFE MODE before anything else – sets static from env var
    let safe = init_safe_mode_from_env();
    // Ensure writable dirs exist early; this is inside allowed root only
    match ensure_writable_dirs() {
        Ok(root) => {
            // Best effort log startup
            log_event(
                "info",
                &format!(
                    "crystal-frontend startup safe_mode={} writable_root='{}' version=4.5.0",
                    safe,
                    root.display()
                ),
            );
        }
        Err(e) => {
            eprintln!("Failed to ensure writable dirs: {}", e);
        }
    }

    if safe {
        log_event("warn", "SAFE MODE is active – emulator launching disabled");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Keep the static asset-protocol scope empty. At runtime, grant read-only
            // access only to the scraped-media root selected by the machine config.
            if let Ok(config) = load_machine_config_json() {
                let (_, scraped_root, _) = get_roots_from_config(&config);
                if !scraped_root.is_empty() {
                    app.asset_protocol_scope()
                        .allow_directory(PathBuf::from(scraped_root), true)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_machine_config,
            list_games,
            list_all_games,
            get_favorites,
            get_recently_played,
            verify_media,
            launch_game,
            safety::get_safe_mode,
            safety::get_crystal_writable_root,
            discovery::fetch_vimm,
            discovery::discovery_cache_read,
            discovery::discovery_cache_write,
            import_game::import_game_source,
            acquisition_watch::get_default_download_directory,
            acquisition_watch::start_acquisition_watch,
            acquisition_watch::get_acquisition_watch_status,
            acquisition_watch::cancel_acquisition_watch,
            acquisition_watch::get_acquisition_settings,
            acquisition_watch::set_acquisition_custom_watch_directory,
            acquisition_watch::clear_acquisition_custom_watch_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}

#[cfg(test)]
mod backend_launch_guard_tests {
    use super::*;

    #[test]
    fn backend_safe_mode_blocks_before_process_spawn() {
        std::env::set_var("CRYSTAL_SAFE_MODE", "1");
        let request = LaunchBackendRequest {
            systemId: "ps2".into(),
            systemFullName: "Sony PlayStation 2".into(),
            romPath: r"D:\Emulation\roms\ps2\real-game.iso".into(),
            romBasename: "real-game".into(),
            romDirectory: r"D:\Emulation\roms\ps2".into(),
            commandLabel: "PCSX2".into(),
            commandTemplate: r#"C:\definitely-must-not-spawn\pcsx2-qt.exe "%ROM%""#.into(),
            workingDirectoryTemplate: None,
            isFirstConfiguredCommand: true,
            emulatorFindRules: vec![],
            coreFindRules: vec![],
            emulatorIdentifiers: vec![],
            coreFiles: vec![],
            corePathIdentifiers: vec![],
            identifiers: None,
            findRules: vec![],
            placeholders: HashMap::new(),
            placeholdersPresent: vec![],
        };
        let error =
            launch_game(request).expect_err("safe mode must reject the backend launch path");
        assert!(error.starts_with("SAFE_MODE_BLOCKED_LAUNCH"));
        std::env::remove_var("CRYSTAL_SAFE_MODE");
    }
}
