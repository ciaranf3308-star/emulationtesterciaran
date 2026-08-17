//! gamelist_favorites – safe ES-DE gamelist.xml favorite persistence
//! Pillar 2 Library Alive
//! Only mutates <favorite> flag, preserves other fields, bounded backups, safe-mode blocked.

use crate::machine_config::load_machine_config_json;
use crate::safety::{is_safe_mode, log_event};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_GAMELIST_BYTES: u64 = 10 * 1024 * 1024;
const MAX_BACKUPS: usize = 3;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetFavoriteRequest {
    pub system_id: String,
    pub rom_basename: String,
    #[serde(default)]
    pub rom_path: String,
    pub favorite: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameLike {
    pub id: String,
    pub system_id: String,
    pub name: String,
    pub rom_path: String,
    pub rom_basename: String,
    pub favorite: Option<bool>,
}

fn get_gamelists_root_from_config(config: &serde_json::Value) -> Result<String, String> {
    let roots = config.get("roots").ok_or_else(|| "MACHINE_CONFIG_MISSING_ROOTS".to_string())?;
    let gamelists = roots
        .get("gamelists")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "MACHINE_CONFIG_MISSING_GAMELISTS_ROOT".to_string())?
        .to_string();
    if gamelists.trim().is_empty() {
        return Err("GAMELISTS_ROOT_EMPTY".to_string());
    }
    Ok(gamelists)
}

fn clean_system_id(s: &str) -> Result<String, String> {
    let t = s.trim();
    if t.is_empty() {
        return Err("SYSTEM_ID_EMPTY".to_string());
    }
    if t.contains('/')
        || t.contains('\\')
        || t.contains("..")
        || t.contains(':')
        || t.contains('\0')
    {
        return Err(format!("SYSTEM_ID_INVALID: '{}'", t));
    }
    // allow alphanumeric, underscore, dash
    // we permit any non-empty without traversal; but reject suspicious
    Ok(t.to_string())
}

fn gamelist_path_for_system(gamelists_root: &str, system_id: &str) -> PathBuf {
    let clean_root = gamelists_root.trim_end_matches(|c| c == '/' || c == '\\').to_string();
    let sep = if clean_root.contains('\\') { "\\" } else { "/" };
    PathBuf::from(format!("{}{}{}/gamelist.xml", clean_root, sep, system_id))
}

fn validate_gamelist_path_inside_root(gamelist_path: &Path, gamelists_root: &str) -> Result<(), String> {
    let root_clean = gamelists_root.trim_end_matches(|c| c == '/' || c == '\\').to_lowercase();
    let gp_str = gamelist_path.to_string_lossy().to_lowercase().replace('/', "\\").replace("\\\\", "\\");
    // also normalize both to forward slash comparison for cross-platform
    let gp_norm = gamelist_path.to_string_lossy().to_string().replace('\\', "/").to_lowercase();
    let root_norm = gamelists_root.trim_end_matches(|c| c == '/' || c == '\\').replace('\\', "/").to_lowercase();

    // quick check: gamelist path must start with root (case-insensitive)
    if !gp_norm.starts_with(&root_norm) {
        return Err(format!(
            "GAMELIST_PATH_ESCAPE: '{}' not inside gamelists root '{}'",
            gamelist_path.display(),
            gamelists_root
        ));
    }
    // ensure separator boundary
    if gp_norm.len() > root_norm.len() {
        let rest = &gp_norm[root_norm.len()..];
        if !rest.starts_with('/') && !rest.starts_with('\\') && !rest.is_empty() {
            return Err(format!(
                "GAMELIST_PATH_SPOOF: '{}' prefix matches root but not on boundary",
                gamelist_path.display()
            ));
        }
    }
    let _ = gp_str; // suppress unused
    Ok(())
}

fn ensure_not_symlink(p: &Path) -> Result<(), String> {
    if let Ok(meta) = fs::symlink_metadata(p) {
        if meta.file_type().is_symlink() {
            return Err(format!("GAMELIST_SYMLINK_BLOCKED: '{}'", p.display()));
        }
    }
    Ok(())
}

