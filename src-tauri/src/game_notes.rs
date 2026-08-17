//! Game Notes – per-ROM freeform notes + progress 0-100
//! Pillar: bounded, safe-mode blocked, real machine truth only (never writes ES-DE configs)
//! Storage: D:\CrystalFrontend\state\game-notes.json via crystal_writable_root() + state/game-notes.json
//! Uses safety::is_safe_write_path, writable_root prefers D:\ else LOCALAPPDATA.

use crate::safety::{crystal_writable_root, ensure_writable_dirs, is_safe_mode, is_safe_write_path, log_event};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_FILE_BYTES: u64 = 256 * 1024; // 256KB total
const MAX_TEXT_LEN: usize = 4000;
const MAX_BACKUPS: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameNote {
    pub system_id: String,
    pub rom_basename: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub progress: u8,
    pub last_edit: String, // UTC ISO 8601
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    // Optional legacy field called "notes" for compatibility with older payloads
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetGameNoteRequest {
    pub system_id: String,
    pub rom_basename: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub progress: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetGameNoteRequest {
    pub system_id: String,
    pub rom_basename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteGameNoteRequest {
    pub system_id: String,
    pub rom_basename: String,
}

// ---------- sanitization & validation ----------

fn sanitize_system_id(raw: &str) -> Result<String, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err("SYSTEM_ID_EMPTY".to_string());
    }
    // Reject traversal and separators early
    if t.contains('/') || t.contains('\\') || t.contains("..") || t.contains(':') || t.contains('\0') {
        return Err(format!("SYSTEM_ID_INVALID: '{}'", t));
    }
    // Whitelist alphanumeric + - _
    if !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' ) {
        return Err(format!("SYSTEM_ID_INVALID_CHAR: '{}' – only alphanumeric, '-' and '_' allowed", t));
    }
    if t.len() > 64 {
        return Err(format!("SYSTEM_ID_TOO_LONG: {} > 64", t.len()));
    }
    Ok(t.to_string())
}

fn sanitize_rom_basename(raw: &str) -> Result<String, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err("ROM_BASENAME_EMPTY".to_string());
    }
    if t.contains('/') || t.contains('\\') || t.contains("..") || t.contains('\0') {
        return Err(format!("ROM_BASENAME_INVALID: '{}'", t));
    }
    // ':' is reserved on Windows; also reject for safety (matches spec's no \ : traverse)
    if t.contains(':') {
        return Err(format!("ROM_BASENAME_INVALID_COLON: '{}'", t));
    }
    if t.len() > 200 {
        return Err(format!("ROM_BASENAME_TOO_LONG: {} > 200", t.len()));
    }
    // Ensure no path separators hidden via unicode? Simplistic: disallow leading/trailing dots? Keep lenient
    Ok(t.to_string())
}

fn sanitize_text(raw: &str) -> String {
    // Remove null bytes, trim, truncate to MAX_TEXT_LEN chars (not bytes) to preserve utf8
    let no_null = raw.replace('\0', "");
    let trimmed = no_null.trim();
    // Remove excessive control chars except newline/tab
    let cleaned: String = trimmed.chars()
        .filter(|c| {
            if *c == '\n' || *c == '\r' || *c == '\t' {
                true
            } else {
                !c.is_control() || c.is_whitespace()
            }
        })
        .collect();
    // Truncate to 4000 chars
    if cleaned.chars().count() > MAX_TEXT_LEN {
        cleaned.chars().take(MAX_TEXT_LEN).collect()
    } else {
        cleaned
    }
}

fn ensure_not_symlink(p: &Path) -> Result<(), String> {
    // Disallow symlink file – prevents traversal to outside writable root via link
    if let Ok(meta) = fs::symlink_metadata(p) {
        if meta.file_type().is_symlink() {
            return Err(format!("GAME_NOTES_SYMLINK_BLOCKED: '{}'", p.display()));
        }
    }
    Ok(())
}

