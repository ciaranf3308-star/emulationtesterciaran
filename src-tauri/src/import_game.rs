use crate::machine_config::{
    find_system_in_config, get_rom_dir_and_exts, load_machine_config_json,
};
use crate::safety::{crystal_writable_root, is_safe_mode, log_event};
#[cfg(test)]
use crate::test_env_lock::acquire_shared_test_env_lock;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Deserialize, Clone)]
pub struct ImportRequest {
    pub systemId: String,
    pub sourcePath: String,
    #[serde(default)]
    pub expectedTitle: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImportResult {
    pub status: String,
    pub systemId: String,
    #[serde(default)]
    pub installedPaths: Vec<String>,
    #[serde(default)]
    pub detectedFiles: Vec<String>,
    pub destinationDirectory: String,
    #[serde(default)]
    pub collisionPaths: Vec<String>,
    #[serde(default)]
    pub errorCode: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
}

const MAX_ZIP_FILES: usize = 2000;
const MAX_TOTAL_UNCOMPRESSED: u64 = 8u64 * 1024 * 1024 * 1024;
const MAX_SINGLE_FILE: u64 = 4u64 * 1024 * 1024 * 1024;
const MAX_FILES_TO_INSTALL: usize = 64;

fn normalize_ext(ext: &str) -> String {
    let mut e = ext.trim().to_lowercase();
    if e.starts_with('.') {
        e = e[1..].to_string();
    }
    e
}

fn ext_of_path(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default()
}

fn extension_allowed(ext: &str, allowed: &[String]) -> bool {
    let ne = normalize_ext(ext);
    if ne.is_empty() {
        return false;
    }
    for a in allowed {
        if normalize_ext(a) == ne {
            return true;
        }
    }
    false
}

fn validate_source_path(src: &Path) -> Result<(), String> {
    let s = src.to_string_lossy().to_string();
    if s.trim().is_empty() {
        return Err("SOURCE_EMPTY".to_string());
    }
    if s.starts_with("\\\\") || s.starts_with("//") {
        return Err("UNC_NOT_SUPPORTED".to_string());
    }
    if s.starts_with("\\\\?\\") || s.starts_with("\\\\.\\") {
        return Err("DEVICE_PATH_NOT_SUPPORTED".to_string());
    }
    for comp in src.components() {
        if let Component::ParentDir = comp {
            return Err("SOURCE_CONTAINS_TRAVERSAL".to_string());
        }
    }
    if let Some(file_name) = src.file_name().and_then(|n| n.to_str()) {
        let up = file_name.to_ascii_uppercase();
        let dev_names = [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];
        let base_no_ext = up.split('.').next().unwrap_or(&up);
        if dev_names.contains(&base_no_ext) {
            return Err("DEVICE_PATH_NOT_SUPPORTED".to_string());
        }
    }
    if !src.exists() {
        return Err("SOURCE_NOT_FOUND".to_string());
    }
    let meta = fs::metadata(src).map_err(|e| format!("SOURCE_METADATA_ERROR: {}", e))?;
    if meta.is_dir() {
        return Err("SOURCE_IS_DIRECTORY".to_string());
    }
    if !meta.is_file() {
        return Err("SOURCE_NOT_REGULAR_FILE".to_string());
    }
    Ok(())
}

fn is_path_traversal_entry(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return true;
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return true;
    }
    if trimmed.len() >= 2 {
        let mut chars = trimmed.chars();
        if let Some(first) = chars.next() {
            if first.is_ascii_alphabetic() {
                if let Some(second) = chars.next() {
                    if second == ':' {
                        return true;
                    }
                }
            }
        }
    }
    if trimmed.starts_with("\\\\") || trimmed.starts_with("//") {
        return true;
    }
    for seg in trimmed.split(|c| c == '/' || c == '\\') {
        if seg == ".." {
            return true;
        }
        if seg.len() >= 2 && seg.chars().nth(1) == Some(':') {
            return true;
        }
    }
    false
}

fn ensure_inside_staging(staging: &Path, candidate: &Path) -> Result<(), String> {
    if !candidate.starts_with(staging) {
        return Err(format!(
            "ESCAPE_DETECTED: '{}' not inside staging '{}'",
            candidate.display(),
            staging.display()
        ));
    }
    Ok(())
}

fn is_cue_file_ref_escaped(ref_name: &str) -> bool {
    let trimmed = ref_name.trim();
    if trimmed.is_empty() {
        return true;
    }
    // Absolute
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return true;
    }
    // UNC
    if trimmed.starts_with("//") || trimmed.starts_with("\\\\") {
        return true;
    }
    // Device prefix \\.\ or \\?\
    if trimmed.starts_with("\\\\.\\") || trimmed.starts_with("\\\\?\\") {
        return true;
    }
    // Drive qualified C: or C:\ etc at start
    if trimmed.len() >= 2 {
        let first = trimmed.chars().next().unwrap();
        let second = trimmed.chars().nth(1).unwrap();
        if first.is_ascii_alphabetic() && second == ':' {
            return true;
        }
    }
    for seg in trimmed.split(|c| c == '/' || c == '\\') {
        if seg == ".." {
            return true;
        }
        if seg == "." {
            // "." is technically not escape but for safety disallow parent-like? Spec says ParentDir only – allow "."? To be conservative, allow ".".
            continue;
        }
        if seg.is_empty() {
            // empty segments from // etc already handled but catch here
            continue;
        }
        if seg.contains(':') {
            // colon inside but not drive at start – still risky (e.g., C:foo)
            if seg.len() >= 2 && seg.chars().nth(1) == Some(':') {
                return true;
            }
            // also reject any colon for device path safety
            // Windows forbids colon in filename except drive – so reject
            if seg.contains(':') {
                return true;
            }
        }
        if seg.contains('\0') {
            return true;
        }
        // Windows drive pattern inside segment like "C:" – already captured
    }
    false
}

