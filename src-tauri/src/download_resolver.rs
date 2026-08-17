use crate::acquisition_watch::resolve_default_download_dir;
use crate::import_game::{import_game_source, ImportRequest, ImportResult};
use crate::machine_config::{get_rom_dir_and_exts, load_machine_config_json};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::process::Command;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCandidate {
    path: String,
    file_name: String,
    size: u64,
    modified_at: u64,
    possible_system_ids: Vec<String>,
    installed_system_ids: Vec<String>,
    archive: bool,
    detected_extensions: Vec<String>,
    suggested_system_id: Option<String>,
    suggestion_reason: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDownloadRequest {
    source_path: String,
    system_id: String,
}

fn system_has_matching_rom(rom_dir: &std::path::Path, source_stem: &str) -> bool {
    let mut pending = vec![rom_dir.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file()
                && path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .map(|v| v.eq_ignore_ascii_case(source_stem))
                    .unwrap_or(false)
                && !matches!(
                    path.extension()
                        .and_then(|v| v.to_str())
                        .map(norm_ext)
                        .as_deref(),
                    Some("zip" | "7z")
                )
            {
                return true;
            }
        }
    }
    false
}

fn norm_ext(value: &str) -> String {
    value.trim().trim_start_matches('.').to_ascii_lowercase()
}

fn forbidden_loose_extension(ext: &str) -> bool {
    matches!(
        ext,
        "exe"
            | "msi"
            | "msix"
            | "appx"
            | "bat"
            | "cmd"
            | "com"
            | "scr"
            | "ps1"
            | "js"
            | "vbs"
            | "dll"
            | "sys"
            | "json"
            | "xml"
            | "md"
            | "txt"
            | "pdf"
            | "lib"
            | "lua"
            | "py"
            | "card"
            | "gitignore"
            | "modkitignore"
            | "nuspec"
            | "p7s"
            | "props"
            | "psmdcp"
            | "rels"
            | "targets"
            | "png"
            | "jpg"
            | "jpeg"
            | "webp"
            | "svg"
            | "gif"
            | "ico"
            | "zip"
            | "7z"
            | "rar"
            | "tar"
            | "gz"
            | "bz2"
            | "xz"
            | "7z.tmp"
            | "crdownload"
            | "part"
    )
}

fn recognized_rom_extension(ext: &str) -> bool {
    matches!(
        ext,
        "gb" | "gbc"
            | "gba"
            | "nes"
            | "fds"
            | "sfc"
            | "smc"
            | "md"
            | "smd"
            | "gen"
            | "32x"
            | "n64"
            | "z64"
            | "v64"
            | "nds"
            | "3ds"
            | "cia"
            | "iso"
            | "cso"
            | "ciso"
            | "chd"
            | "cue"
            | "gdi"
            | "rvz"
            | "gcz"
            | "wbfs"
            | "wad"
            | "xex"
            | "xbe"
            | "elf"
            | "pbp"
    )
}

#[derive(Default)]
struct ArchiveInspection {
    possible_system_ids: Vec<String>,
    content_stems: Vec<String>,
    detected_extensions: Vec<String>,
}

fn suggest_system(
    file_name: &str,
    detected_extensions: &[String],
    possible: &[String],
    installed: &[String],
) -> (Option<String>, String) {
    let available = |id: &str| possible.iter().any(|candidate| candidate == id);
    if installed.len() == 1 {
        return (Some(installed[0].clone()), "installed copy verified".to_string());
    }
    let has = |ext: &str| detected_extensions.iter().any(|candidate| candidate == ext);
    let canonical = if has("gb") { Some(("gb", "Game Boy file type")) }
        else if has("gbc") { Some(("gbc", "Game Boy Color file type")) }
        else if has("gba") { Some(("gba", "Game Boy Advance file type")) }
        else if has("nds") { Some(("nds", "Nintendo DS file type")) }
        else if has("3ds") || has("cia") { Some(("n3ds", "Nintendo 3DS file type")) }
        else if has("z64") || has("n64") || has("v64") { Some(("n64", "Nintendo 64 file type")) }
        else if has("sfc") || has("smc") { Some(("snes", "Super Nintendo file type")) }
        else if has("md") || has("gen") || has("smd") || has("32x") { Some(("genesis", "Sega Genesis file type")) }
        else if has("ciso") { Some(("gc", "GameCube compressed-disc file type")) }
        else { None };
    if let Some((id, reason)) = canonical {
        if available(id) { return (Some(id.to_string()), reason.to_string()); }
    }
    let title = file_name.to_ascii_lowercase();
    if has("iso") && available("ps2")
        && ["pro evolution soccer", "pes 20", "fifa "].iter().any(|needle| title.contains(needle))
    {
        return (Some("ps2".to_string()), "PlayStation 2 title match".to_string());
    }
    if possible.len() == 1 {
        return (Some(possible[0].clone()), "only compatible console".to_string());
    }
    (None, "console could not be determined safely".to_string())
}