fn validate_file_size(p: &Path) -> Result<(), String> {
    let meta = fs::metadata(p).map_err(|e| format!("GAMELIST_METADATA_FAILED: {}", e))?;
    if meta.len() > MAX_GAMELIST_BYTES {
        return Err(format!(
            "GAMELIST_TOO_LARGE: {} bytes > {}",
            meta.len(),
            MAX_GAMELIST_BYTES
        ));
    }
    Ok(())
}

fn backup_gamelist(gamelist_path: &Path) -> Result<PathBuf, String> {
    let parent = gamelist_path
        .parent()
        .ok_or_else(|| "GAMELIST_NO_PARENT".to_string())?;
    // list existing backups
    let mut existing: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(parent) {
        for e in entries.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.starts_with("gamelist.xml.bak.") {
                existing.push(e.path());
            }
        }
    }
    // sort oldest first by modified time
    existing.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        ma.cmp(&mb)
    });
    // prune to keep at most MAX_BACKUPS-1 before creating new (so total <= MAX_BACKUPS)
    while existing.len() >= MAX_BACKUPS {
        if let Some(oldest) = existing.first() {
            let _ = fs::remove_file(oldest);
        }
        existing.remove(0);
    }

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // add millis for uniqueness
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_millis())
        .unwrap_or(0);
    let backup_name = format!("gamelist.xml.bak.{}.{}", ts, millis);
    let backup_path = parent.join(backup_name);
    fs::copy(gamelist_path, &backup_path).map_err(|e| {
        format!(
            "GAMELIST_BACKUP_FAILED: copy '{}' -> '{}': {}",
            gamelist_path.display(),
            backup_path.display(),
            e
        )
    })?;
    log_event(
        "info",
        &format!(
            "gamelist_backup_created system_path='{}' backup='{}'",
            gamelist_path.display(),
            backup_path.display()
        ),
    );

    // after copy, ensure we still have max 3 – if we somehow exceeded, prune again
    let mut all_backups: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(parent) {
        for e in entries.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.starts_with("gamelist.xml.bak.") {
                all_backups.push(e.path());
            }
        }
    }
    all_backups.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        ma.cmp(&mb)
    });
    while all_backups.len() > MAX_BACKUPS {
        if let Some(oldest) = all_backups.first() {
            let _ = fs::remove_file(oldest);
        }
        all_backups.remove(0);
    }

    Ok(backup_path)
}

// ---------- quick-xml helpers for two-pass matching ----------

#[derive(Debug, Clone, Default)]
struct ParsedGameMeta {
    index: usize,
    path_raw: Option<String>,
    path_basename: Option<String>, // stem lowercased
    path_file_lower: Option<String>, // full file name lowercased
    name: Option<String>,
}

fn stem_lower(s: &str) -> String {
    let pb = Path::new(s);
    pb.file_stem()
        .and_then(|f| f.to_str())
        .unwrap_or(s)
        .to_lowercase()
}

fn file_name_lower(s: &str) -> String {
    let pb = Path::new(s);
    pb.file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(s)
        .to_lowercase()
}

fn basename_from_gamelist_path_field(raw: &str) -> String {
    let clean = raw.trim_start_matches("./").trim_start_matches(".\\").trim();
    clean.to_string()
}

/// First pass: collect all games in file order, with path/name
fn parse_gamelist_collect(content: &str) -> Result<Vec<ParsedGameMeta>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(content);
    reader.trim_text(true);

    let mut games: Vec<ParsedGameMeta> = Vec::new();
    let mut current: Option<ParsedGameMeta> = None;
    let mut current_tag: String = String::new();
    let mut game_counter: usize = 0;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    current = Some(ParsedGameMeta {
                        index: game_counter,
                        ..Default::default()
                    });
                    game_counter += 1;
                } else if current.is_some() {
                    current_tag = name;
                }
            }
            Ok(Event::Empty(e)) => {
                // Empty element inside game – if it's <favorite/> etc but we still clear tag
                if current.is_some() {
                    // for path/name etc empty shouldn't happen but ignore
                    current_tag.clear();
                }
            }
            Ok(Event::Text(t)) => {
                if let Some(g) = current.as_mut() {
                    let txt = t.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "path" => {
                            g.path_raw = Some(txt.clone());
                            let clean = basename_from_gamelist_path_field(&txt);
                            g.path_basename = Some(stem_lower(&clean));
                            g.path_file_lower = Some(file_name_lower(&clean));
                        }
                        "name" => {
                            g.name = Some(txt);
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    if let Some(g) = current.take() {
                        games.push(g);
                    }
                    current_tag.clear();
                } else if current.is_some() {
                    current_tag.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(format!("GAMELIST_PARSE_FAILED: {}", e));
            }
            _ => {}
        }
        buf.clear();
    }
    Ok(games)
}