fn validate_file_size(p: &Path) -> Result<(), String> {
    if p.exists() {
        let meta = fs::metadata(p).map_err(|e| format!("GAME_NOTES_METADATA_FAILED: {}", e))?;
        if meta.len() > MAX_FILE_BYTES {
            return Err(format!("GAME_NOTES_TOO_LARGE: {} bytes > {}", meta.len(), MAX_FILE_BYTES));
        }
    }
    Ok(())
}

// ---------- file path & IO ----------

pub fn game_notes_file_path() -> Result<PathBuf, String> {
    ensure_writable_dirs()?;
    let root = crystal_writable_root();
    let path = root.join("state").join("game-notes.json");
    is_safe_write_path(&path).map_err(|e| format!("GAME_NOTES_PATH_UNSAFE: {} – {}", path.display(), e))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("GAME_NOTES_DIR_CREATE_FAILED: {}", e))?;
    }
    Ok(path)
}

fn backup_game_notes(file_path: &Path) -> Result<PathBuf, String> {
    let parent = file_path.parent().ok_or_else(|| "GAME_NOTES_NO_PARENT".to_string())?;
    // collect existing backups
    let mut existing: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(parent) {
        for e in entries.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.starts_with("game-notes.json.bak.") {
                existing.push(e.path());
            }
        }
    }
    existing.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        ma.cmp(&mb)
    });
    while existing.len() >= MAX_BACKUPS {
        if let Some(oldest) = existing.first() {
            let _ = fs::remove_file(oldest);
        }
        existing.remove(0);
    }

    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.subsec_millis()).unwrap_or(0);
    let backup_name = format!("game-notes.json.bak.{}.{}", ts, millis);
    let backup_path = parent.join(backup_name);
    fs::copy(file_path, &backup_path).map_err(|e| {
        format!(
            "GAME_NOTES_BACKUP_FAILED: copy '{}' -> '{}': {}",
            file_path.display(),
            backup_path.display(),
            e
        )
    })?;
    log_event(
        "info",
        &format!(
            "game_notes_backup_created src='{}' backup='{}'",
            file_path.display(),
            backup_path.display()
        ),
    );

    // prune again after copy to ensure max 3
    let mut all: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(parent) {
        for e in entries.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.starts_with("game-notes.json.bak.") {
                all.push(e.path());
            }
        }
    }
    all.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        ma.cmp(&mb)
    });
    while all.len() > MAX_BACKUPS {
        if let Some(oldest) = all.first() {
            let _ = fs::remove_file(oldest);
        }
        all.remove(0);
    }

    Ok(backup_path)
}

pub fn load_all_notes() -> Result<Vec<GameNote>, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }
    let path = game_notes_file_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    ensure_not_symlink(&path)?;
    validate_file_size(&path)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("GAME_NOTES_READ_FAILED: {}", e))?;
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    if content.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("GAME_NOTES_TOO_LARGE_AFTER_READ: {} bytes", content.len()));
    }
    let notes: Vec<GameNote> = serde_json::from_str(&content).map_err(|e| format!("GAME_NOTES_PARSE_FAILED: {}", e))?;
    // sanity filter: drop entries with invalid ids (but not error) – keep valid
    let mut valid = Vec::with_capacity(notes.len());
    for mut n in notes {
        if sanitize_system_id(&n.system_id).is_err() { continue; }
        if sanitize_rom_basename(&n.rom_basename).is_err() { continue; }
        // bounded text ensure
        n.text = sanitize_text(&n.text);
        if n.progress > 100 {
            n.progress = 100;
        }
        valid.push(n);
    }
    Ok(valid)
}