fn files_are_identical(a: &Path, b: &Path) -> bool {
    let meta_a = match fs::metadata(a) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let meta_b = match fs::metadata(b) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta_a.len() != meta_b.len() {
        return false;
    }
    let file_a = match fs::File::open(a) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let file_b = match fs::File::open(b) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut reader_a = io::BufReader::new(file_a);
    let mut reader_b = io::BufReader::new(file_b);
    let mut buf_a = [0u8; 8192];
    let mut buf_b = [0u8; 8192];
    loop {
        let read_a = match reader_a.read(&mut buf_a) {
            Ok(n) => n,
            Err(_) => return false,
        };
        let read_b = match reader_b.read(&mut buf_b) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if read_a != read_b {
            return false;
        }
        if read_a == 0 {
            break;
        }
        if buf_a[..read_a] != buf_b[..read_b] {
            return false;
        }
    }
    true
}

fn parse_cue_referenced_files(cue_path: &Path) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(cue_path).map_err(|e| format!("CUE_READ_ERROR: {}", e))?;
    let mut refs = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.len() < 5 {
            continue;
        }
        if !trimmed.to_ascii_uppercase().starts_with("FILE ") {
            continue;
        }
        if let Some(first_q) = trimmed.find('"') {
            if let Some(second_q) = trimmed[first_q + 1..].find('"') {
                let file_name = &trimmed[first_q + 1..first_q + 1 + second_q];
                if !file_name.trim().is_empty() {
                    refs.push(file_name.trim().to_string());
                }
            }
        } else {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                refs.push(parts[1].trim().to_string());
            }
        }
    }
    Ok(refs)
}