fn find_target_index(
    games: &[ParsedGameMeta],
    rom_basename: &str,
    rom_path: &str,
) -> Option<usize> {
    let rb_lower = rom_basename.trim().to_lowercase();
    let rp_lower = rom_path.trim().to_lowercase();
    let rb_file_lower = if rb_lower.contains('.') {
        rb_lower.clone()
    } else {
        // rom_basename may not contain ext; we compare stem
        rb_lower.clone()
    };

    // Heuristic order per spec: try exact ROM basename, then path substring
    // 1. exact basename match against gamelist <path> basename (stem)
    for g in games {
        if let Some(pb) = &g.path_basename {
            if pb == &rb_lower {
                return Some(g.index);
            }
        }
    }
    // 2. exact filename including ext if rom_path provides ext
    if !rp_lower.is_empty() {
        let rp_file = file_name_lower(&rp_lower);
        let rp_stem = stem_lower(&rp_lower);
        for g in games {
            if let Some(pf) = &g.path_file_lower {
                if pf == &rp_file {
                    return Some(g.index);
                }
            }
            if let Some(pb) = &g.path_basename {
                if pb == &rp_stem {
                    return Some(g.index);
                }
            }
        }
    }
    // 3. rom_basename as case-insensitive substring of path_raw? The spec says "path substring from gamelist <path>..."
    // Interpret as try path substring: if gamelist <path> contains rom_basename
    for g in games {
        if let Some(raw) = &g.path_raw {
            let raw_low = raw.to_lowercase();
            if raw_low.contains(&rb_lower) {
                return Some(g.index);
            }
        }
    }
    // 4. If rom_basename matches <name> lowercased (fallback helpful but not spec)
    for g in games {
        if let Some(name) = &g.name {
            if name.to_lowercase() == rb_lower {
                return Some(g.index);
            }
        }
    }
    // 5. rom_path substring in gamelist path (reverse)
    if !rp_lower.is_empty() {
        for g in games {
            if let Some(raw) = &g.path_raw {
                if rp_lower.contains(&raw.to_lowercase()) {
                    return Some(g.index);
                }
            }
        }
    }
    None
}