pub fn save_all_notes(notes: &[GameNote]) -> Result<(), String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }
    if notes.len() > 5000 {
        return Err(format!("GAME_NOTES_TOO_MANY: {} > 5000", notes.len()));
    }
    let path = game_notes_file_path()?;
    if path.exists() {
        ensure_not_symlink(&path)?;
        // backup before overwrite if file non-empty
        if fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false) {
            let _ = backup_game_notes(&path);
        }
    }
    // serialize bounded
    let mut json_str = serde_json::to_string_pretty(notes).map_err(|e| format!("GAME_NOTES_SERIALIZE_FAILED: {}", e))?;
    if json_str.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("GAME_NOTES_SERIALIZED_TOO_LARGE: {} bytes > {}", json_str.len(), MAX_FILE_BYTES));
    }

    // atomic write
    let tmp_path = path.with_extension("tmp");
    is_safe_write_path(&tmp_path).map_err(|e| format!("GAME_NOTES_TMP_UNSAFE: {}", e))?;
    fs::write(&tmp_path, json_str.as_bytes()).map_err(|e| format!("GAME_NOTES_TMP_WRITE_FAILED: {}", e))?;
    fs::rename(&tmp_path, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("GAME_NOTES_RENAME_FAILED: {}", e)
    })?;
    log_event("info", &format!("game_notes_saved count={} file='{}'", notes.len(), path.display()));
    Ok(())
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn get_all_game_notes() -> Result<Vec<GameNote>, String> {
    load_all_notes()
}

#[tauri::command]
pub fn get_game_note(system_id: String, rom_basename: String) -> Result<Option<GameNote>, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }
    let sys = sanitize_system_id(&system_id)?;
    let rom = sanitize_rom_basename(&rom_basename)?;
    let all = load_all_notes()?;
    Ok(all.into_iter().find(|n| n.system_id == sys && n.rom_basename == rom))
}

#[tauri::command]
pub fn set_game_note(system_id: String, rom_basename: String, text: String, progress: u8) -> Result<GameNote, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }
    let sys = sanitize_system_id(&system_id)?;
    let rom = sanitize_rom_basename(&rom_basename)?;
    if progress > 100 {
        return Err(format!("PROGRESS_OUT_OF_RANGE: {} > 100", progress));
    }
    let sanitized_text = sanitize_text(&text);

    let mut all = load_all_notes().unwrap_or_default();

    let now_iso = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let existing_idx = all.iter().position(|n| n.system_id == sys && n.rom_basename == rom);
    let note = if let Some(idx) = existing_idx {
        let mut existing = all[idx].clone();
        existing.text = sanitized_text.clone();
        existing.progress = progress;
        existing.last_edit = now_iso.clone();
        existing.notes = Some(sanitized_text.clone());
        all[idx] = existing.clone();
        existing
    } else {
        let new_note = GameNote {
            system_id: sys.clone(),
            rom_basename: rom.clone(),
            text: sanitized_text.clone(),
            progress,
            last_edit: now_iso.clone(),
            created_at: Some(now_iso.clone()),
            notes: Some(sanitized_text.clone()),
        };
        all.push(new_note.clone());
        new_note
    };

    // validate total size before saving (pre-check)
    // save_all will check byte size
    save_all_notes(&all)?;
    log_event("info", &format!("game_note_set system='{}' rom='{}' progress={} len={}", sys, rom, progress, sanitized_text.len()));
    Ok(note)
}

