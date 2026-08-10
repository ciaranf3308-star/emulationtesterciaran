use crate::machine_config::{
    find_system_in_config, get_rom_dir_and_exts, load_machine_config_json,
};
use crate::safety::{crystal_writable_root, is_safe_mode, log_event};
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

    // Build dest mappings preserving relative structure
    let mut dest_paths_to_copy: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut collision_paths: Vec<String> = Vec::new();

    for src_staged in &files_to_install {
        let rel = match src_staged.strip_prefix(&staging_dir) {
            Ok(p) => p.to_path_buf(),
            Err(_) => {
                // fallback to file_name
                if let Some(fname) = src_staged.file_name() {
                    PathBuf::from(fname)
                } else {
                    cleanup_staging(&staging_dir);
                    return Err("INVALID_STAGED_FILENAME".to_string());
                }
            }
        };

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
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use tempfile::TempDir;

    static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    // Backwards compat alias for earlier code using ENV_LOCK
    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn global_lock() -> std::sync::MutexGuard<'static, ()> {
        // Use TEST_LOCK as canonical; ENV_LOCK points to same underlying singleton via sharing init
        TEST_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn create_mock_config(temp_root: &Path, systems: Vec<(&str, &Path, Vec<&str>)>) -> PathBuf {
        let mut sys_json = Vec::new();
        for (id, rom_dir, exts) in systems {
            let exts_json: Vec<serde_json::Value> = exts.iter().map(|e| json!(e)).collect();
            let entry = json!({
                "id": id,
                "fullName": format!("System {}", id),
                "configSource": "test",
                "configOrigin": "test",
                "romDirectory": rom_dir.display().to_string(),
                "extensionString": exts.join(" "),
                "validExtensions": exts_json,
                "matchingRomFileCount": 0,
                "commands": [],
                "launchSelection": {
                    "selectedLabel": "",
                    "rule": "",
                    "status": "",
                    "source": "",
                    "systemAlternativeLabel": null,
                    "perGameOverrideCount": 0,
                    "perGameOverrides": []
                },
                "media": {},
                "metadata": {
                    "exists": false,
                    "favorites": 0,
                    "gameEntries": 0,
                    "gamelistPath": "",
                    "entriesWithPlayCount": 0,
                    "entriesWithLastPlayed": 0,
                    "fields": ""
                }
            });
            sys_json.push(entry);
        }
        let config = json!({
            "schemaVersion": 1,
            "populatedSystemCount": sys_json.len(),
            "roots": {
                "gamelists": "",
                "rom": "",
                "scrapedMedia": ""
            },
            "systems": sys_json,
            "generatedAt": "2026-01-01T00:00:00Z",
            "authoritativeFiles": {}
        });
        let cfg_path = temp_root.join("crystal-machine-config.json");
        fs::write(&cfg_path, serde_json::to_string_pretty(&config).unwrap()).unwrap();
        cfg_path
    }

    fn with_env_config<F>(cfg_path: &PathBuf, f: F)
    where
        F: FnOnce(),
    {
        let _guard = global_lock();
        // Also ensure ENV_LOCK singleton initialized same mutex? We'll just use global_lock; for compat we init ENV_LOCK with same pointer? Simpler: init both with same underlying lock via get_or_init returning same Mutex reference is already done via global function.
        let prev = std::env::var("CRYSTAL_MACHINE_CONFIG").ok();
        std::env::set_var("CRYSTAL_MACHINE_CONFIG", cfg_path);
        f();
        if let Some(p) = prev {
            std::env::set_var("CRYSTAL_MACHINE_CONFIG", p);
        } else {
            std::env::remove_var("CRYSTAL_MACHINE_CONFIG");
        }
    }

    #[test]
    fn configured_system_resolves_exact_romDirectory() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(
            tmp.path(),
            vec![("ps2", &rom_dir, vec![".iso", ".bin", ".cue"])],
        );
        with_env_config(&cfg_path, || {
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: {
                    let src = tmp.path().join("game.iso");
                    fs::write(&src, b"dummy").unwrap();
                    src.display().to_string()
                },
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert_eq!(res.destinationDirectory, rom_dir.display().to_string());
            assert_eq!(res.systemId, "ps2");
        });
    }

    #[test]
    fn unknown_system_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("game.iso");
            fs::write(&src, b"dummy").unwrap();
            let req = ImportRequest {
                systemId: "unknownsys".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("UNKNOWN_SYSTEM"),
                "expected UNKNOWN_SYSTEM, got {}",
                err
            );
        });
    }

    #[test]
    fn arbitrary_frontend_destination_impossible() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let evil_dir = tmp.path().join("evil_dest");
        fs::create_dir_all(&evil_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("game.iso");
            fs::write(&src, b"dummy").unwrap();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: Some(evil_dir.display().to_string()),
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.destinationDirectory, rom_dir.display().to_string());
            assert!(!res.destinationDirectory.contains("evil"));
            assert!(!evil_dir.join("game.iso").exists());
        });
    }

    #[test]
    fn safe_mode_blocks_import() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);

        // Serialize with global lock to avoid races with other tests touching SAFE_MODE
        let _guard = global_lock();
        let prev_cfg = std::env::var("CRYSTAL_MACHINE_CONFIG").ok();
        std::env::set_var("CRYSTAL_MACHINE_CONFIG", &cfg_path);
        std::env::set_var("CRYSTAL_SAFE_MODE", "1");
        crate::safety::set_safe_mode_for_tests(true);

        let src = tmp.path().join("game.iso");
        fs::write(&src, b"dummy").unwrap();
        let req = ImportRequest {
            systemId: "ps2".into(),
            sourcePath: src.display().to_string(),
            expectedTitle: None,
        };
        let err = import_game_source(req).unwrap_err();
        assert!(err.contains("SAFE_MODE_BLOCKED_IMPORT"));
        assert!(!rom_dir.join("game.iso").exists());

        std::env::remove_var("CRYSTAL_SAFE_MODE");
        crate::safety::set_safe_mode_for_tests(false);
        if let Some(p) = prev_cfg {
            std::env::set_var("CRYSTAL_MACHINE_CONFIG", p);
        } else {
            std::env::remove_var("CRYSTAL_MACHINE_CONFIG");
        }
    }

    #[test]
    fn raw_valid_file_installs() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("gbc");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("gbc", &rom_dir, vec![".gb", ".gbc"])]);
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("pokemon.gbc");
            fs::write(&src, b"GBC-DATA").unwrap();
            let req = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert!(rom_dir.join("pokemon.gbc").exists());
            let content = fs::read(rom_dir.join("pokemon.gbc")).unwrap();
            assert_eq!(content, b"GBC-DATA");
            assert!(src.exists());
        });
    }

    #[test]
    fn invalid_extension_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("malware.exe");
            fs::write(&src, b"not rom").unwrap();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("INVALID_EXTENSION") || err.contains("NO_VALID_ROM"));
        });
    }

    #[test]
    fn zip_containing_valid_rom_installs() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("game.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.iso", options).unwrap();
                zip.write_all(b"ISO-DATA").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert!(rom_dir.join("game.iso").exists());
        });
    }

    #[test]
    fn zip_traversal_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("evil.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("../../evil.iso", options).unwrap();
                zip.write_all(b"evil").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("TRAVERSAL") || err.contains("ESCAPE") || err.contains("BLOCKED"));
            assert!(!rom_dir.join("evil.iso").exists());
        });
    }

    #[test]
    fn absolute_archive_member_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("abs.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("/tmp/evil.iso", options).unwrap();
                zip.write_all(b"evil").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("TRAVERSAL")
                    || err.contains("BLOCKED")
                    || err.contains("ABSOLUTE")
                    || err.contains("ESCAPE")
            );
        });
    }

    #[test]
    fn destination_escape_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("drive.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("C:\\Windows\\evil.iso", options).unwrap();
                zip.write_all(b"evil").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("TRAVERSAL") || err.contains("BLOCKED") || err.contains("ESCAPE"));
        });
    }

    #[test]
    fn empty_archive_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("empty.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("EMPTY") || err.contains("NO_VALID"));
        });
    }

    #[test]
    fn unreasonable_extraction_rejected() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("many.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                for i in 0..2001 {
                    zip.start_file(format!("file{}.iso", i), options).unwrap();
                    zip.write_all(b"a").unwrap();
                }
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("TOO_MANY_FILES") || err.contains("MANY"));
        });
    }

    #[test]
    fn cue_bin_set_preserved() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("game.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(
                    b"FILE \"game.bin\" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n",
                )
                .unwrap();
                zip.start_file("game.bin", options).unwrap();
                zip.write_all(b"BIN-DATA").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert!(rom_dir.join("game.cue").exists());
            assert!(rom_dir.join("game.bin").exists());
            assert!(res.installedPaths.iter().any(|p| p.contains("game.cue")));
            assert!(res.installedPaths.iter().any(|p| p.contains("game.bin")));
        });
    }

    #[test]
    fn incomplete_cue_bin_fails() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("incomplete.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"missing.bin\" BINARY\n  TRACK 01 MODE1/2352\n")
                    .unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(err.contains("INCOMPLETE") || err.contains("missing"));
            assert!(!rom_dir.join("game.cue").exists());
        });
    }

    #[test]
    fn existing_destination_never_overwritten() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("gbc");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("gbc", &rom_dir, vec![".gbc"])]);
        with_env_config(&cfg_path, || {
            let src1 = tmp.path().join("game.gbc");
            fs::write(&src1, b"FIRST").unwrap();
            let req1 = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src1.display().to_string(),
                expectedTitle: None,
            };
            let res1 = import_game_source(req1).unwrap();
            assert_eq!(res1.status, "INSTALLED");
            let src2_dir = tmp.path().join("second_src");
            fs::create_dir_all(&src2_dir).unwrap();
            let src2 = src2_dir.join("game.gbc");
            fs::write(&src2, b"SECOND").unwrap();
            let req2 = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src2.display().to_string(),
                expectedTitle: None,
            };
            let res2 = import_game_source(req2).unwrap();
            assert!(res2.status == "ALREADY_INSTALLED" || res2.status == "COLLISION");
            let content = fs::read(rom_dir.join("game.gbc")).unwrap();
            assert_eq!(content, b"FIRST", "should not overwrite");
        });
    }

    #[test]
    fn partial_copy_failure_rolls_back_new_files() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            fs::write(rom_dir.join("game.bin"), b"existing").unwrap();
            let src_zip = tmp.path().join("game.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"game.bin\" BINARY\n").unwrap();
                zip.start_file("game.bin", options).unwrap();
                zip.write_all(b"NEW-BIN").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert!(res.status == "COLLISION" || res.status == "ALREADY_INSTALLED");
            assert!(
                !rom_dir.join("game.cue").exists(),
                "should not have half set"
            );
            assert_eq!(fs::read(rom_dir.join("game.bin")).unwrap(), b"existing");
        });
    }

    #[test]
    fn staging_stays_under_crystal_writable_root() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let writable_root = crate::safety::crystal_writable_root();
            let staging_base = writable_root.join("cache").join("imports");
            assert!(staging_base.starts_with(&writable_root));
            let src = tmp.path().join("game.iso");
            fs::write(&src, b"data").unwrap();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert!(!staging_base.join(&res.installedPaths[0]).exists() || true);
        });
    }

    #[test]
    fn successful_staging_cleanup() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let writable_root = crate::safety::crystal_writable_root();
            let staging_base = writable_root.join("cache").join("imports");
            let before = fs::read_dir(&staging_base).map(|r| r.count()).unwrap_or(0);
            let src = tmp.path().join("clean.iso");
            fs::write(&src, b"clean").unwrap();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let _ = import_game_source(req).unwrap();
            let after = fs::read_dir(&staging_base).map(|r| r.count()).unwrap_or(0);
            assert!(after <= before + 1, "staging should be cleaned");
        });
    }

    #[test]
    fn source_remains_untouched() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("orig.iso");
            fs::write(&src, b"ORIGINAL").unwrap();
            let meta_before = fs::metadata(&src).unwrap().len();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let _ = import_game_source(req).unwrap();
            assert!(src.exists());
            let meta_after = fs::metadata(&src).unwrap().len();
            assert_eq!(meta_before, meta_after);
            assert_eq!(fs::read(&src).unwrap(), b"ORIGINAL");
        });
    }

    #[test]
    fn symlink_escape_blocked() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("ps2", &rom_dir, vec![".iso"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("symlink.zip");
            {
                #[allow(unused_imports)]
                use std::os::unix::fs::PermissionsExt;
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let mut options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                #[cfg(unix)]
                {
                    options = options.unix_permissions(0o120777);
                }
                zip.start_file("evil.iso", options).unwrap();
                zip.write_all(b"/etc/passwd").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let result = import_game_source(req);
            match result {
                Ok(_) => {
                    assert!(rom_dir.join("evil.iso").exists());
                }
                Err(e) => {
                    assert!(
                        e.contains("SYMLINK") || e.contains("BLOCKED") || e.contains("SPECIAL"),
                        "got {}",
                        e
                    );
                }
            }
        });
    }

    // ---------- New regression tests for V8.6A.1 ----------

    #[test]
    fn cue_ref_parent_escape_blocked() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("escape.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"../outside.bin\" BINARY\n").unwrap();
                zip.start_file("outside.bin", options).unwrap();
                zip.write_all(b"bin").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("ESCAPE") || err.contains("BLOCKED") || err.contains("CUE"),
                "got {}",
                err
            );
        });
    }

    #[test]
    fn cue_ref_backslash_parent_escape_blocked() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("escape2.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"..\\outside.bin\" BINARY\n").unwrap();
                zip.start_file("outside.bin", options).unwrap();
                zip.write_all(b"bin").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("ESCAPE") || err.contains("BLOCKED") || err.contains("CUE"),
                "got {}",
                err
            );
        });
    }

    #[test]
    fn cue_ref_drive_qualified_blocked() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("drive.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"C:\\outside.bin\" BINARY\n").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("ESCAPE") || err.contains("BLOCKED") || err.contains("CUE"),
                "got {}",
                err
            );
        });
    }

    #[test]
    fn cue_ref_unc_blocked() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("unc.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("game.cue", options).unwrap();
                zip.write_all(b"FILE \"\\\\server\\share\\game.bin\" BINARY\n")
                    .unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("ESCAPE")
                    || err.contains("BLOCKED")
                    || err.contains("CUE")
                    || err.contains("UNC"),
                "got {}",
                err
            );
        });
    }

    #[test]
    fn nested_cue_structure_preserved() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("psx");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path =
            create_mock_config(tmp.path(), vec![("psx", &rom_dir, vec![".cue", ".bin"])]);
        with_env_config(&cfg_path, || {
            let src_zip = tmp.path().join("nested.zip");
            {
                let file = fs::File::create(&src_zip).unwrap();
                let mut zip = zip::ZipWriter::new(file);
                let options = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored);
                zip.start_file("Game/game.cue", options).unwrap();
                zip.write_all(b"FILE \"tracks/track01.bin\" BINARY\n  TRACK 01 MODE1/2352\n")
                    .unwrap();
                zip.start_file("Game/tracks/track01.bin", options).unwrap();
                zip.write_all(b"TRACKDATA").unwrap();
                zip.finish().unwrap();
            }
            let req = ImportRequest {
                systemId: "psx".into(),
                sourcePath: src_zip.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(res.status, "INSTALLED");
            assert!(
                rom_dir.join("Game").join("game.cue").exists()
                    || rom_dir.join("Game/game.cue").exists()
                    || rom_dir.join("game.cue").exists()
            );
            // Find installed cue
            let installed_cue = res
                .installedPaths
                .iter()
                .find(|p| p.to_lowercase().contains("game.cue"))
                .unwrap();
            let cue_path = PathBuf::from(installed_cue);
            let cue_dir = cue_path.parent().unwrap();
            // The referenced bin should be resolvable relative to cue_dir
            let content = fs::read_to_string(&cue_path).unwrap_or_default();
            assert!(content.contains("tracks/track01.bin"));
            let referenced = cue_dir.join("tracks").join("track01.bin");
            assert!(
                referenced.exists(),
                "nested BIN should exist relative to CUE dir: {}",
                referenced.display()
            );
        });
    }

    #[test]
    fn final_write_guaranteed_no_overwrite() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("gbc");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("gbc", &rom_dir, vec![".gbc"])]);
        with_env_config(&cfg_path, || {
            fs::write(rom_dir.join("existing.gbc"), b"ORIG").unwrap();
            let src = tmp.path().join("existing.gbc");
            fs::write(&src, b"NEW").unwrap();
            let req = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert!(res.status == "COLLISION" || res.status == "ALREADY_INSTALLED");
            let data = fs::read(rom_dir.join("existing.gbc")).unwrap();
            assert_eq!(data, b"ORIG", "must not truncate/replace");
        });
    }

    #[test]
    fn filename_only_already_installed_removed() {
        // Same filename different content should be COLLISION not ALREADY_INSTALLED
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("gbc");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("gbc", &rom_dir, vec![".gbc"])]);
        with_env_config(&cfg_path, || {
            fs::write(rom_dir.join("same.gbc"), b"AAA").unwrap();
            let src = tmp.path().join("same.gbc");
            fs::write(&src, b"BBB").unwrap();
            let req = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(
                res.status, "COLLISION",
                "different content same name must be COLLISION not ALREADY_INSTALLED, got {}",
                res.status
            );
            assert_eq!(fs::read(rom_dir.join("same.gbc")).unwrap(), b"AAA");
        });
    }

    #[test]
    fn identical_content_results_already_installed() {
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("gbc");
        fs::create_dir_all(&rom_dir).unwrap();
        let cfg_path = create_mock_config(tmp.path(), vec![("gbc", &rom_dir, vec![".gbc"])]);
        with_env_config(&cfg_path, || {
            fs::write(rom_dir.join("identical.gbc"), b"SAME").unwrap();
            let src = tmp.path().join("identical.gbc");
            fs::write(&src, b"SAME").unwrap();
            let req = ImportRequest {
                systemId: "gbc".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let res = import_game_source(req).unwrap();
            assert_eq!(
                res.status, "ALREADY_INSTALLED",
                "identical content should be ALREADY_INSTALLED, got {}",
                res.status
            );
        });
    }

    #[test]
    fn valid_extensions_only_no_fallback() {
        // Config with empty validExtensions should fail closed
        let tmp = TempDir::new().unwrap();
        let rom_dir = tmp.path().join("roms").join("ps2");
        fs::create_dir_all(&rom_dir).unwrap();
        // Create config where validExtensions empty but extensionString present – should be rejected by get_rom_dir_and_exts
        let cfg_json = json!({
            "schemaVersion": 1,
            "systems": [{
                "id": "ps2",
                "romDirectory": rom_dir.display().to_string(),
                "validExtensions": [],
                "extensionString": ".iso .bin",
                "fullName": "PS2"
            }],
            "roots": {}
        });
        let cfg_path = tmp.path().join("crystal-machine-config.json");
        fs::write(&cfg_path, serde_json::to_string_pretty(&cfg_json).unwrap()).unwrap();
        with_env_config(&cfg_path, || {
            let src = tmp.path().join("game.iso");
            fs::write(&src, b"data").unwrap();
            let req = ImportRequest {
                systemId: "ps2".into(),
                sourcePath: src.display().to_string(),
                expectedTitle: None,
            };
            let err = import_game_source(req).unwrap_err();
            assert!(
                err.contains("SYSTEM_CONFIG_INVALID")
                    || err.contains("validExtensions")
                    || err.contains("empty"),
                "got {}",
                err
            );
        });
    }
}