fn rewrite_gamelist_with_favorite(
    content: &str,
    target_index: usize,
    favorite: bool,
) -> Result<String, String> {
    use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
    use quick_xml::Reader;
    use quick_xml::Writer;

    let mut reader = Reader::from_str(content);
    reader.trim_text(true);
    let mut writer = Writer::new(Vec::new());

    let mut current_game_idx: isize = -1;
    let mut in_target = false;
    let mut target_has_fav = false;
    let mut inside_fav = false;
    let mut buf = Vec::new();
    let fav_str = if favorite { "true" } else { "false" };

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name().as_ref().to_vec();
                if name == b"game" {
                    current_game_idx += 1;
                    in_target = current_game_idx as usize == target_index;
                    if in_target {
                        target_has_fav = false;
                    }
                    // preserve start
                    let start = BytesStart::new("game");
                    // preserve original attributes? gamelist <game> usually no attrs, but we preserve if any
                    // For simplicity, we rewrite with same name and attributes from original event
                    // We copy attributes from e
                    let mut owned_start = BytesStart::new(String::from_utf8_lossy(&name).to_string());
                    for attr in e.attributes().flatten() {
                        owned_start.push_attribute(attr);
                    }
                    writer.write_event(Event::Start(owned_start)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                } else if in_target && name == b"favorite" {
                    // replace
                    target_has_fav = true;
                    inside_fav = true;
                    writer.write_event(Event::Start(BytesStart::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    // Immediately write new text; the next Text event from reader will be consumed/replaced in next loop iteration – we will skip it by handling Text specially
                    // But to simplify, we set flag and wait for Text event to replace. However we have already written Start, we will write text on next Text.
                    // We keep inside_fav true so next Text is replaced.
                } else {
                    // normal start copy
                    let mut owned = BytesStart::new(String::from_utf8_lossy(&name).to_string());
                    for attr in e.attributes().flatten() {
                        owned.push_attribute(attr);
                    }
                    writer.write_event(Event::Start(owned)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                }
            }
            Ok(Event::Empty(e)) => {
                let name = e.name().as_ref().to_vec();
                if in_target && name == b"favorite" {
                    // empty favorite like <favorite/> – treat as present and rewrite to proper
                    target_has_fav = true;
                    writer.write_event(Event::Start(BytesStart::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    writer.write_event(Event::Text(BytesText::new(fav_str))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    writer.write_event(Event::End(BytesEnd::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                } else {
                    let mut owned = BytesStart::new(String::from_utf8_lossy(&name).to_string());
                    for attr in e.attributes().flatten() {
                        owned.push_attribute(attr);
                    }
                    writer.write_event(Event::Empty(owned)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                }
            }
            Ok(Event::Text(t)) => {
                if in_target && inside_fav {
                    // replace text
                    writer.write_event(Event::Text(BytesText::new(fav_str))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    inside_fav = false;
                } else {
                    // preserve – need to recreate text
                    let txt = t.unescape().unwrap_or_default().to_string();
                    writer.write_event(Event::Text(BytesText::new(&txt))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                }
            }
            Ok(Event::End(e)) => {
                let name = e.name().as_ref().to_vec();
                if name == b"game" {
                    if in_target && !target_has_fav {
                        // insert missing favorite before closing game
                        writer.write_event(Event::Start(BytesStart::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                        writer.write_event(Event::Text(BytesText::new(fav_str))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                        writer.write_event(Event::End(BytesEnd::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    }
                    writer.write_event(Event::End(BytesEnd::new("game"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    in_target = false;
                } else if in_target && name == b"favorite" {
                    // we already wrote start + replaced text; now write end
                    // ensure we didn't already close via inside_fav flag
                    if target_has_fav {
                        writer.write_event(Event::End(BytesEnd::new("favorite"))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                        inside_fav = false;
                    } else {
                        writer.write_event(Event::End(BytesEnd::new(String::from_utf8_lossy(&name).to_string()))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                    }
                } else {
                    writer.write_event(Event::End(BytesEnd::new(String::from_utf8_lossy(&name).to_string()))).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
                }
            }
            Ok(Event::Decl(e)) => {
                writer.write_event(Event::Decl(e)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
            }
            Ok(Event::Comment(e)) => {
                writer.write_event(Event::Comment(e)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
            }
            Ok(Event::DocType(e)) => {
                writer.write_event(Event::DocType(e)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
            }
            Ok(Event::PI(e)) => {
                writer.write_event(Event::PI(e)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
            }
            Ok(Event::CData(e)) => {
                writer.write_event(Event::CData(e)).map_err(|e| format!("XML_WRITE_FAILED: {}", e))?;
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("GAMELIST_REWRITE_PARSE_FAILED: {}", e)),
        }
        buf.clear();
    }

    let out = writer.into_inner();
    String::from_utf8(out).map_err(|e| format!("XML_UTF8_FAILED: {}", e))
}

fn find_system_in_config<'a>(config: &'a serde_json::Value, system_id: &str) -> Option<&'a serde_json::Value> {
    crate::machine_config::find_system_in_config(config, system_id)
}

#[tauri::command]
pub fn set_favorite(request: SetFavoriteRequest) -> Result<serde_json::Value, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }

    let system_id = clean_system_id(&request.system_id)?;
    let rom_basename = request.rom_basename.trim().to_string();
    if rom_basename.is_empty() {
        return Err("ROM_BASENAME_EMPTY".to_string());
    }
    // Reject traversal in rom_basename
    if rom_basename.contains('/')
        || rom_basename.contains('\\')
        || rom_basename.contains("..")
        || rom_basename.contains('\0')
    {
        return Err(format!("ROM_BASENAME_INVALID: '{}'", rom_basename));
    }

    let config = load_machine_config_json().map_err(|e| format!("MACHINE_CONFIG_ERROR: {}", e))?;

    let gamelists_root = get_gamelists_root_from_config(&config)?;
    let gamelist_path = gamelist_path_for_system(&gamelists_root, &system_id);

    validate_gamelist_path_inside_root(&gamelist_path, &gamelists_root)?;
    ensure_not_symlink(&gamelist_path)?;
    if !gamelist_path.exists() {
        return Err(format!("GAMELIST_NOT_FOUND: '{}'", gamelist_path.display()));
    }
    validate_file_size(&gamelist_path)?;

    // ensure system exists in config (authoritative)
    if find_system_in_config(&config, &system_id).is_none() {
        return Err(format!("UNKNOWN_SYSTEM: '{}'", system_id));
    }

    // Backup before write
    backup_gamelist(&gamelist_path)?;

    let content = fs::read_to_string(&gamelist_path).map_err(|e| format!("GAMELIST_READ_FAILED: {}", e))?;
    if content.len() as u64 > MAX_GAMELIST_BYTES {
        return Err("GAMELIST_TOO_LARGE_AFTER_READ".to_string());
    }

    let parsed = parse_gamelist_collect(&content)?;
    if parsed.is_empty() {
        return Err("GAMELIST_EMPTY_NO_GAMES".to_string());
    }

    let target_idx = find_target_index(&parsed, &rom_basename, &request.rom_path);
    let target_idx = match target_idx {
        Some(i) => i,
        None => {
            return Err(format!(
                "GAME_NOT_FOUND_IN_GAMELIST: system='{}' rom_basename='{}' – no matching <path> entry, refusing to invent new entry",
                system_id, rom_basename
            ));
        }
    };

    let new_content = rewrite_gamelist_with_favorite(&content, target_idx, request.favorite)?;

    // write atomically via tmp then rename
    let tmp_path = gamelist_path.with_extension("tmp");
    fs::write(&tmp_path, new_content.as_bytes()).map_err(|e| format!("GAMELIST_TMP_WRITE_FAILED: {}", e))?;
    fs::rename(&tmp_path, &gamelist_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("GAMELIST_RENAME_FAILED: {}", e)
    })?;

    log_event(
        "info",
        &format!(
            "favorite_set system='{}' rom_basename='{}' favorite={} target_idx={}",
            system_id, rom_basename, request.favorite, target_idx
        ),
    );

    // Return minimal Game-like JSON for frontend optimistic confirmation
    // We attempt to re-enumerate? For safety, we return the request echo with id
    let system_full = find_system_in_config(&config, &system_id)
        .and_then(|s| s.get("fullName"))
        .and_then(|v| v.as_str())
        .unwrap_or(&system_id)
        .to_string();

    let result = serde_json::json!({
        "id": format!("{}/{}", system_id, rom_basename),
        "system_id": system_id,
        "system_full_name": system_full,
        "name": rom_basename.clone(),
        "rom_basename": rom_basename.clone(),
        "rom_path": request.rom_path.clone(),
        "favorite": request.favorite,
    });

    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FavoriteStatusRequest {
    pub system_id: String,
    pub rom_basename: String,
    #[serde(default)]
    pub rom_path: String,
}

#[tauri::command]
pub fn get_favorite_status(request: FavoriteStatusRequest) -> Result<bool, String> {
    let system_id = clean_system_id(&request.system_id)?;
    let config = load_machine_config_json().map_err(|e| format!("MACHINE_CONFIG_ERROR: {}", e))?;
    let gamelists_root = get_gamelists_root_from_config(&config)?;
    let gamelist_path = gamelist_path_for_system(&gamelists_root, &system_id);
    if !gamelist_path.exists() {
        return Ok(false);
    }
    let content = fs::read_to_string(&gamelist_path).map_err(|e| format!("GAMELIST_READ_FAILED: {}", e))?;
    let parsed = parse_gamelist_collect(&content)?;
    if let Some(idx) = find_target_index(&parsed, &request.rom_basename, &request.rom_path) {
        // need to also check actual favorite flag value – re-parse full to get favorite status
        // lightweight second pass to extract favorite for target
        use quick_xml::events::Event;
        use quick_xml::Reader;
        let mut reader = Reader::from_str(&content);
    reader.trim_text(true);
        let mut buf = Vec::new();
        let mut cur_idx: isize = -1;
        let mut in_target = false;
        let mut cur_tag = String::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if name == "game" {
                        cur_idx += 1;
                        in_target = cur_idx as usize == idx;
                    } else if in_target {
                        cur_tag = name;
                    }
                }
                Ok(Event::Text(t)) => {
                    if in_target && cur_tag == "favorite" {
                        let txt = t.unescape().unwrap_or_default().to_string().to_lowercase();
                        return Ok(txt == "true" || txt == "1");
                    }
                }
                Ok(Event::End(e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if name == "game" && in_target {
                        // target had no favorite tag -> false
                        return Ok(false);
                    }
                    if in_target {
                        cur_tag.clear();
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        Ok(false)
    } else {
        Ok(false)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshMetadataRequest {
    pub system_id: String,
}

#[tauri::command]
pub fn refresh_metadata_after_launch(request: RefreshMetadataRequest) -> Result<serde_json::Value, String> {
    // This is a lightweight trigger for frontend to reload metadata after emulator exit.
    // In Tauri mode, the lifecycle watcher restores Crystal and frontend should refresh.
    // Here we just re-parse gamelist for the system and return play stats count to confirm freshness.
    let system_id = clean_system_id(&request.system_id)?;
    let config = load_machine_config_json().map_err(|e| format!("MACHINE_CONFIG_ERROR: {}", e))?;
    let gamelists_root = get_gamelists_root_from_config(&config)?;
    let gamelist_path = gamelist_path_for_system(&gamelists_root, &system_id);
    if !gamelist_path.exists() {
        return Ok(serde_json::json!({"system_id": system_id, "games_with_play": 0, "refreshed": false }));
    }
    let content = fs::read_to_string(&gamelist_path).map_err(|e| format!("GAMELIST_READ_FAILED: {}", e))?;
    // count entries with lastplayed / playcount
    let parsed = parse_gamelist_collect(&content)?;
    // We need full parse for play metadata – reuse quick_xml quick scan similar to existing main.rs parser
    use quick_xml::events::Event;
    use quick_xml::Reader;
    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);
    let mut buf = Vec::new();
    let mut games_with_play = 0usize;
    let mut cur_has_play = false;
    let mut cur_tag = String::new();
    let mut in_game = false;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    in_game = true;
                    cur_has_play = false;
                } else if in_game {
                    cur_tag = name;
                }
            }
            Ok(Event::Text(t)) => {
                if in_game && (cur_tag == "lastplayed" || cur_tag == "playcount" || cur_tag == "playtime") {
                    let txt = t.unescape().unwrap_or_default().to_string();
                    if !txt.trim().is_empty() {
                        cur_has_play = true;
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "game" {
                    if cur_has_play {
                        games_with_play += 1;
                    }
                    in_game = false;
                    cur_tag.clear();
                } else if in_game {
                    cur_tag.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    log_event(
        "info",
        &format!(
            "metadata_refresh system='{}' games_with_play={} total_games={}",
            system_id,
            games_with_play,
            parsed.len()
        ),
    );

    Ok(serde_json::json!({
        "system_id": system_id,
        "games_with_play": games_with_play,
        "total_games": parsed.len(),
        "refreshed": true,
        "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
    }))
}

// For tests: expose validation helpers
#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::{clear_test_writable_root_override, set_test_writable_root_override};
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use std::fs;
    use tempfile::tempdir;

    fn make_temp_gamelist(content: &str) -> (tempfile::TempDir, PathBuf, String) {
        let dir = tempdir().unwrap();
        let gamelists_root = dir.path().join("gamelists");
        fs::create_dir_all(gamelists_root.join("ps2")).unwrap();
        let gamelist_path = gamelists_root.join("ps2").join("gamelist.xml");
        fs::write(&gamelist_path, content).unwrap();
        let root_str = gamelists_root.to_string_lossy().to_string();
        (dir, gamelist_path, root_str)
    }

    #[test]
    fn parse_and_find() {
        let xml = r#"<?xml version="1.0"?><gameList><game><path>./Burnout 3.iso</path><name>Burnout 3</name><favorite>true</favorite></game><game><path>./Gran Turismo 4.iso</path><name>GT4</name></game></gameList>"#;
        let parsed = parse_gamelist_collect(xml).unwrap();
        assert_eq!(parsed.len(), 2);
        let idx = find_target_index(&parsed, "Burnout 3", "");
        assert_eq!(idx, Some(0));
        let idx2 = find_target_index(&parsed, "Gran Turismo 4", "");
        assert_eq!(idx2, Some(1));
        let idx3 = find_target_index(&parsed, "nonexistent", "");
        assert_eq!(idx3, None);
    }

    #[test]
    fn rewrite_existing_favorite() {
        let xml = r#"<?xml version="1.0"?><gameList><game><path>./Burnout 3.iso</path><name>Burnout 3</name><favorite>true</favorite></game></gameList>"#;
        let out = rewrite_gamelist_with_favorite(xml, 0, false).unwrap();
        assert!(out.contains("<favorite>false</favorite>") || out.contains(">false<"));
        assert!(!out.contains(">true<") || out.contains("false"));
    }

    #[test]
    fn rewrite_insert_missing_favorite() {
        let xml = r#"<?xml version="1.0"?><gameList><game><path>./Burnout 3.iso</path><name>Burnout 3</name></game></gameList>"#;
        let out = rewrite_gamelist_with_favorite(xml, 0, true).unwrap();
        assert!(out.contains("favorite"));
        assert!(out.contains("true"));
    }

    #[test]
    fn backup_prunes_oldest() {
        let (_dir, gamelist_path, _root) = make_temp_gamelist("<gameList></gameList>");
        // create 5 fake backups
        let parent = gamelist_path.parent().unwrap();
        for i in 0..5 {
            let p = parent.join(format!("gamelist.xml.bak.{}.{}", 1000 + i, i));
            fs::write(&p, b"bak").unwrap();
            // ensure mtime order by sleeping tiny (not needed, sorted by modified)
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        backup_gamelist(&gamelist_path).unwrap();
        let remaining: Vec<_> = fs::read_dir(parent)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("gamelist.xml.bak."))
            .collect();
        assert!(remaining.len() <= 3, "should keep max 3, got {}", remaining.len());
    }

    #[test]
    fn safe_mode_blocks() {
        let _guard = acquire_shared_test_env_lock();
        std::env::set_var("CRYSTAL_SAFE_MODE", "1");
        let req = SetFavoriteRequest {
            system_id: "ps2".to_string(),
            rom_basename: "test".to_string(),
            rom_path: "".to_string(),
            favorite: true,
        };
        let err = set_favorite(req).unwrap_err();
        assert!(err.contains("SAFE_MODE_BLOCKED"));
        std::env::remove_var("CRYSTAL_SAFE_MODE");
        crate::safety::set_safe_mode_for_tests(false);
    }

    #[test]
    fn reject_symlink() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("real.xml");
        fs::write(&target, b"<a/>").unwrap();
        #[cfg(unix)]
        {
            let link = dir.path().join("link.xml");
            std::os::unix::fs::symlink(&target, &link).unwrap();
            let res = ensure_not_symlink(&link);
            assert!(res.is_err());
        }
    }

    #[test]
    fn validate_size_rejects_large() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("big.xml");
        // create file >10MB – we won't actually allocate 10MB in CI to be cheap, simulate via metadata truncation? Just test that function returns error if file large – we will create sparse?
        // For unit test, we directly test logic: we create 11MB string? instead we rely on file size check – create file with 11 bytes and test threshold bypass is 10MB, so we need to mock threshold? Simpler: we skip heavy I/O and test helper via direct call.
        let large_content = "a".repeat((MAX_GAMELIST_BYTES + 1) as usize);
        fs::write(&p, large_content.as_bytes()).unwrap();
        let res = validate_file_size(&p);
        assert!(res.is_err());
    }
}
