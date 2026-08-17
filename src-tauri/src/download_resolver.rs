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
    /// confidence meter: high/medium/low
    confidence: String,
    confidence_reason: String,
    /// true when file is unsupported (e.g., Switch)
    unsupported: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDownloadRequest {
    source_path: String,
    system_id: String,
    /// when true, keep source archive after successful install (default false)
    #[serde(default)]
    keep_source: Option<bool>,
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
            | "xci"
            | "nsp"
    )
}

fn is_unsupported_extension(ext: &str) -> bool {
    matches!(ext, "xci" | "nsp")
}

#[derive(Default)]
struct ArchiveInspection {
    possible_system_ids: Vec<String>,
    content_stems: Vec<String>,
    detected_extensions: Vec<String>,
}

/// Suggest system with confidence meter high/medium/low and reason string.
///
/// Returns (suggested_system_id, confidence, reason)
///
/// Confidence semantics:
/// - high: exact file type match, safe to auto-select
/// - medium: plausible but requires review (rvz gc/wii, pbp multi-disc, PS2 sports ISO)
/// - low: ambiguous disc or unsupported (iso ambiguous, xci/nsp)
fn suggest_system(
    file_name: &str,
    detected_extensions: &[String],
    possible: &[String],
    installed: &[String],
) -> (Option<String>, String, String) {
    let available = |id: &str| possible.iter().any(|candidate| candidate == id);
    if installed.len() == 1 {
        return (
            Some(installed[0].clone()),
            "high".to_string(),
            "installed copy verified".to_string(),
        );
    }
    let has = |ext: &str| detected_extensions.iter().any(|candidate| candidate == ext);
    let title_lower = file_name.to_ascii_lowercase();

    // Unsupported first – Switch formats not in EmuDeck manifest
    if has("xci") || has("nsp") {
        let which = if has("xci") { "xci" } else { "nsp" };
        return (
            None,
            "low".to_string(),
            format!(
                "Switch format .{} not configured in manifest – unsupported (candidate [])",
                which
            ),
        );
    }

    // Canonical high-confidence exact mappings
    if has("gb") && available("gb") {
        return (
            Some("gb".to_string()),
            "high".to_string(),
            "inner .gb + candidate [gb] exact".to_string(),
        );
    }
    if has("gbc") && available("gbc") {
        return (
            Some("gbc".to_string()),
            "high".to_string(),
            "inner .gbc + candidate [gbc] exact".to_string(),
        );
    }
    if has("gba") && available("gba") {
        return (
            Some("gba".to_string()),
            "high".to_string(),
            "inner .gba + candidate [gba] exact".to_string(),
        );
    }
    if has("nds") && available("nds") {
        return (
            Some("nds".to_string()),
            "high".to_string(),
            "inner .nds + candidate [nds] exact".to_string(),
        );
    }
    if has("3ds") && available("n3ds") {
        return (
            Some("n3ds".to_string()),
            "high".to_string(),
            "inner .3ds + candidate [n3ds] exact".to_string(),
        );
    }
    if has("cia") && available("n3ds") {
        return (
            Some("n3ds".to_string()),
            "high".to_string(),
            "inner .cia + candidate [n3ds] exact".to_string(),
        );
    }
    if (has("z64") || has("n64") || has("v64")) && available("n64") {
        return (
            Some("n64".to_string()),
            "high".to_string(),
            "inner .n64-family + candidate [n64] exact".to_string(),
        );
    }
    if (has("sfc") || has("smc")) && available("snes") {
        return (
            Some("snes".to_string()),
            "high".to_string(),
            "inner .sfc/.smc + candidate [snes] exact".to_string(),
        );
    }
    if has("md") || has("gen") || has("smd") || has("32x") {
        if available("genesis") {
            return (
                Some("genesis".to_string()),
                "high".to_string(),
                format!("inner .{} + candidate [genesis] exact", detected_extensions.iter().find(|e| matches!(e.as_str(), "md"|"gen"|"smd"|"32x")).cloned().unwrap_or("md".to_string())),
            );
        }
        if available("megadrive") {
            return (
                Some("megadrive".to_string()),
                "high".to_string(),
                format!("inner .{} + candidate [megadrive] exact", detected_extensions.iter().find(|e| matches!(e.as_str(), "md"|"gen"|"smd"|"32x")).cloned().unwrap_or("md".to_string())),
            );
        }
    }
    if has("ciso") && available("gc") {
        return (
            Some("gc".to_string()),
            "high".to_string(),
            "inner .ciso + candidate [gc] exact".to_string(),
        );
    }
    if has("wbfs") && available("wii") {
        return (
            Some("wii".to_string()),
            "high".to_string(),
            "inner .wbfs + candidate [wii] exact".to_string(),
        );
    }
    if has("wad") && available("wii") {
        return (
            Some("wii".to_string()),
            "high".to_string(),
            "inner .wad + candidate [wii] exact".to_string(),
        );
    }

    // .rvz – Dolphin format GC/Wii – check inner file extension? conservative gc/wii both
    if has("rvz") || has("gcz") {
        let gc_avail = available("gc");
        let wii_avail = available("wii");
        // filename contains wii => map to wii with medium/high confidence
        if title_lower.contains("wii") && wii_avail {
            return (
                Some("wii".to_string()),
                "medium".to_string(),
                "inner .rvz Dolphin gc/wii – filename contains 'wii' → wii".to_string(),
            );
        }
        if gc_avail && wii_avail {
            return (
                None,
                "medium".to_string(),
                format!(
                    "inner .rvz Dolphin gc/wii ambiguous candidates [{}, {}] – review required",
                    "gc", "wii"
                ),
            );
        }
        if gc_avail {
            return (
                Some("gc".to_string()),
                "medium".to_string(),
                "inner .rvz Dolphin gc/wii – candidate [gc]".to_string(),
            );
        }
        if wii_avail {
            return (
                Some("wii".to_string()),
                "medium".to_string(),
                "inner .rvz Dolphin gc/wii – candidate [wii]".to_string(),
            );
        }
        return (
            None,
            "medium".to_string(),
            "inner .rvz Dolphin gc/wii – no candidate in manifest".to_string(),
        );
    }

    // .pbp – PSX multi-disc – PSP can also use pbp but less
    if has("pbp") {
        if available("psx") {
            return (
                Some("psx".to_string()),
                "medium".to_string(),
                "inner .pbp multi-disc PSX (PSP also uses PBP, review) – candidate [psx]".to_string(),
            );
        }
        if available("psp") {
            return (
                Some("psp".to_string()),
                "medium".to_string(),
                "inner .pbp – candidate [psp] multi-disc possible".to_string(),
            );
        }
        return (
            None,
            "medium".to_string(),
            "inner .pbp multi-disc ambiguous – no psx/psp in manifest".to_string(),
        );
    }

    // .iso – ambiguous – many systems use iso (ps2, psp, psx, gc? actually ciso)
    if has("iso") {
        // Known PS2 sports title hint allows medium despite ambiguity
        if available("ps2")
            && ["pro evolution soccer", "pes 20", "fifa "]
                .iter()
                .any(|needle| title_lower.contains(needle))
        {
            return (
                Some("ps2".to_string()),
                "medium".to_string(),
                format!("inner .iso ambiguous candidates {:?} – PS2 title match '{}'", possible, file_name),
            );
        }
        if possible.len() > 1 {
            return (
                None,
                "low".to_string(),
                format!("inner .iso ambiguous candidates {:?} – review required", possible),
            );
        }
        if possible.len() == 1 {
            return (
                Some(possible[0].clone()),
                "low".to_string(),
                format!(
                    "inner .iso single candidate [{}] but disc format requires review",
                    possible[0]
                ),
            );
        }
        return (
            None,
            "low".to_string(),
            "inner .iso ambiguous – no candidate in manifest".to_string(),
        );
    }

    // Generic single possible system – high confidence if exact file type already matched above,
    // otherwise high only for non-ambiguous formats
    if possible.len() == 1 {
        // Avoid auto-selecting ambiguous disc formats when possible.len==1 came from iso/rvz path – already handled.
        // This branch is for remaining formats that were not caught but have unique manifest mapping.
        return (
            Some(possible[0].clone()),
            "high".to_string(),
            format!("only compatible console [{}] – high confidence", possible[0]),
        );
    }

    (None, "low".to_string(), "console could not be determined safely – review required".to_string())
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
    // Allow unsupported for detection but keep for reason – still record
    let is_unsupported = is_unsupported_extension(&ext);
    if !is_unsupported && (forbidden_loose_extension(&ext) || !recognized_rom_extension(&ext)) {
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
        // Keep unsupported xci/nsp even though they are loose ROMs – show as unsupported for UX
        let is_unsupported_loose = is_unsupported_extension(&ext);
        if !archive && !is_unsupported_loose && forbidden_loose_extension(&ext) {
            continue;
        }
        let inspection = if ext == "zip" {
            inspect_zip(&path, &by_ext)
        } else if ext == "7z" {
            inspect_7z(&path, &by_ext)
        } else {
            let mut possible_ids = by_ext.get(&ext).cloned().unwrap_or_default();
            // Unsupported loose file has no possible system – still surface it
            if is_unsupported_loose && possible_ids.is_empty() {
                // keep empty to trigger unsupported reason
            }
            ArchiveInspection {
                possible_system_ids: possible_ids,
                content_stems: vec![path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_string()],
                detected_extensions: vec![ext.clone()],
            }
        };
        let possible = inspection.possible_system_ids.clone();
        let detected = inspection.detected_extensions.clone();
        let has_unsupported = detected.iter().any(|e| is_unsupported_extension(e));
        if possible.is_empty() && !has_unsupported {
            continue;
        }
        let mut source_stems = inspection.content_stems.clone();
        if source_stems.is_empty() {
            source_stems.push(
                path.file_stem()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_string(),
            );
        }
        let installed_system_ids: Vec<String> = if has_unsupported {
            Vec::new()
        } else {
            possible
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
                .collect()
        };
        let metadata = entry
            .metadata()
            .map_err(|e| format!("DOWNLOAD_METADATA_FAILED: {e}"))?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let (suggested_system_id, confidence, confidence_reason) = suggest_system(
            path.file_name().and_then(|value| value.to_str()).unwrap_or(""),
            &inspection.detected_extensions,
            &possible,
            &installed_system_ids,
        );
        let suggestion_reason = confidence_reason.clone();
        let confidence_clone = confidence.clone();
        let unsupported = has_unsupported || confidence == "low" && suggestion_reason.contains("unsupported");
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
            confidence: confidence_clone,
            confidence_reason,
            unsupported,
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
    // Block unsupported Switch formats early
    let ext = source.extension().and_then(|v| v.to_str()).map(norm_ext).unwrap_or_default();
    if is_unsupported_extension(&ext) {
        return Err("UNSUPPORTED_FORMAT: Switch format not configured in manifest".to_string());
    }
    // If source is archive, inspect inner contents for unsupported switch formats
    if ext == "zip" || ext == "7z" {
        // Use empty by_ext for quick check – if archive contains xci/nsp we already surfaced as low confidence.
        // Still block install attempting to select console for unsupported inner content unless user forced?
        // For now, allow import_game to fail normally, but we pre-check detected extensions via a minimal by_ext.
        // We reuse empty because manifest won't have xci/nsp anyway, so unsupported archive will be caught via inspection later.
        // To avoid heavy work duplication, we let import_game_source handle validation and we surface its error.
    }
    let keep_source = request.keep_source.unwrap_or(false);
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
        if !keep_source {
            fs::remove_file(&source).map_err(|e| format!("INSTALLED_BUT_SOURCE_DELETE_FAILED: {e}"))?;
        } else {
            crate::safety::log_event("INFO", &format!("downloads inbox keep source enabled source={} freed=0", request.source_path));
        }
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
        let (suggested, conf, reason) = suggest_system("Tetris.zip", &["gb".into()], &possible, &[]);
        assert_eq!(suggested.as_deref(), Some("gb"));
        assert_eq!(conf, "high");
        assert!(reason.contains("inner .gb"));
    }

    #[test]
    fn detects_gamecube_ciso_and_ps2_sports_iso() {
        let (suggested, conf, _) = suggest_system("Super Mario Sunshine.7z", &["ciso".into()], &["gc".into(), "ps2".into()], &[]);
        assert_eq!(suggested.as_deref(), Some("gc"));
        assert_eq!(conf, "high");
        let (suggested2, conf2, reason2) = suggest_system("PES 2012.7z", &["iso".into()], &["ps2".into(), "wii".into()], &[]);
        assert_eq!(suggested2.as_deref(), Some("ps2"));
        assert_eq!(conf2, "medium");
        assert!(reason2.contains("PS2 title match"));
    }

    #[test]
    fn rvz_dolphin_gc_wii_medium_unless_wii_in_name() {
        let possible = vec!["gc".into(), "wii".into()];
        let (suggested, conf, reason) = suggest_system("Mario Kart.7z", &["rvz".into()], &possible, &[]);
        assert_eq!(suggested, None);
        assert_eq!(conf, "medium");
        assert!(reason.contains("inner .rvz Dolphin gc/wii"));
        let (suggested2, conf2, reason2) = suggest_system("Wii Sports.rvz", &["rvz".into()], &possible, &[]);
        assert_eq!(suggested2.as_deref(), Some("wii"));
        assert_eq!(conf2, "medium");
        assert!(reason2.contains("filename contains"));
    }

    #[test]
    fn pbp_multi_disc_medium() {
        let possible = vec!["psx".into(), "psp".into()];
        let (suggested, conf, reason) = suggest_system("Final Fantasy VII.pbp", &["pbp".into()], &possible, &[]);
        assert_eq!(suggested.as_deref(), Some("psx"));
        assert_eq!(conf, "medium");
        assert!(reason.contains("multi-disc"));
    }

    #[test]
    fn xci_nsp_unsupported_low() {
        let possible: Vec<String> = vec![];
        let (suggested, conf, reason) = suggest_system("Game.nsp", &["nsp".into()], &possible, &[]);
        assert_eq!(suggested, None);
        assert_eq!(conf, "low");
        assert!(reason.contains("Switch format"));
    }

    #[test]
    fn iso_ambiguous_low() {
        let possible = vec!["ps2".into(), "psp".into(), "psx".into()];
        let (suggested, conf, reason) = suggest_system("Random Game.iso", &["iso".into()], &possible, &[]);
        assert_eq!(suggested, None);
        assert_eq!(conf, "low");
        assert!(reason.contains("ambiguous candidates"));
    }
}