#[tauri::command]
pub fn import_game_source(request: ImportRequest) -> Result<ImportResult, String> {
    if is_safe_mode() {
        return Err("SAFE_MODE_BLOCKED_IMPORT".to_string());
    }

    let system_id = request.systemId.trim().to_string();
    if system_id.is_empty() {
        return Err("SYSTEM_ID_EMPTY".to_string());
    }
    let source_path_str = request.sourcePath.trim().to_string();
    if source_path_str.is_empty() {
        return Err("SOURCE_PATH_EMPTY".to_string());
    }
    let src_path = PathBuf::from(&source_path_str);

    if let Err(e) = validate_source_path(&src_path) {
        return Err(e);
    }

    let config = load_machine_config_json().map_err(|e| format!("MACHINE_CONFIG_ERROR: {}", e))?;

    let system_json = find_system_in_config(&config, &system_id)
        .ok_or_else(|| format!("UNKNOWN_SYSTEM: {}", system_id))?;

    let (rom_dir_str, valid_exts) =
        get_rom_dir_and_exts(system_json).map_err(|e| format!("SYSTEM_CONFIG_INVALID: {}", e))?;

    let rom_dir = PathBuf::from(&rom_dir_str);
    if !rom_dir.exists() {
        return Err(format!(
            "DESTINATION_UNAVAILABLE: romDirectory '{}' does not exist for system '{}'",
            rom_dir.display(),
            system_id
        ));
    }
    if !rom_dir.is_dir() {
        return Err(format!(
            "DESTINATION_NOT_DIR: romDirectory '{}' not a directory",
            rom_dir.display()
        ));
    }

    let staging_base = crystal_writable_root().join("cache").join("imports");
    if let Err(e) = fs::create_dir_all(&staging_base) {
        return Err(format!("STAGING_CREATE_FAILED: {}", e));
    }
    let session_id = Uuid::new_v4().to_string();
    let staging_dir = staging_base.join(format!("import-{}", session_id));
    fs::create_dir_all(&staging_dir).map_err(|e| format!("STAGING_DIR_CREATE_FAILED: {}", e))?;

    let cleanup_staging = |dir: &Path| {
        let _ = fs::remove_dir_all(dir);
    };

    let src_ext = ext_of_path(&src_path);
    let mut detected_files: Vec<String> = Vec::new();
    let mut files_to_install: Vec<PathBuf> = Vec::new();

    if extension_allowed(&src_ext, &valid_exts) {
        let file_name = src_path
            .file_name()
            .ok_or_else(|| "SOURCE_NO_FILENAME".to_string())?;
        let staged_path = staging_dir.join(file_name);
        ensure_inside_staging(&staging_dir, &staged_path).map_err(|e| {
            cleanup_staging(&staging_dir);
            e
        })?;
        fs::copy(&src_path, &staged_path).map_err(|e| {
            cleanup_staging(&staging_dir);
            format!("STAGING_COPY_FAILED: {}", e)
        })?;
        detected_files.push(staged_path.display().to_string());
        files_to_install.push(staged_path);
    } else if src_ext.eq_ignore_ascii_case("zip") {
        let zip_file = fs::File::open(&src_path).map_err(|e| {
            cleanup_staging(&staging_dir);
            format!("ZIP_OPEN_FAILED: {}", e)
        })?;
        let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| {
            cleanup_staging(&staging_dir);
            format!("ZIP_INVALID: {}", e)
        })?;

        let file_count = archive.len();
        if file_count == 0 {
            cleanup_staging(&staging_dir);
            return Err("EMPTY_ARCHIVE".to_string());
        }
        if file_count > MAX_ZIP_FILES {
            cleanup_staging(&staging_dir);
            return Err(format!(
                "ZIP_TOO_MANY_FILES: {} > {}",
                file_count, MAX_ZIP_FILES
            ));
        }

        let mut total_uncompressed: u64 = 0;
        for i in 0..file_count {
            let file = archive.by_index(i).map_err(|e| {
                cleanup_staging(&staging_dir);
                format!("ZIP_ENTRY_READ_FAILED index {}: {}", i, e)
            })?;
            let name = file.name().to_string();
            if is_path_traversal_entry(&name) {
                cleanup_staging(&staging_dir);
                return Err(format!("ZIP_TRAVERSAL_BLOCKED: entry '{}' rejected", name));
            }
            if let Some(mode) = file.unix_mode() {
                if (mode & 0o170000) == 0o120000 {
                    cleanup_staging(&staging_dir);
                    return Err(format!("ZIP_SYMLINK_BLOCKED: entry '{}'", name));
                }
                let file_type = mode & 0o170000;
                if file_type == 0o060000 || file_type == 0o020000 || file_type == 0o010000 {
                    cleanup_staging(&staging_dir);
                    return Err(format!(
                        "ZIP_SPECIAL_FILE_BLOCKED: entry '{}' mode {:o}",
                        name, mode
                    ));
                }
            }
            let size = file.size();
            if size > MAX_SINGLE_FILE {
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "ZIP_FILE_TOO_LARGE: entry '{}' {} bytes",
                    name, size
                ));
            }
            total_uncompressed = total_uncompressed.saturating_add(size);
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED {
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "ZIP_TOTAL_TOO_LARGE: {} bytes > {}",
                    total_uncompressed, MAX_TOTAL_UNCOMPRESSED
                ));
            }
        }

        for i in 0..file_count {
            let mut file = archive.by_index(i).map_err(|e| {
                cleanup_staging(&staging_dir);
                format!("ZIP_ENTRY_READ_FAILED index {}: {}", i, e)
            })?;
            let name = file.name().to_string();

            if file.name().ends_with('/') || file.name().ends_with('\\') {
                let out_path = staging_dir.join(&name);
                ensure_inside_staging(&staging_dir, &out_path).map_err(|e| {
                    cleanup_staging(&staging_dir);
                    e
                })?;
                if let Err(e) = fs::create_dir_all(&out_path) {
                    cleanup_staging(&staging_dir);
                    return Err(format!("ZIP_MKDIR_FAILED '{}': {}", out_path.display(), e));
                }
                continue;
            }

            let out_path = staging_dir.join(&name);
            ensure_inside_staging(&staging_dir, &out_path).map_err(|e| {
                cleanup_staging(&staging_dir);
                e
            })?;
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    cleanup_staging(&staging_dir);
                    format!("ZIP_PARENT_CREATE_FAILED '{}': {}", parent.display(), e)
                })?;
            }

            let mut outfile = fs::File::create(&out_path).map_err(|e| {
                cleanup_staging(&staging_dir);
                format!("ZIP_WRITE_FAILED '{}': {}", out_path.display(), e)
            })?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| {
                cleanup_staging(&staging_dir);
                format!("ZIP_EXTRACT_COPY_FAILED '{}': {}", out_path.display(), e)
            })?;
        }

        let mut valid_candidates: Vec<PathBuf> = Vec::new();
        let mut dirs_to_visit = vec![staging_dir.clone()];
        while let Some(dir) = dirs_to_visit.pop() {
            let entries = fs::read_dir(&dir).map_err(|e| {
                cleanup_staging(&staging_dir);
                format!("STAGING_READDIR_FAILED '{}': {}", dir.display(), e)
            })?;
            for entry in entries {
                let entry = entry.map_err(|e| {
                    cleanup_staging(&staging_dir);
                    format!("STAGING_ENTRY_FAILED: {}", e)
                })?;
                let p = entry.path();
                if p.is_dir() {
                    dirs_to_visit.push(p);
                } else if p.is_file() {
                    let ext = ext_of_path(&p);
                    if extension_allowed(&ext, &valid_exts) {
                        valid_candidates.push(p);
                    }
                }
            }
        }

        if valid_candidates.is_empty() {
            cleanup_staging(&staging_dir);
            return Err("NO_VALID_ROM_IN_ARCHIVE".to_string());
        }

        let cue_candidates: Vec<_> = valid_candidates
            .iter()
            .filter(|p| ext_of_path(p).eq_ignore_ascii_case("cue"))
            .cloned()
            .collect();

        if cue_candidates.len() == 1 {
            let cue_path = &cue_candidates[0];
            let refs = parse_cue_referenced_files(cue_path).map_err(|e| {
                cleanup_staging(&staging_dir);
                e
            })?;
            if !refs.is_empty() {
                let mut missing = Vec::new();
                let mut referenced_full_paths = Vec::new();
                for ref_name in &refs {
                    if is_cue_file_ref_escaped(ref_name) {
                        cleanup_staging(&staging_dir);
                        return Err(format!("CUE_FILE_REF_ESCAPE_BLOCKED: '{}'", ref_name));
                    }
                    let cue_dir = cue_path.parent().unwrap_or(&staging_dir);
                    let candidate_in_cue_dir = cue_dir.join(ref_name);
                    let candidate_in_staging_root = staging_dir.join(ref_name);

                    let mut found_path: Option<PathBuf> = None;

                    if !is_path_traversal_entry(ref_name) {
                        if candidate_in_cue_dir.exists() && candidate_in_cue_dir.is_file() {
                            if candidate_in_cue_dir.starts_with(&staging_dir) {
                                if let Ok(canonical) = candidate_in_cue_dir.canonicalize() {
                                    if let Ok(staging_canon) = staging_dir.canonicalize() {
                                        if !canonical.starts_with(&staging_canon) {
                                            cleanup_staging(&staging_dir);
                                            return Err(format!(
                                                "CUE_FILE_REF_ESCAPE_BLOCKED: '{}' escapes staging",
                                                ref_name
                                            ));
                                        }
                                    }
                                }
                                found_path = Some(candidate_in_cue_dir);
                            }
                        } else if candidate_in_staging_root.exists()
                            && candidate_in_staging_root.is_file()
                        {
                            if candidate_in_staging_root.starts_with(&staging_dir) {
                                found_path = Some(candidate_in_staging_root);
                            }
                        } else {
                            for cand in &valid_candidates {
                                if cand.ends_with(ref_name) || cand.ends_with(Path::new(ref_name)) {
                                    if cand.starts_with(&staging_dir) && cand.is_file() {
                                        found_path = Some(cand.clone());
                                        break;
                                    }
                                }
                            }
                            if found_path.is_none() {
                                let base = PathBuf::from(ref_name)
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                for cand in &valid_candidates {
                                    if let Some(fname) = cand.file_name().and_then(|n| n.to_str()) {
                                        if fname.eq_ignore_ascii_case(&base)
                                            || cand.ends_with(&base)
                                        {
                                            if cand.starts_with(&staging_dir) {
                                                found_path = Some(cand.clone());
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if let Some(fp) = found_path {
                        referenced_full_paths.push(fp);
                    } else {
                        missing.push(ref_name.clone());
                    }
                }
                if !missing.is_empty() {
                    cleanup_staging(&staging_dir);
                    return Err(format!("INCOMPLETE_CUE_SET: missing {:?}", missing));
                }
                let mut expected_set = HashSet::new();
                expected_set.insert(cue_path.clone());
                for rp in &referenced_full_paths {
                    expected_set.insert(rp.clone());
                }
                let extra: Vec<_> = valid_candidates
                    .iter()
                    .filter(|p| !expected_set.contains(*p))
                    .cloned()
                    .collect();
                if !extra.is_empty() {
                    cleanup_staging(&staging_dir);
                    let extra_names: Vec<String> =
                        extra.iter().map(|p| p.display().to_string()).collect();
                    return Err(format!(
                        "AMBIGUOUS_MULTIPLE_ROMS: extra files {:?}",
                        extra_names
                    ));
                }
                files_to_install = expected_set.into_iter().collect();
                detected_files = files_to_install
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect();
            } else {
                if valid_candidates.len() > 1 {
                    cleanup_staging(&staging_dir);
                    return Err("AMBIGUOUS_MULTIPLE_ROMS".to_string());
                }
                files_to_install = valid_candidates.clone();
                detected_files = files_to_install
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect();
            }
        } else if cue_candidates.len() > 1 {
            cleanup_staging(&staging_dir);
            return Err("AMBIGUOUS_MULTIPLE_CUE".to_string());
        } else {
            if valid_candidates.len() > 1 {
                cleanup_staging(&staging_dir);
                return Err("AMBIGUOUS_MULTIPLE_ROMS".to_string());
            }
            files_to_install = valid_candidates.clone();
            detected_files = files_to_install
                .iter()
                .map(|p| p.display().to_string())
                .collect();
        }

        if files_to_install.len() > MAX_FILES_TO_INSTALL {
            cleanup_staging(&staging_dir);
            return Err(format!(
                "TOO_MANY_FILES_TO_INSTALL: {}",
                files_to_install.len()
            ));
        }
    } else if src_ext.eq_ignore_ascii_case("7z") {
        cleanup_staging(&staging_dir);
        return Err("UNSUPPORTED_ARCHIVE_7Z_DEFERRED_TO_V86B".to_string());
    } else {
        cleanup_staging(&staging_dir);
        return Err(format!(
            "INVALID_EXTENSION: .{} not in validExtensions {:?}",
            src_ext, valid_exts
        ));
    }

    if files_to_install.is_empty() {
        cleanup_staging(&staging_dir);
        return Err("NO_FILES_DETECTED".to_string());
    }

    // --- V8.6A.2 intelligent destination mapping ---
    let descriptor_opt = files_to_install
        .iter()
        .find(|p| ext_of_path(p).eq_ignore_ascii_case("cue"))
        .cloned();

    let game_root_opt: Option<PathBuf> = if let Some(ref cue_path) = descriptor_opt {
        cue_path.parent().map(|p| p.to_path_buf())
    } else {
        None
    };

    // Build dest mappings
    let mut dest_paths_to_copy: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut collision_paths: Vec<String> = Vec::new();

    for src_staged in &files_to_install {
        let rel: PathBuf = if files_to_install.len() == 1 {
            if let Some(fname) = src_staged.file_name() {
                PathBuf::from(fname)
            } else {
                cleanup_staging(&staging_dir);
                return Err("INVALID_STAGED_FILENAME".to_string());
            }
        } else if let Some(ref game_root) = game_root_opt {
            match src_staged.strip_prefix(game_root) {
                Ok(p) => {
                    if p.as_os_str().is_empty() {
                        if let Some(fname) = src_staged.file_name() {
                            PathBuf::from(fname)
                        } else {
                            cleanup_staging(&staging_dir);
                            return Err("INVALID_STAGED_FILENAME".to_string());
                        }
                    } else {
                        p.to_path_buf()
                    }
                }
                Err(_) => {
                    if let Ok(_staging_rel) = src_staged.strip_prefix(&staging_dir) {
                        if let Some(fname) = src_staged.file_name() {
                            PathBuf::from(fname)
                        } else {
                            cleanup_staging(&staging_dir);
                            return Err("INVALID_STAGED_FILENAME".to_string());
                        }
                    } else if let Some(fname) = src_staged.file_name() {
                        PathBuf::from(fname)
                    } else {
                        cleanup_staging(&staging_dir);
                        return Err("INVALID_STAGED_FILENAME".to_string());
                    }
                }
            }
        } else {
            match src_staged.strip_prefix(&staging_dir) {
                Ok(p) => p.to_path_buf(),
                Err(_) => {
                    if let Some(fname) = src_staged.file_name() {
                        PathBuf::from(fname)
                    } else {
                        cleanup_staging(&staging_dir);
                        return Err("INVALID_STAGED_FILENAME".to_string());
                    }
                }
            }
        };

        // Validate rel does not contain traversal/absolute
        // Validate rel does not contain traversal/absolute
        for comp in rel.components() {
            if let Component::ParentDir = comp {
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "DESTINATION_ESCAPE_BLOCKED: relative path {:?}",
                    rel
                ));
            }
            if let Component::RootDir = comp {
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "DESTINATION_ESCAPE_BLOCKED: relative path {:?}",
                    rel
                ));
            }
            if let Component::Prefix(_) = comp {
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "DESTINATION_ESCAPE_BLOCKED: relative path {:?}",
                    rel
                ));
            }
        }

        let dest_path = rom_dir.join(&rel);
        if !dest_path.starts_with(&rom_dir) {
            cleanup_staging(&staging_dir);
            return Err(format!(
                "DESTINATION_ESCAPE_BLOCKED: {}",
                dest_path.display()
            ));
        }
        dest_paths_to_copy.push((src_staged.clone(), dest_path.clone()));
        if dest_path.exists() {
            collision_paths.push(dest_path.display().to_string());
        }
    }

    // Collision semantics with content identity
    if !collision_paths.is_empty() {
        let mut has_nonidentical = false;
        let mut identical_count = 0usize;
        for (src, dest) in &dest_paths_to_copy {
            if dest.exists() {
                if files_are_identical(src, dest) {
                    identical_count += 1;
                } else {
                    has_nonidentical = true;
                }
            }
        }
        if has_nonidentical {
            let res = ImportResult {
                status: "COLLISION".to_string(),
                systemId: system_id.clone(),
                installedPaths: vec![],
                detectedFiles: detected_files.clone(),
                destinationDirectory: rom_dir.display().to_string(),
                collisionPaths: collision_paths.clone(),
                errorCode: Some("COLLISION".to_string()),
                message: Some("Destination already exists – not overwriting".to_string()),
            };
            cleanup_staging(&staging_dir);
            return Ok(res);
        } else if identical_count == dest_paths_to_copy.len() {
            let already = ImportResult {
                status: "ALREADY_INSTALLED".to_string(),
                systemId: system_id.clone(),
                installedPaths: vec![],
                detectedFiles: detected_files.clone(),
                destinationDirectory: rom_dir.display().to_string(),
                collisionPaths: collision_paths.clone(),
                errorCode: Some("ALREADY_INSTALLED".to_string()),
                message: Some(format!("File already exists in {}", rom_dir.display())),
            };
            cleanup_staging(&staging_dir);
            return Ok(already);
        } else {
            // Partial identical – conservative COLLISION
            let res = ImportResult {
                status: "COLLISION".to_string(),
                systemId: system_id.clone(),
                installedPaths: vec![],
                detectedFiles: detected_files.clone(),
                destinationDirectory: rom_dir.display().to_string(),
                collisionPaths: collision_paths.clone(),
                errorCode: Some("COLLISION".to_string()),
                message: Some("Partial collision – not overwriting".to_string()),
            };
            cleanup_staging(&staging_dir);
            return Ok(res);
        }
    }

    // Atomic install with CREATE_NEW semantics + rollback
    let mut installed_paths: Vec<String> = Vec::new();
    let mut created_this_session: Vec<PathBuf> = Vec::new();

    for (src_staged, dest) in &dest_paths_to_copy {
        if let Some(parent) = dest.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                for created in &created_this_session {
                    let _ = fs::remove_file(created);
                }
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "INSTALL_MKDIR_FAILED '{}': {}",
                    parent.display(),
                    e
                ));
            }
        }
        // True no-overwrite final write
        let src_file = match fs::File::open(src_staged) {
            Ok(f) => f,
            Err(e) => {
                for created in &created_this_session {
                    let _ = fs::remove_file(created);
                }
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "INSTALL_SRC_OPEN_FAILED '{}': {}",
                    src_staged.display(),
                    e
                ));
            }
        };

        let dest_file_result = OpenOptions::new().write(true).create_new(true).open(dest);
        match dest_file_result {
            Ok(mut df) => {
                let mut src_r = io::BufReader::new(src_file);
                if let Err(e) = io::copy(&mut src_r, &mut df) {
                    for created in &created_this_session {
                        let _ = fs::remove_file(created);
                    }
                    let _ = fs::remove_file(dest);
                    cleanup_staging(&staging_dir);
                    return Err(format!(
                        "INSTALL_COPY_FAILED '{}' -> '{}': {}",
                        src_staged.display(),
                        dest.display(),
                        e
                    ));
                }
                created_this_session.push(dest.clone());
                installed_paths.push(dest.display().to_string());
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                // TOCTOU collision at final write time
                let is_identical = files_are_identical(src_staged, dest);
                for created in &created_this_session {
                    let _ = fs::remove_file(created);
                }
                cleanup_staging(&staging_dir);
                if is_identical && dest_paths_to_copy.len() == 1 {
                    return Ok(ImportResult {
                        status: "ALREADY_INSTALLED".to_string(),
                        systemId: system_id.clone(),
                        installedPaths: vec![],
                        detectedFiles: detected_files.clone(),
                        destinationDirectory: rom_dir.display().to_string(),
                        collisionPaths: vec![dest.display().to_string()],
                        errorCode: Some("ALREADY_INSTALLED".to_string()),
                        message: Some("File already exists with identical content".to_string()),
                    });
                } else {
                    return Ok(ImportResult {
                        status: "COLLISION".to_string(),
                        systemId: system_id.clone(),
                        installedPaths: vec![],
                        detectedFiles: detected_files.clone(),
                        destinationDirectory: rom_dir.display().to_string(),
                        collisionPaths: vec![dest.display().to_string()],
                        errorCode: Some("COLLISION".to_string()),
                        message: Some(
                            "TOCTOU collision – destination appeared after preflight".to_string(),
                        ),
                    });
                }
            }
            Err(e) => {
                for created in &created_this_session {
                    let _ = fs::remove_file(created);
                }
                cleanup_staging(&staging_dir);
                return Err(format!(
                    "INSTALL_CREATE_NEW_FAILED '{}': {}",
                    dest.display(),
                    e
                ));
            }
        }
    }

    cleanup_staging(&staging_dir);

    log_event(
        "info",
        &format!(
            "import_game_source success system='{}' src='{}' installed={:?} dest='{}' safe_mode={}",
            system_id,
            src_path.display(),
            installed_paths,
            rom_dir.display(),
            is_safe_mode()
        ),
    );

    Ok(ImportResult {
        status: "INSTALLED".to_string(),
        systemId: system_id,
        installedPaths: installed_paths.clone(),
        detectedFiles: detected_files,
        destinationDirectory: rom_dir.display().to_string(),
        collisionPaths: vec![],
        errorCode: None,
        message: Some(format!(
            "Installed {} file(s) to {}",
            installed_paths.len(),
            rom_dir.display()
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use std::fs;
    use tempfile::TempDir;

    fn create_mock_config(rom_dir: &Path, extensions: Vec<&str>) -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 1,
            "machineNameWindows": "TestRig",
            "systems": [{
                "id": "ps2",
                "romDirectory": rom_dir.to_string_lossy(),
                "validExtensions": extensions,
                "displayName": "PlayStation 2"
            }]
        })
    }

    fn with_env_config<F, R>(config: &serde_json::Value, install_dir: &Path, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _env_guard = acquire_shared_test_env_lock();
        let temp_config_dir = TempDir::new().unwrap();
        let config_path = temp_config_dir.path().join("crystal-machine-config.json");
        fs::write(&config_path, serde_json::to_string_pretty(config).unwrap()).unwrap();
        let orig = std::env::var("CRYSTAL_MACHINE_CONFIG").ok();
        std::env::set_var("CRYSTAL_MACHINE_CONFIG", &config_path);
        let orig_backend = std::env::var("CRYSTAL_BACKEND_ROOT").ok();
        std::env::set_var("CRYSTAL_BACKEND_ROOT", install_dir);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
        match orig {
            Some(v) => std::env::set_var("CRYSTAL_MACHINE_CONFIG", v),
            None => std::env::remove_var("CRYSTAL_MACHINE_CONFIG"),
        };
        match orig_backend {
            Some(v) => std::env::set_var("CRYSTAL_BACKEND_ROOT", v),
            None => std::env::remove_var("CRYSTAL_BACKEND_ROOT"),
        };
        result.unwrap_or_else(|_| panic!("test panicked under with_env_config"))
    }

    #[test]
    fn import_rejects_non_existent_source() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso", "cue", "bin"]);
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: td
                    .path()
                    .join("does_not_exist.iso")
                    .to_string_lossy()
                    .to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("SOURCE_NOT_FOUND"));
    }

    #[test]
    fn import_rejects_unknown_system() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src_file = td.path().join("game.iso");
        fs::write(&src_file, b"fake iso").unwrap();
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "unknown_system".into(),
                sourcePath: src_file.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        // original 0d5bf54 returns Err containing UNKNOWN_SYSTEM
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("UNKNOWN_SYSTEM"));
    }

    #[test]
    fn successful_import_copies_file() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src_file = td.path().join("game.iso");
        fs::write(&src_file, b"iso content 123").unwrap();
        let result = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_file.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(result.status, "INSTALLED");
        assert_eq!(result.systemId, "ps2");
        assert!(rom_dir.join("game.iso").exists());
        assert_eq!(
            fs::read(rom_dir.join("game.iso")).unwrap(),
            b"iso content 123"
        );
    }

    #[test]
    fn test_safe_mode_env() {
        use crate::safety::set_safe_mode_for_tests;
        let _lock = acquire_shared_test_env_lock();
        set_safe_mode_for_tests(true);
        assert!(crate::safety::is_safe_mode());
        set_safe_mode_for_tests(false);
        assert!(!crate::safety::is_safe_mode());
    }

    #[test]
    fn test_safe_mode_env_enable_via_set() {
        use crate::safety::set_safe_mode_for_tests;
        let _lock = acquire_shared_test_env_lock();
        set_safe_mode_for_tests(true);
        assert!(crate::safety::is_safe_mode());
        set_safe_mode_for_tests(false);
    }

    #[test]
    fn collision_detection() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src1 = td.path().join("game.iso");
        fs::write(&src1, b"content A").unwrap();
        let src2_dir = td.path().join("other");
        fs::create_dir_all(&src2_dir).unwrap();
        let src2_dup = src2_dir.join("game.iso");
        fs::write(&src2_dup, b"content B different").unwrap();
        let first = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src1.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(first.status, "INSTALLED");
        let second = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src2_dup.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(second.status, "COLLISION");
    }

    #[test]
    fn already_installed_when_identical() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src1 = td.path().join("game.iso");
        fs::write(&src1, b"same content").unwrap();
        let req_path = src1.to_string_lossy().to_string();
        let first = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: req_path.clone(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(first.status, "INSTALLED");
        let src2_other = td.path().join("other").join("game.iso");
        fs::create_dir_all(src2_other.parent().unwrap()).unwrap();
        fs::write(&src2_other, b"same content").unwrap();
        let second = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src2_other.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(second.status, "ALREADY_INSTALLED");
    }

    #[test]
    fn zip_import_rejects_windows_drive_escape() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src_zip = td.path().join("evil.zip");
        {
            let file = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file(r"C:\Windows\evil.iso", options).unwrap();
            zip.write_all(b"evil").unwrap();
            zip.finish().unwrap();
        }
        let req = ImportRequest {
            systemId: "ps2".into(),
            sourcePath: src_zip.to_string_lossy().to_string(),
            expectedTitle: None,
        };
        let result = with_env_config(&cfg, &staging_cache, || import_game_source(req));
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("ZIP_TRAVERSAL_BLOCKED")
                || err.contains("TRAVERSAL")
                || err.contains("CUE_FILE_REF_ESCAPE_BLOCKED")
                || err.contains("DRIVE"),
            "err was: {}",
            err
        );
    }

    #[test]
    fn cue_import_success() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("game.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("game.cue", options).unwrap();
            zip.write_all(
                b"FILE \"game.bin\" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n",
            )
            .unwrap();
            zip.start_file("game.bin", options).unwrap();
            zip.write_all(b"fake bin content").unwrap();
            zip.finish().unwrap();
        }
        let result = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(result.status, "INSTALLED");
        assert!(rom_dir.join("game.cue").exists());
        assert!(rom_dir.join("game.bin").exists());
    }

    #[test]
    fn cue_import_rejects_escape() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("malicious.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                br#"FILE "../outside.bin" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("CUE_FILE_REF_ESCAPE_BLOCKED"));
    }

    #[test]
    fn cue_escape_windows_backslash_blocked() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("malicious.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                br#"FILE "..\outside.bin" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("CUE_FILE_REF_ESCAPE_BLOCKED"));
    }

    #[test]
    fn cue_absolute_path_blocked() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("malicious.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                br#"FILE "C:\outside.bin" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("CUE_FILE_REF_ESCAPE_BLOCKED"));
    }

    #[test]
    fn cue_unc_path_blocked() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("malicious.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                br#"FILE "\\server\share\game.bin" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("CUE_FILE_REF_ESCAPE_BLOCKED"));
    }

    #[test]
    fn cue_missing_bin_fails() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("missing_bin.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                b"FILE \"missing.bin\" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
",
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("INCOMPLETE_CUE_SET"));
    }

    #[test]
    fn invalid_extension_rejected() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso", "cue"]);
        let src = td.path().join("readme.txt");
        fs::write(&src, b"nonsense").unwrap();
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("INVALID_EXTENSION"));
    }

    #[test]
    fn single_rom_wrapper_folder_flattened_to_rom_root() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms_ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src_zip = td.path().join("wrapper.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Wrapper/Game.iso", o).unwrap();
            zip.write_all(b"wrapper iso content").unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(res.status, "INSTALLED", "should install wrapper iso");
        assert!(
            rom_dir.join("Game.iso").exists(),
            "Game.iso must exist at rom root, not Wrapper/Game.iso"
        );
        assert!(
            !rom_dir.join("Wrapper").join("Game.iso").exists(),
            "Wrapper folder must be flattened"
        );
        assert!(
            res.installedPaths
                .iter()
                .any(|p| p.ends_with("Game.iso") && !p.contains("Wrapper")),
            "installedPaths must be flattened"
        );
    }

    #[test]
    fn nested_cue_primary_descriptor_visible_at_rom_root() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms_psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("nested_cue.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(b"FILE \"tracks/track01.bin\" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n").unwrap();
            zip.start_file("Game/tracks/track01.bin", o).unwrap();
            zip.write_all(b"track data").unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(res.status, "INSTALLED", "nested cue should install");
        assert!(
            rom_dir.join("game.cue").exists(),
            "game.cue must be at rom root"
        );
        assert!(
            !rom_dir.join("Game").join("game.cue").exists(),
            "Game/game.cue wrapper must be stripped, primary at root"
        );
        assert!(
            rom_dir.join("tracks").join("track01.bin").exists(),
            "tracks/track01.bin must exist under rom root"
        );
        assert!(
            res.installedPaths.iter().any(|p| p.ends_with("game.cue")),
            "installed includes cue"
        );
        assert!(
            res.installedPaths.iter().any(|p| p.contains("tracks")),
            "installed includes tracks subpath"
        );
    }

    #[test]
    fn cue_relative_track_path_preserved() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms_cue_rel");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("cue_rel.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(b"FILE \"tracks/track01.bin\" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n").unwrap();
            zip.start_file("Game/tracks/track01.bin", o).unwrap();
            zip.write_all(b"bin data xyz").unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(res.status, "INSTALLED");
        let cue_content = fs::read_to_string(rom_dir.join("game.cue")).unwrap();
        assert!(
            cue_content.contains("tracks/track01.bin")
                || cue_content.contains("tracks\\track01.bin"),
            "CUE content must still reference tracks/track01.bin, got: {}",
            cue_content
        );
        assert!(
            rom_dir.join("tracks").join("track01.bin").exists(),
            "relative track path must be preserved under rom root"
        );
    }

    #[test]
    fn safe_mode_blocks_import() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src = td.path().join("game.iso");
        fs::write(&src, b"data").unwrap();
        let res = with_env_config(&cfg, &staging_cache, || {
            // set safe mode inside env-lock protected scope to avoid nested lock deadlock
            {
                use crate::safety::set_safe_mode_for_tests;
                set_safe_mode_for_tests(true);
            }
            let r = {
                let req = ImportRequest {
                    systemId: "ps2".into(),
                    sourcePath: src.to_string_lossy().to_string(),
                    expectedTitle: None,
                };
                import_game_source(req)
            };
            {
                use crate::safety::set_safe_mode_for_tests;
                set_safe_mode_for_tests(false);
            }
            r
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("SAFE_MODE_BLOCKED_IMPORT"));
    }

    #[test]
    fn nested_cue_structure_preserved() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("nested.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(b"FILE \"tracks/track01.bin\" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n").unwrap();
            zip.start_file("Game/tracks/track01.bin", o).unwrap();
            zip.write_all(b"bin data").unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(res.status, "INSTALLED");
        assert!(
            rom_dir.join("game.cue").exists(),
            "primary descriptor visible at root"
        );
        assert!(
            !rom_dir.join("Game").join("game.cue").exists(),
            "wrapper must be stripped"
        );
        assert!(rom_dir.join("tracks").join("track01.bin").exists());
    }

    #[test]
    fn staging_stays_under_crystal_writable_root() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache_root = td.path().join("staging_root");
        fs::create_dir_all(&staging_cache_root).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src = td.path().join("game.iso");
        fs::write(&src, b"data xyz").unwrap();
        let res = with_env_config(&cfg, &staging_cache_root, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        assert_eq!(res.status, "INSTALLED");
        assert!(rom_dir.join("game.iso").exists());
        let installed = rom_dir.join("game.iso");
        assert!(
            installed.starts_with(&rom_dir),
            "installed path must be under romDirectory"
        );
        assert!(
            !installed.to_string_lossy().contains("cache"),
            "installed path must not be a cache temp path"
        );
    }

    #[test]
    fn successful_staging_cleanup() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_root = td.path().join("staging");
        fs::create_dir_all(&staging_root).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["iso"]);
        let src = td.path().join("game.iso");
        fs::write(&src, b"clean me").unwrap();
        let imports_dir = staging_root.join("imports");
        fs::create_dir_all(&imports_dir).unwrap();
        let before_count = fs::read_dir(&imports_dir).map(|it| it.count()).unwrap_or(0);
        let _res = with_env_config(&cfg, &staging_root, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req).unwrap()
        });
        let after_count = fs::read_dir(&imports_dir).map(|it| it.count()).unwrap_or(0);
        assert_eq!(
            after_count,
            before_count,
            "staging cleanup must remove session dir; before={}, after={}, leftover={}",
            before_count,
            after_count,
            after_count as isize - before_count as isize
        );
    }

    #[test]
    fn device_access_blocked() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let staging_cache = td.path().join("staging");
        fs::create_dir_all(&staging_cache).unwrap();
        let cfg = create_mock_config(&rom_dir, vec!["cue", "bin"]);
        let src_zip = td.path().join("malicious.zip");
        {
            let f = fs::File::create(&src_zip).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            let o = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Game/game.cue", o).unwrap();
            zip.write_all(
                br#"FILE "\\.\PhysicalDrive0" BINARY
  TRACK 01 MODE1/2352
    INDEX 01 00:00:00
"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let res = with_env_config(&cfg, &staging_cache, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.to_string_lossy().to_string(),
                expectedTitle: None,
            };
            import_game_source(req)
        });
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("CUE_FILE_REF_ESCAPE_BLOCKED"));
    }
}
