mod acquisition_watch;
mod discovery;
mod download_resolver;
mod import_game;
mod launch_lifecycle;
mod machine_config;
mod provider_surface;
mod safety;
mod test_env_lock;

use safety::{
    crystal_writable_root, ensure_writable_dirs, init_safe_mode_from_env, is_safe_mode, log_event,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "windows"))]
use tauri_plugin_shell::ShellExt;

static LAUNCH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
static LAST_SUCCESSFUL_LAUNCH_MS: AtomicU64 = AtomicU64::new(0);
const DUPLICATE_LAUNCH_COOLDOWN_MS: u64 = 10_000;

struct LaunchGuard;
impl Drop for LaunchGuard {
    fn drop(&mut self) {
        LAUNCH_IN_FLIGHT.store(false, Ordering::Release);
    }
}

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
    // ES-DE supports games in subfolders (and writes those relative paths to
    // gamelist.xml). Walk recursively so Crystal sees the same library.
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        if let Ok(entries) = std::fs::read_dir(&current) {
            for entry in entries.flatten() {
                if let Ok(ft) = entry.file_type() {
                    let path = entry.path();
                    if ft.is_dir() {
                        pending.push(path);
                    } else if ft.is_file()
                        && (accept_all
                            || path
                                .extension()
                                .and_then(|e| e.to_str())
                                .map(|e| ext_lower_set.contains(&e.to_lowercase()))
                                .unwrap_or(false))
                    {
                        files.push(path);
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

    let mut files = list_files_in_dir(&rom_dir_path, &valid_exts);
    // A CUE is the launchable identity for a cue/bin disc set. Individual BIN
    // tracks are implementation files, not separate games.
    let cue_dirs: std::collections::HashSet<PathBuf> = files
        .iter()
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("cue"))
                .unwrap_or(false)
        })
        .filter_map(|p| p.parent().map(Path::to_path_buf))
        .collect();
    files.retain(|p| {
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext.eq_ignore_ascii_case("bin")
            && p.parent().map(|d| cue_dirs.contains(d)).unwrap_or(false)
        {
            return false;
        }
        if ext.eq_ignore_ascii_case("7z") || ext.eq_ignore_ascii_case("zip") {
            let extracted = p.with_extension("");
            if extracted.is_dir() {
                return false;
            }
        }
        true
    });

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
    let _ = template;
    None
}