fn record_archive_entry(
    entry_name: &str,
    by_ext: &HashMap<String, Vec<String>>,
    inspection: &mut ArchiveInspection,
) {
    let entry = std::path::Path::new(entry_name.trim());
    let ext = entry
        .extension()
        .and_then(|v| v.to_str())
        .map(norm_ext)
        .unwrap_or_default();
    if forbidden_loose_extension(&ext) || !recognized_rom_extension(&ext) {
        return;
    }
    if !inspection.detected_extensions.contains(&ext) {
        inspection.detected_extensions.push(ext.clone());
    }
    if let Some(stem) = entry.file_stem().and_then(|v| v.to_str()) {
        let stem = stem.to_string();
        if !inspection.content_stems.contains(&stem) {
            inspection.content_stems.push(stem);
        }
    }
    if let Some(ids) = by_ext.get(&ext) {
        for id in ids {
            if !inspection.possible_system_ids.contains(id) {
                inspection.possible_system_ids.push(id.clone());
            }
        }
    }
}

fn inspect_zip(path: &std::path::Path, by_ext: &HashMap<String, Vec<String>>) -> ArchiveInspection {
    let mut inspection = ArchiveInspection::default();
    let Ok(file) = File::open(path) else {
        return inspection;
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return inspection;
    };
    for index in 0..archive.len().min(2000) {
        let Ok(entry) = archive.by_index(index) else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        record_archive_entry(entry.name(), by_ext, &mut inspection);
    }
    inspection
}

fn seven_zip_executable() -> Option<std::path::PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let path = std::path::PathBuf::from(appdata)
        .join("EmuDeck")
        .join("backend")
        .join("wintools")
        .join("7z.exe");
    path.is_file().then_some(path)
}

fn inspect_7z(path: &std::path::Path, by_ext: &HashMap<String, Vec<String>>) -> ArchiveInspection {
    let mut inspection = ArchiveInspection::default();
    let Some(executable) = seven_zip_executable() else {
        return inspection;
    };
    let Ok(output) = Command::new(executable)
        .arg("l")
        .arg("-slt")
        .arg(path)
        .output()
    else {
        return inspection;
    };
    if !output.status.success() {
        return inspection;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(entry) = line.strip_prefix("Path = ") {
            if std::path::Path::new(entry) != path {
                record_archive_entry(entry, by_ext, &mut inspection);
            }
        }
    }
    inspection
}