#[tauri::command]
pub fn delete_game_note(system_id: String, rom_basename: String) -> Result<bool, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED".to_string());
    }
    let sys = sanitize_system_id(&system_id)?;
    let rom = sanitize_rom_basename(&rom_basename)?;
    let mut all = load_all_notes()?;
    let original_len = all.len();
    all.retain(|n| !(n.system_id == sys && n.rom_basename == rom));
    if all.len() == original_len {
        return Ok(false);
    }
    save_all_notes(&all)?;
    log_event("info", &format!("game_note_deleted system='{}' rom='{}'", sys, rom));
    Ok(true)
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::{clear_test_writable_root_override, set_test_writable_root_override};
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use std::fs;
    use tempfile::tempdir;

    fn setup_temp_root() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        set_test_writable_root_override(dir.path().to_path_buf());
        // ensure state dir
        let state = dir.path().join("state");
        fs::create_dir_all(&state).unwrap();
        dir
    }

    #[test]
    fn sanitize_ids() {
        assert!(sanitize_system_id("ps2").is_ok());
        assert!(sanitize_system_id("snes-eu").is_ok());
        assert!(sanitize_system_id("gbc_1").is_ok());
        assert!(sanitize_system_id("../evil").is_err());
        assert!(sanitize_system_id("ps2/evil").is_err());
        assert!(sanitize_system_id("a:b").is_err());
        assert!(sanitize_system_id("ps@2").is_err());
        assert!(sanitize_rom_basename("Gran Turismo 4").is_ok());
        assert!(sanitize_rom_basename("good-name").is_ok());
        assert!(sanitize_rom_basename("../traversal").is_err());
        assert!(sanitize_rom_basename("a/b").is_err());
        assert!(sanitize_rom_basename("a\\b").is_err());
        assert!(sanitize_rom_basename("C:evil").is_err());
    }

    #[test]
    fn text_truncate() {
        let long = "a".repeat(5000);
        let sanitized = sanitize_text(&long);
        assert_eq!(sanitized.chars().count(), 4000);
    }

    #[test]
    fn crud_flow() {
        let _guard = acquire_shared_test_env_lock();
        let tmp = setup_temp_root();
        let _ = clear_test_writable_root_override; // usage

        // empty initially
        let all = load_all_notes().unwrap();
        assert!(all.is_empty());

        // set
        let note = set_game_note("ps2".into(), "Burnout 3".into(), "Great racing".into(), 42).unwrap();
        assert_eq!(note.system_id, "ps2");
        assert_eq!(note.progress, 42);

        // get
        let got = get_game_note("ps2".into(), "Burnout 3".into()).unwrap();
        assert!(got.is_some());
        assert_eq!(got.unwrap().text, "Great racing");

        // get all
        let all2 = get_all_game_notes().unwrap();
        assert_eq!(all2.len(), 1);

        // update
        let note2 = set_game_note("ps2".into(), "Burnout 3".into(), "Updated".into(), 80).unwrap();
        assert_eq!(note2.text, "Updated");
        assert!(note2.created_at.is_some());

        // delete
        let deleted = delete_game_note("ps2".into(), "Burnout 3".into()).unwrap();
        assert!(deleted);
        let after = get_all_game_notes().unwrap();
        assert!(after.is_empty());

        clear_test_writable_root_override();
        drop(tmp);
    }

    #[test]
    fn rejects_symlink_and_oversized() {
        let _guard = acquire_shared_test_env_lock();
        let tmp = setup_temp_root();
        let path = game_notes_file_path().unwrap();
        fs::write(&path, br#"[]"#).unwrap();
        // symlink test unix only
        #[cfg(unix)]
        {
            let link = tmp.path().join("state").join("link.json");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            let res = ensure_not_symlink(&link);
            assert!(res.is_err());
        }
        // oversize
        let large = "x".repeat((MAX_FILE_BYTES + 1) as usize);
        fs::write(&path, large.as_bytes()).unwrap();
        let res = validate_file_size(&path);
        assert!(res.is_err());

        clear_test_writable_root_override();
    }

    #[test]
    fn safe_mode_blocks() {
        let _guard = acquire_shared_test_env_lock();
        std::env::set_var("CRYSTAL_SAFE_MODE", "1");
        let err = set_game_note("ps2".into(), "test".into(), "hi".into(), 10).unwrap_err();
        assert!(err.contains("SAFE_MODE_BLOCKED"));
        std::env::remove_var("CRYSTAL_SAFE_MODE");
        crate::safety::set_safe_mode_for_tests(false);
    }

    #[test]
    fn backup_prunes() {
        let _guard = acquire_shared_test_env_lock();
        let tmp = setup_temp_root();
        let path = game_notes_file_path().unwrap();
        fs::write(&path, b"[]").unwrap();
        // create 5 fake backups
        let parent = path.parent().unwrap();
        for i in 0..5 {
            let p = parent.join(format!("game-notes.json.bak.{}.{}", 1000 + i, i));
            fs::write(&p, b"bak").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        backup_game_notes(&path).unwrap();
        let remaining: Vec<_> = fs::read_dir(parent).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with("game-notes.json.bak.")).collect();
        assert!(remaining.len() <= 3, "should keep max 3, got {}", remaining.len());
        clear_test_writable_root_override();
    }
}