fn expand_inject_directives(
    template: &str,
    gamedir: &Path,
    basename: &str,
) -> Result<String, String> {
    let inject_re = regex::Regex::new(r#"(?i)%INJECT%=([^\s]+)"#).unwrap();
    let mut expanded = template.to_string();
    let directives: Vec<(String, String)> = inject_re
        .captures_iter(template)
        .filter_map(|cap| {
            Some((
                cap.get(0)?.as_str().to_string(),
                cap.get(1)?.as_str().to_string(),
            ))
        })
        .collect();

    for (directive, raw_name) in directives {
        let relative = raw_name.trim_matches('"').replace("%BASENAME%", basename);
        let candidate = gamedir.join(&relative);
        if !candidate.starts_with(gamedir) {
            return Err(format!(
                "INJECT path escaped game directory: '{}'",
                candidate.display()
            ));
        }
        let injected = if candidate.is_file() {
            let metadata = std::fs::metadata(&candidate).map_err(|e| {
                format!(
                    "Could not inspect INJECT file '{}': {}",
                    candidate.display(),
                    e
                )
            })?;
            if metadata.len() > 64 * 1024 {
                return Err(format!(
                    "INJECT file is too large: '{}'",
                    candidate.display()
                ));
            }
            std::fs::read_to_string(&candidate)
                .map_err(|e| {
                    format!(
                        "Could not read INJECT file '{}': {}",
                        candidate.display(),
                        e
                    )
                })?
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            String::new()
        };
        expanded = expanded.replacen(&directive, &injected, 1);
    }
    Ok(expanded)
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
    // ES-DE's Windows find rules treat %ESPATH% as the directory containing
    // the ES-DE application folder (for EmuDeck: ...\EmulationStation-DE).
    // It must never be inferred from the ROM root, which may live on another
    // drive entirely.
    if let Some(es_de_root) = config
        .get("machine")
        .and_then(|machine| machine.get("esDeRoot"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
    {
        let root = PathBuf::from(es_de_root);
        return root.parent().map(Path::to_path_buf).or(Some(root));
    }
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
            // ES-DE staticpath rules may deliberately contain a filename
            // wildcard (for versioned emulator executables such as PCSX2).
            // Path::exists treats '*' literally, so resolve the same pattern
            // ES-DE uses and choose a deterministic file match.
            if expanded.contains('*') || expanded.contains('?') {
                if let Ok(matches) = glob::glob(&expanded) {
                    let mut files: Vec<PathBuf> = matches
                        .filter_map(Result::ok)
                        .filter(|candidate| candidate.is_file())
                        .collect();
                    files.sort_by(|a, b| {
                        a.to_string_lossy()
                            .to_lowercase()
                            .cmp(&b.to_string_lossy().to_lowercase())
                    });
                    if let Some(found) = files.into_iter().next() {
                        return Some(found);
                    }
                }
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

fn quote_command_value(value: &str) -> String {
    if value.is_empty() || (!value.chars().any(char::is_whitespace) && !value.contains('"')) {
        return value.to_string();
    }

    format!("\"{}\"", value.replace('"', "\\\""))
}

// ---------- Launch internal – single authority for spawn ----------

fn launch_game_internal(request: LaunchBackendRequest) -> Result<std::process::Child, String> {
    // SAFE MODE guard – must be first
    if is_safe_mode() {
        let msg = format!(
            "SAFE_MODE_BLOCKED_LAUNCH: Crystal SAFE MODE active – launch blocked for '{}' (rom '{}'). Disable CRYSTAL_SAFE_MODE to allow launching.",
            request.systemId, request.romBasename
        );
        log_event("warn", &msg);
        return Err("SAFE_MODE_BLOCKED_LAUNCH: Crystal SAFE MODE active – launch blocked. Disable CRYSTAL_SAFE_MODE to allow launching.".to_string());
    }

    if LAUNCH_IN_FLIGHT.swap(true, Ordering::AcqRel) {
        log_event("warn", "launch_duplicate_blocked: launch already in flight");
        return Err("LAUNCH_ALREADY_IN_PROGRESS".to_string());
    }
    let _launch_guard = LaunchGuard;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last_ms = LAST_SUCCESSFUL_LAUNCH_MS.load(Ordering::Acquire);
    if last_ms > 0 && now_ms.saturating_sub(last_ms) < DUPLICATE_LAUNCH_COOLDOWN_MS {
        log_event(
            "warn",
            "launch_duplicate_blocked: successful launch cooldown active",
        );
        return Err(
            "LAUNCH_DUPLICATE_BLOCKED: A game was already launched moments ago".to_string(),
        );
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

    let mut expanded =
        expand_inject_directives(&request.commandTemplate, &gamedir, &request.romBasename)?;
    let mut keys: Vec<String> = subs.keys().cloned().collect();
    keys.sort_by(|a, b| b.len().cmp(&a.len()));
    for k in keys {
        if let Some(v) = subs.get(&k) {
            let explicitly_quoted = format!("\"{}\"", k);
            expanded = expanded.replace(&explicitly_quoted, &quote_command_value(v));
            expanded = expanded.replace(&k, &quote_command_value(v));
        }
    }

    let mut working_dir_override: Option<PathBuf> = None;
    let trimmed = expanded.trim_start().to_string();
    let startdir_prefix = regex::Regex::new(r#"(?i)^%STARTDIR%\s*=\s*("[^"]+"|\S+)\s+"#).unwrap();
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
            wd_expanded = wd_expanded.replace("%STARTDIR%", &gamedir.to_string_lossy());
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
        let is_windows_path = PathBuf::from(&program).is_absolute() || program.contains(":\\");
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
                // Dry-run on non-windows: return a dummy child? For desktop validation we need a real Child.
                // Spawn a short-lived no-op shell that exits quickly so watcher logic can be tested.
                // Use `sleep 0` equivalent via `true` (unix) or `cmd /C echo`
                #[cfg(not(windows))]
                {
                    let mut dummy = std::process::Command::new("true");
                    if let Ok(child) = dummy.spawn() {
                        return Ok(child);
                    }
                    return Err("DRYRUN_TRUE_SPAWN_FAILED".to_string());
                }
                #[cfg(windows)]
                {
                    let mut dummy = std::process::Command::new("cmd");
                    dummy.args(["/C", "echo", "dry-run"]);
                    if let Ok(child) = dummy.spawn() {
                        return Ok(child);
                    }
                    return Err("DRYRUN_CMD_SPAWN_FAILED".to_string());
                }
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
        Ok(mut child) => {
            log_event(
                "info",
                &format!(
                    "launch_spawned program='{}' wd='{}' safe_mode={} pid={}",
                    program,
                    default_wd.display(),
                    is_safe_mode(),
                    child.id()
                ),
            );
            std::thread::sleep(Duration::from_millis(900));
            match child.try_wait() {
                Ok(Some(status)) => {
                    let err = format!(
                        "EMULATOR_EXITED_EARLY: '{}' exited during startup with status {}",
                        request.commandLabel, status
                    );
                    log_event("error", &err);
                    Err(err)
                }
                Ok(None) => {
                    LAST_SUCCESSFUL_LAUNCH_MS.store(now_ms, Ordering::Release);
                    log_event(
                        "info",
                        &format!(
                            "launch_verified program='{}' pid={} survived_startup_ms=900",
                            program,
                            child.id()
                        ),
                    );
                    Ok(child)
                }
                Err(e) => {
                    let err = format!(
                        "LAUNCH_STATUS_CHECK_FAILED: could not verify '{}' after spawn: {}",
                        request.commandLabel, e
                    );
                    log_event("error", &err);
                    Err(err)
                }
            }
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

#[tauri::command]
fn launch_game(request: LaunchBackendRequest) -> Result<(), String> {
    let child = launch_game_internal(request)?;
    // Original path deliberately discards child – authoritative behavior unchanged
    // Keep child alive: detach by forgetting? Child dropped but OS process continues (spawned)
    std::mem::forget(child);
    Ok(())
}

#[tauri::command]
fn launch_game_with_handoff(
    request: LaunchBackendRequest,
) -> Result<launch_lifecycle::HandoffReady, String> {
    // SAFE_MODE guard remains authoritative – same as launch_game_internal but we repeat for explicit error
    if is_safe_mode() {
        log_event("warn", "launch_game_with_handoff blocked by SAFE_MODE");
        return Err("SAFE_MODE_BLOCKED_LAUNCH: Crystal SAFE MODE active – launch blocked. Disable CRYSTAL_SAFE_MODE to allow launching.".to_string());
    }

    // Persist small bounded restore state BEFORE launch – required for return journey
    let restore_state = launch_lifecycle::RestoreState {
        system_id: request.systemId.clone(),
        rom_path: request.romPath.clone(),
        rom_basename: request.romBasename.clone(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        version: 1,
    };

    let restore_path = launch_lifecycle::save_restore_state(&restore_state)
        .map_err(|e| format!("RESTORE_SAVE_FAILED: {}", e))?;

    // Launch via single authority
    let child = launch_game_internal(request)?;

    let pid = child.id();

    // Secure watcher BEFORE allowing Crystal to terminate – if fails, keep Crystal open and kill game
    match launch_lifecycle::spawn_watcher_for_pid(pid, Some(restore_path.clone())) {
        Ok(handoff) => {
            // Do NOT wait – process continues; we keep child stored by forgetting to avoid killing on drop? On Unix dropping Child does not kill; but for safety we detach.
            std::mem::forget(child);
            log_event(
                "info",
                &format!(
                    "handoff_ready pid={} session={} restore={}",
                    pid, handoff.session_id, handoff.restore_path
                ),
            );
            Ok(handoff)
        }
        Err(e) => {
            // Cleanup: attempt kill, clear restore, no orphan watcher
            let mut c = child;
            let _ = c.kill();
            launch_lifecycle::clear_restore_state();
            log_event(
                "error",
                &format!(
                    "watcher_create_failed pid={} err={} – launch aborted, Crystal remains open",
                    pid, e
                ),
            );
            Err(format!(
                "WATCHER_CREATE_FAILED: {} – Crystal remains open, no orphan",
                e
            ))
        }
    }
}

// ---------- Lifecycle + restore commands ----------
// Note: primary restore/exit commands live in launch_lifecycle module to keep single authority
// The local helpers `prepare_launch_restore_state` etc are intentionally not duplicated here.

// ---------- Entry ----------

#[tauri::command]
fn open_external_catalog_url(_app: AppHandle, url: String) -> Result<(), String> {
    log_event(
        "info",
        &format!("external_catalog_open_requested url='{}'", url),
    );
    let parsed = url::Url::parse(&url).map_err(|e| {
        let message = format!("INVALID_CATALOG_URL: {}", e);
        log_event("error", &message);
        message
    })?;
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let allowed_host = matches!(
        host.as_str(),
        "romsfun.com" | "www.romsfun.com" | "vimm.net" | "www.vimm.net"
    );
    let allowed_path = if host.ends_with("romsfun.com") {
        parsed.path().starts_with("/roms/")
    } else {
        parsed.path() == "/vault" || parsed.path().starts_with("/vault/")
    };
    if parsed.scheme() != "https"
        || !allowed_host
        || !allowed_path
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        let message =
            "CATALOG_URL_BLOCKED: only validated first-party catalog pages may open externally"
                .to_string();
        log_event("error", &format!("{} url='{}'", message, url));
        return Err(message);
    }

    #[cfg(target_os = "windows")]
    let open_result = std::process::Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(&url)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let open_result = _app.shell().open(url.clone(), None).map(|_| {
        // Match std::process::Command::spawn's success shape for shared handling.
        std::process::Command::new("true")
            .spawn()
            .expect("true must be available")
    });

    open_result.map_err(|e| {
        let message = format!("EXTERNAL_BROWSER_OPEN_FAILED: {}", e);
        log_event("error", &format!("{} url='{}'", message, url));
        message
    })?;
    log_event("info", &format!("external_catalog_opened url='{}'", url));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
fn exit_crystal() -> Result<(), String> {
    log_event("info", "exit_crystal requested by user");
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(75));
        std::process::exit(0);
    });
    Ok(())
}

pub fn run() {
    // --- WATCHER MODE EARLY DETECTION (before Tauri builder) ---
    let raw_args: Vec<String> = std::env::args().collect();
    if raw_args.iter().any(|a| a == "--crystal-watcher") {
        match launch_lifecycle::run_watcher_mode(raw_args) {
            Ok(_) => std::process::exit(0),
            Err(e) => {
                eprintln!("crystal watcher failed: {}", e);
                std::process::exit(1);
            }
        }
    }

    // Init SAFE MODE before anything else – sets static from env var
    let safe = init_safe_mode_from_env();
    // Ensure writable dirs exist early; this is inside allowed root only
    match ensure_writable_dirs() {
        Ok(root) => {
            // Best effort log startup
            log_event(
                "info",
                &format!(
                    "crystal-frontend startup safe_mode={} writable_root='{}' version=4.5.0 restored_boot={} args={:?}",
                    safe,
                    root.display(),
                    raw_args.iter().any(|a| a == "--crystal-restored"),
                    raw_args
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

    // If this is a restored boot (--crystal-restored) we keep restore.json until frontend loads and clears it
    if raw_args.iter().any(|a| a == "--crystal-restored") {
        log_event("info", "crystal_restored_boot detected – restore.json will be offered to frontend then cleared");
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
            open_external_catalog_url,
            launch_game,
            launch_game_with_handoff,
            safety::get_safe_mode,
            safety::get_crystal_writable_root,
            discovery::fetch_vimm,
            discovery::fetch_romsfun,
            discovery::discovery_cache_read,
            discovery::discovery_cache_write,
            download_resolver::scan_downloaded_games,
            download_resolver::resolve_downloaded_game,
            download_resolver::clear_verified_download,
            import_game::import_game_source_async,
            import_game::get_import_activity,
            acquisition_watch::get_default_download_directory,
            acquisition_watch::start_acquisition_watch,
            acquisition_watch::get_acquisition_watch_status,
            acquisition_watch::cancel_acquisition_watch,
            acquisition_watch::get_acquisition_settings,
            acquisition_watch::set_acquisition_custom_watch_directory,
            acquisition_watch::clear_acquisition_custom_watch_directory,
            provider_surface::create_provider_surface,
            provider_surface::close_provider_surface,
            provider_surface::close_provider_surface_with_app,
            provider_surface::resize_provider_surface,
            provider_surface::get_provider_surface_status,
            launch_lifecycle::get_launch_restore_state,
            launch_lifecycle::save_launch_restore_state,
            launch_lifecycle::clear_launch_restore_state,
            launch_lifecycle::exit_crystal_after_handoff,
            exit_crystal
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
    use crate::test_env_lock::acquire_shared_test_env_lock;

    #[test]
    fn substituted_windows_paths_with_spaces_remain_single_arguments() {
        let command = format!(
            "{} -L {} {}",
            quote_command_value(r"C:\Program Files\RetroArch\retroarch.exe"),
            quote_command_value(r"C:\Program Files\RetroArch\cores\gambatte_libretro.dll"),
            quote_command_value(r"D:\Emulation\roms\gb\Super Mario Land (World).gb")
        );
        let (program, args) = split_command_respecting_quotes(&command);

        assert_eq!(program, r"C:\Program Files\RetroArch\retroarch.exe");
        assert_eq!(
            args,
            vec![
                "-L",
                r"C:\Program Files\RetroArch\cores\gambatte_libretro.dll",
                r"D:\Emulation\roms\gb\Super Mario Land (World).gb"
            ]
        );
    }

    #[test]
    fn emulator_find_rule_resolves_versioned_wildcard_executable() {
        let root = std::env::temp_dir().join(format!("crystal-find-rule-{}", std::process::id()));
        let emulator_dir = root.join("Emulators").join("PCSX2-Qt");
        std::fs::create_dir_all(&emulator_dir).unwrap();
        let executable = emulator_dir.join("pcsx2-qt.exe");
        std::fs::write(&executable, b"test").unwrap();
        let pattern = format!("{}\\pcsx2-qt*.exe", emulator_dir.display());
        let rule = FindRule {
            kind: "emulator".into(),
            identifier: "PCSX2".into(),
            source: String::new(),
            rules: vec![FindRuleEntry {
                entry_type: "staticpath".into(),
                entries: vec![pattern],
            }],
        };
        let resolved = resolve_find_rule_path(&rule, &None, &root);
        assert_eq!(resolved, Some(executable));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn inject_directive_disappears_when_optional_file_is_absent() {
        let root = std::env::temp_dir().join(format!("crystal-inject-none-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let expanded = expand_inject_directives(
            "%EMULATOR_XENIA% %INJECT%=%BASENAME%.commands %ROM%",
            &root,
            "Halo 3 (Europe)",
        )
        .unwrap();
        assert_eq!(expanded, "%EMULATOR_XENIA%  %ROM%");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn inject_directive_reads_bounded_per_game_arguments() {
        let root = std::env::temp_dir().join(format!("crystal-inject-args-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("Halo 3.commands"), "--fullscreen\n--gpu=vulkan").unwrap();
        let expanded = expand_inject_directives(
            "%EMULATOR_XENIA% %INJECT%=%BASENAME%.commands %ROM%",
            &root,
            "Halo 3",
        )
        .unwrap();
        assert_eq!(expanded, "%EMULATOR_XENIA% --fullscreen --gpu=vulkan %ROM%");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rom_enumerator_finds_supported_files_in_subfolders() {
        let root =
            std::env::temp_dir().join(format!("crystal-recursive-roms-{}", std::process::id()));
        let nested = root.join("Wipeout Pulse");
        std::fs::create_dir_all(&nested).unwrap();
        let rom = nested.join("Wipeout Pulse.iso");
        std::fs::write(&rom, b"test").unwrap();
        std::fs::write(nested.join("Vimm's Lair.txt"), b"ignored").unwrap();
        let found = list_files_in_dir(&root, &[".iso".into()]);
        assert_eq!(found, vec![rom]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn espath_comes_from_authoritative_es_de_root_not_rom_drive() {
        let config = serde_json::json!({
            "machine": {
                "esDeRoot": r"C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE\ES-DE"
            },
            "roots": { "rom": r"D:\Emulation\roms\" }
        });

        assert_eq!(
            derive_espath(&config),
            Some(PathBuf::from(
                r"C:\Users\ciara\AppData\Roaming\EmuDeck\EmulationStation-DE"
            ))
        );
    }

    #[test]
    fn backend_safe_mode_blocks_before_process_spawn() {
        let _guard = acquire_shared_test_env_lock();
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
        // Ensure SAFE_MODE static reset for subsequent tests
        crate::safety::set_safe_mode_for_tests(false);
    }
}