#[tauri::command]
pub fn scan_downloaded_games() -> Result<Vec<DownloadCandidate>, String> {
    let downloads = resolve_default_download_dir()?;
    let config = load_machine_config_json()?;
    let systems = config
        .get("systems")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Machine config has no systems array".to_string())?;
    let mut by_ext: HashMap<String, Vec<String>> = HashMap::new();
    let mut rom_dirs: HashMap<String, std::path::PathBuf> = HashMap::new();
    for system in systems {
        let Some(id) = system.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let Ok((rom_dir, exts)) = get_rom_dir_and_exts(system) else {
            continue;
        };
        rom_dirs.insert(id.to_string(), std::path::PathBuf::from(rom_dir));
        for ext in exts {
            by_ext
                .entry(norm_ext(&ext))
                .or_default()
                .push(id.to_string());
        }
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&downloads).map_err(|e| format!("DOWNLOADS_READ_FAILED: {e}"))? {
        let entry = entry.map_err(|e| format!("DOWNLOADS_ENTRY_FAILED: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|v| v.to_str())
            .map(norm_ext)
            .unwrap_or_default();
        let archive = matches!(ext.as_str(), "zip" | "7z");
        if !archive && forbidden_loose_extension(&ext) {
            continue;
        }
        let inspection = if ext == "zip" {
            inspect_zip(&path, &by_ext)
        } else if ext == "7z" {
            inspect_7z(&path, &by_ext)
        } else {
            ArchiveInspection {
                possible_system_ids: by_ext.get(&ext).cloned().unwrap_or_default(),
                content_stems: vec![path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_string()],
                detected_extensions: vec![ext.clone()],
            }
        };
        let possible = inspection.possible_system_ids;
        if possible.is_empty() {
            continue;
        }
        let mut source_stems = inspection.content_stems;
        if source_stems.is_empty() {
            source_stems.push(
                path.file_stem()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_string(),
            );
        }
        let installed_system_ids: Vec<String> = possible
            .iter()
            .filter(|id| {
                rom_dirs
                    .get(*id)
                    .map(|dir| {
                        source_stems
                            .iter()
                            .any(|stem| system_has_matching_rom(dir, stem))
                    })
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("DOWNLOAD_METADATA_FAILED: {e}"))?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let (suggested_system_id, suggestion_reason) = suggest_system(
            path.file_name().and_then(|value| value.to_str()).unwrap_or(""),
            &inspection.detected_extensions,
            &possible,
            &installed_system_ids,
        );
        result.push(DownloadCandidate {
            path: path.to_string_lossy().to_string(),
            file_name: path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("unknown")
                .to_string(),
            size: metadata.len(),
            modified_at,
            possible_system_ids: possible,
            installed_system_ids,
            archive,
            detected_extensions: inspection.detected_extensions,
            suggested_system_id,
            suggestion_reason,
        });
    }
    result.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    result.truncate(50);
    Ok(result)
}

#[tauri::command]
pub fn clear_verified_download(request: ResolveDownloadRequest) -> Result<String, String> {
    let downloads = resolve_default_download_dir()?
        .canonicalize()
        .map_err(|e| format!("DOWNLOADS_CANONICALIZE_FAILED: {e}"))?;
    let source = std::path::PathBuf::from(&request.source_path)
        .canonicalize()
        .map_err(|e| format!("SOURCE_CANONICALIZE_FAILED: {e}"))?;
    if source.parent() != Some(downloads.as_path()) || !source.is_file() {
        return Err("SOURCE_NOT_DIRECT_DOWNLOADS_FILE".to_string());
    }
    let config = load_machine_config_json()?;
    let system = config
        .get("systems")
        .and_then(|v| v.as_array())
        .and_then(|systems| {
            systems.iter().find(|system| {
                system.get("id").and_then(|v| v.as_str()) == Some(request.system_id.as_str())
            })
        })
        .ok_or_else(|| "UNKNOWN_SYSTEM".to_string())?;
    let (rom_dir, valid_exts) = get_rom_dir_and_exts(system)?;
    let mut by_ext = HashMap::new();
    for ext in valid_exts {
        by_ext.insert(norm_ext(&ext), vec![request.system_id.clone()]);
    }
    let source_ext = source
        .extension()
        .and_then(|v| v.to_str())
        .map(norm_ext)
        .unwrap_or_default();
    let inspection = if source_ext == "zip" {
        inspect_zip(&source, &by_ext)
    } else if source_ext == "7z" {
        inspect_7z(&source, &by_ext)
    } else {
        ArchiveInspection {
            content_stems: vec![source
                .file_stem()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_string()],
            ..Default::default()
        }
    };
    if inspection.content_stems.is_empty()
        || !inspection
            .content_stems
            .iter()
            .any(|stem| system_has_matching_rom(std::path::Path::new(&rom_dir), stem))
    {
        return Err("NO_VERIFIED_INSTALLED_COUNTERPART_SOURCE_RETAINED".to_string());
    }
    fs::remove_file(&source).map_err(|e| format!("DOWNLOAD_DELETE_FAILED: {e}"))?;
    Ok(source.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn resolve_downloaded_game(
    request: ResolveDownloadRequest,
) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || resolve_downloaded_game_blocking(request))
        .await
        .map_err(|error| format!("DOWNLOAD_RESOLVE_WORKER_FAILED: {error}"))?
}

fn resolve_downloaded_game_blocking(
    request: ResolveDownloadRequest,
) -> Result<ImportResult, String> {
    crate::safety::log_event("INFO", &format!("downloads inbox install start system={} source={}", request.system_id, request.source_path));
    let downloads = resolve_default_download_dir()?
        .canonicalize()
        .map_err(|e| format!("DOWNLOADS_CANONICALIZE_FAILED: {e}"))?;
    let source = std::path::PathBuf::from(&request.source_path)
        .canonicalize()
        .map_err(|e| format!("SOURCE_CANONICALIZE_FAILED: {e}"))?;
    if source.parent() != Some(downloads.as_path()) || !source.is_file() {
        return Err("SOURCE_NOT_DIRECT_DOWNLOADS_FILE".to_string());
    }
    if request.system_id.trim().is_empty() {
        return Err("SYSTEM_SELECTION_REQUIRED".to_string());
    }
    let result = import_game_source(ImportRequest {
        systemId: request.system_id,
        sourcePath: source.to_string_lossy().to_string(),
        expectedTitle: None,
    }).map_err(|error| {
        crate::safety::log_event("ERROR", &format!("downloads inbox install failed source={} error={error}", request.source_path));
        error
    })?;
    if matches!(result.status.as_str(), "INSTALLED" | "ALREADY_INSTALLED") {
        if result.installedPaths.is_empty()
            || !result
                .installedPaths
                .iter()
                .all(|p| std::path::Path::new(p).is_file())
        {
            return Err("INSTALL_VERIFICATION_FAILED_SOURCE_RETAINED".to_string());
        }
        fs::remove_file(&source).map_err(|e| format!("INSTALLED_BUT_SOURCE_DELETE_FAILED: {e}"))?;
    }
    crate::safety::log_event("INFO", &format!("downloads inbox install complete source={} status={}", request.source_path, result.status));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::suggest_system;

    #[test]
    fn detects_common_handheld_archives_without_prompting() {
        let possible = vec!["gb".to_string(), "gbc".to_string()];
        assert_eq!(suggest_system("Tetris.zip", &["gb".into()], &possible, &[]).0.as_deref(), Some("gb"));
    }

    #[test]
    fn detects_gamecube_ciso_and_ps2_sports_iso() {
        assert_eq!(suggest_system("Super Mario Sunshine.7z", &["ciso".into()], &["gc".into(), "ps2".into()], &[]).0.as_deref(), Some("gc"));
        assert_eq!(suggest_system("PES 2012.7z", &["iso".into()], &["ps2".into(), "wii".into()], &[]).0.as_deref(), Some("ps2"));
    }
}
