/// CRYSTAL FRONTEND V8.6B Acquisition Watcher – Rust backend
/// Generic local acquisition watcher, provider-agnostic, source-agnostic.
/// No Vimm code, no network, no arbitrary filesystem watch.
/// Single active session, polling-based, zero cost when inactive.
use crate::import_game::{import_game_source, ImportRequest, ImportResult};
use crate::machine_config::{
    find_system_in_config, get_rom_dir_and_exts, load_machine_config_json,
};
use crate::safety::{crystal_writable_root, log_event};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

// ---------- State ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AcquisitionState {
    Idle,
    Watching,
    CandidateDetected,
    WaitingForStability,
    Ready,
    Importing,
    Installed,
    AlreadyInstalled,
    Ambiguous,
    Failed,
    Cancelled,
    TimedOut,
    Collision,
}

// ---------- Session models ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcquisitionSessionResponse {
    pub sessionId: String,
    pub systemId: String,
    pub expectedTitle: String,
    pub normalizedExpectedTitle: String,
    pub watchDirectory: String,
    pub startedAt: u64, // secs since epoch
    pub state: AcquisitionState,
    pub candidatePaths: Vec<String>,
    pub selectedCandidate: Option<String>,
    pub lastObservedSize: Option<u64>,
    pub stableSince: Option<u64>,
    pub importResult: Option<ImportResult>,
    pub errorCode: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcquisitionSettings {
    #[serde(default = "default_watch_mode")]
    pub watchDirectoryMode: String, // "default-downloads" | "custom"
    pub customWatchDirectory: Option<String>,
}

fn default_watch_mode() -> String {
    "default-downloads".to_string()
}

impl Default for AcquisitionSettings {
    fn default() -> Self {
        Self {
            watchDirectoryMode: "default-downloads".to_string(),
            customWatchDirectory: None,
        }
    }
}

#[derive(Debug, Clone)]
struct CandidateState {
    size: u64,
    mtime: SystemTime,
    observed_count: u32,
    first_seen: SystemTime,
    stable_since: SystemTime,
    last_seen: SystemTime,
}

#[derive(Debug)]
struct AcquisitionSessionInternal {
    session_id: String,
    system_id: String,
    expected_title: String,
    normalized_expected: String,
    watch_directory: PathBuf,
    started_at: SystemTime,
    started_at_epoch: u64,
    state: AcquisitionState,
    candidate_paths: Vec<PathBuf>, // current detected (top-level)
    selected_candidate: Option<PathBuf>,
    last_observed_size: Option<u64>,
    stable_since: Option<SystemTime>,
    stable_since_epoch: Option<u64>,
    import_result: Option<ImportResult>,
    error_code: Option<String>,
    message: Option<String>,
    baseline_files: HashSet<String>, // lowercased file names
    candidate_states: HashMap<String, CandidateState>, // key = full path string lower? use path string
    timeout_duration: Duration,
}

impl AcquisitionSessionInternal {
    fn to_response(&self) -> AcquisitionSessionResponse {
        AcquisitionSessionResponse {
            sessionId: self.session_id.clone(),
            systemId: self.system_id.clone(),
            expectedTitle: self.expected_title.clone(),
            normalizedExpectedTitle: self.normalized_expected.clone(),
            watchDirectory: self.watch_directory.to_string_lossy().to_string(),
            startedAt: self.started_at_epoch,
            state: self.state.clone(),
            candidatePaths: self
                .candidate_paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
            selectedCandidate: self
                .selected_candidate
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            lastObservedSize: self.last_observed_size,
            stableSince: self.stable_since_epoch,
            importResult: self.import_result.clone(),
            errorCode: self.error_code.clone(),
            message: self.message.clone(),
        }
    }
}

// Global single session
static ACQ_SESSION: OnceLock<Mutex<Option<AcquisitionSessionInternal>>> = OnceLock::new();

fn session_mutex() -> &'static Mutex<Option<AcquisitionSessionInternal>> {
    ACQ_SESSION.get_or_init(|| Mutex::new(None))
}

// ---------- Helpers ----------

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn system_time_to_epoch(st: SystemTime) -> u64 {
    st.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn resolve_default_download_dir() -> Result<PathBuf, String> {
    if let Some(dir) = dirs::download_dir() {
        if dir.exists() {
            return Ok(dir);
        }
        return Ok(dir);
    }
    Err("DOWNLOADS_DIRECTORY_UNAVAILABLE: Unable to resolve OS Downloads folder via known-folder API".to_string())
}

pub fn normalize_title(input: &str) -> String {
    if input.trim().is_empty() {
        return String::new();
    }
    let mut s = input.trim().to_string();

    let lower_for_ext = s.to_lowercase();
    let archive_exts = [
        ".zip", ".7z", ".rar", ".iso", ".cue", ".bin", ".chd", ".rvz", ".wud", ".wbfs",
    ];
    for ext in &archive_exts {
        if lower_for_ext.ends_with(ext) {
            s = s[..s.len() - ext.len()].to_string();
            break;
        }
    }

    s = s.to_lowercase();
    s = s.replace('_', " ");
    s = s
        .replace('’', "'")
        .replace('‘', "'")
        .replace('`', "'")
        .replace('´', "'");

    s = s
        .replace(':', " ")
        .replace('-', " ")
        .replace('–', " ")
        .replace('—', " ");

    if let Ok(re_paren) = Regex::new(r"\([^)]*\)") {
        s = re_paren.replace_all(&s, " ").to_string();
    }
    if let Ok(re_bracket) = Regex::new(r"\[[^\]]*\]") {
        s = re_bracket.replace_all(&s, " ").to_string();
    }

    s = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c.is_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect::<String>();

    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn is_temp_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    let suffixes = [".crdownload", ".part", ".partial", ".tmp", ".download"];
    for suf in &suffixes {
        if lower.ends_with(suf) {
            return true;
        }
    }
    if lower.starts_with('.') && lower.len() > 1 && lower.ends_with(".tmp") {
        return true;
    }
    false
}

fn is_safe_regular_file(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                return false;
            }
            if meta.file_type().is_dir() {
                return false;
            }
            if !meta.file_type().is_file() {
                return false;
            }
            true
        }
        Err(_) => false,
    }
}

fn validate_custom_watch_dir(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err(format!(
            "CUSTOM_WATCH_INVALID: path must be absolute, got '{}'",
            path.display()
        ));
    }
    let s = path.to_string_lossy().to_string();
    if s.starts_with("\\\\") || s.starts_with("//") {
        return Err("CUSTOM_WATCH_INVALID: UNC/network paths not allowed".to_string());
    }
    if s.starts_with("\\\\.\\") || s.starts_with("\\\\?\\") {
        return Err("CUSTOM_WATCH_INVALID: device path not allowed".to_string());
    }
    if path.parent().is_none() {
        return Err("CUSTOM_WATCH_INVALID: filesystem root not allowed".to_string());
    }
    if s.len() <= 3 && (s.ends_with(":\\") || s.ends_with(":/")) {
        return Err("CUSTOM_WATCH_INVALID: drive root not allowed".to_string());
    }
    if s == "/" || s == "\\" {
        return Err("CUSTOM_WATCH_INVALID: filesystem root not allowed".to_string());
    }
    if !path.exists() {
        return Err(format!(
            "CUSTOM_WATCH_INVALID: directory does not exist '{}'",
            path.display()
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "CUSTOM_WATCH_INVALID: not a directory '{}'",
            path.display()
        ));
    }
    for comp in path.components() {
        if let std::path::Component::ParentDir = comp {
            return Err("CUSTOM_WATCH_INVALID: traversal not allowed".to_string());
        }
    }
    match fs::read_dir(path) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!(
            "CUSTOM_WATCH_INVALID: not readable '{}': {}",
            path.display(),
            e
        )),
    }
}

fn get_allowed_exts_for_system(system_id: &str) -> Vec<String> {
    match load_machine_config_json() {
        Ok(cfg) => {
            if let Some(sys) = find_system_in_config(&cfg, system_id) {
                match get_rom_dir_and_exts(sys) {
                    Ok((_rom_dir, exts)) => exts
                        .into_iter()
                        .map(|e| {
                            let mut ee = e.trim().to_lowercase();
                            if ee.starts_with('.') {
                                ee = ee[1..].to_string();
                            }
                            ee
                        })
                        .collect(),
                    Err(_) => Vec::new(),
                }
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    }
}

fn is_allowed_candidate(path: &Path, system_id: &str) -> bool {
    let ext_opt = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    if ext_opt.is_none() {
        return false;
    }
    let ext = ext_opt.unwrap();
    if ext == "zip" || ext == "7z" {
        return true;
    }
    let allowed = get_allowed_exts_for_system(system_id);
    if allowed.is_empty() {
        return false;
    }
    allowed.iter().any(|a| a == &ext)
}

fn baseline_snapshot(watch_dir: &Path) -> HashSet<String> {
    let mut set = HashSet::new();
    if let Ok(entries) = fs::read_dir(watch_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !is_safe_regular_file(&p) {
                continue;
            }
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                set.insert(name.to_lowercase());
            }
        }
    }
    set
}

fn scan_new_candidates(
    watch_dir: &Path,
    baseline: &HashSet<String>,
    system_id: &str,
) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(watch_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !is_safe_regular_file(&p) {
            continue;
        }
        let name_os = match p.file_name() {
            Some(n) => n,
            None => continue,
        };
        let name = match name_os.to_str() {
            Some(s) => s,
            None => continue,
        };
        if baseline.contains(&name.to_lowercase()) {
            continue;
        }
        if is_temp_file(name) {
            continue;
        }
        if !is_allowed_candidate(&p, system_id) {
            continue;
        }
        out.push(p);
    }
    out
}

fn candidate_normalized_title(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_else(|| path.file_name().and_then(|n| n.to_str()).unwrap_or(""));
    normalize_title(stem)
}

fn acquisition_settings_path() -> PathBuf {
    crystal_writable_root()
        .join("state")
        .join("acquisition-settings.json")
}

fn load_acquisition_settings() -> AcquisitionSettings {
    let p = acquisition_settings_path();
    if !p.exists() {
        return AcquisitionSettings::default();
    }
    match fs::read_to_string(&p) {
        Ok(content) => match serde_json::from_str::<AcquisitionSettings>(&content) {
            Ok(s) => s,
            Err(_) => AcquisitionSettings::default(),
        },
        Err(_) => AcquisitionSettings::default(),
    }
}

fn save_acquisition_settings(settings: &AcquisitionSettings) -> Result<(), String> {
    let p = acquisition_settings_path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create settings dir '{}': {}",
                parent.display(),
                e
            )
        })?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&p, json)
        .map_err(|e| format!("Failed to write settings '{}': {}", p.display(), e))?;
    Ok(())
}

fn resolve_watch_directory(custom_opt: Option<String>) -> Result<PathBuf, String> {
    if let Some(custom_str) = custom_opt {
        let trimmed = custom_str.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            validate_custom_watch_dir(&p)?;
            return Ok(p);
        }
    }
    let settings = load_acquisition_settings();
    if settings.watchDirectoryMode == "custom" {
        if let Some(custom) = settings.customWatchDirectory {
            let p = PathBuf::from(custom);
            if validate_custom_watch_dir(&p).is_ok() {
                return Ok(p);
            }
        }
    }
    resolve_default_download_dir()
}

// ---------- Tauri Commands ----------

#[tauri::command]
pub fn get_default_download_directory() -> Result<String, String> {
    let dir = resolve_default_download_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn start_acquisition_watch(
    systemId: String,
    expectedTitle: String,
    startedAt: Option<u64>,
    customWatchDirectory: Option<String>,
    replaceExisting: Option<bool>,
) -> Result<AcquisitionSessionResponse, String> {
    let replace = replaceExisting.unwrap_or(false);
    let guard = session_mutex();
    let mut opt = guard.lock().map_err(|e| format!("LOCK_POISONED: {}", e))?;
    if let Some(existing) = opt.as_ref() {
        match existing.state {
            AcquisitionState::Watching
            | AcquisitionState::CandidateDetected
            | AcquisitionState::WaitingForStability
            | AcquisitionState::Ready
            | AcquisitionState::Importing => {
                if !replace {
                    return Err("ACQUISITION_ALREADY_ACTIVE: an acquisition session is already active; cancel before starting a new one".to_string());
                } else {
                    log_event(
                        "info",
                        &format!(
                            "acquisition replace existing session_id={} state={:?}",
                            existing.session_id, existing.state
                        ),
                    );
                }
            }
            _ => {}
        }
    }

    let watch_dir = resolve_watch_directory(customWatchDirectory)?;

    if !watch_dir.exists() {
        return Err(format!(
            "WATCH_DIRECTORY_UNAVAILABLE: '{}' does not exist",
            watch_dir.display()
        ));
    }
    if !watch_dir.is_dir() {
        return Err(format!(
            "WATCH_DIRECTORY_NOT_DIR: '{}' not a directory",
            watch_dir.display()
        ));
    }

    let baseline = baseline_snapshot(&watch_dir);

    let normalized = normalize_title(&expectedTitle);
    let session_id = Uuid::new_v4().to_string();
    let now = SystemTime::now();
    let epoch = now_epoch_secs();

    let session = AcquisitionSessionInternal {
        session_id: session_id.clone(),
        system_id: systemId,
        expected_title: expectedTitle,
        normalized_expected: normalized,
        watch_directory: watch_dir.clone(),
        started_at: now,
        started_at_epoch: startedAt.unwrap_or(epoch),
        state: AcquisitionState::Watching,
        candidate_paths: Vec::new(),
        selected_candidate: None,
        last_observed_size: None,
        stable_since: None,
        stable_since_epoch: None,
        import_result: None,
        error_code: None,
        message: None,
        baseline_files: baseline,
        candidate_states: HashMap::new(),
        timeout_duration: Duration::from_secs(25 * 60),
    };

    log_event(
        "info",
        &format!(
            "acquisition start session_id={} system={} watch_dir_basename={} candidate_count=0",
            session.session_id,
            session.system_id,
            watch_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("downloads")
        ),
    );

    let resp = session.to_response();
    *opt = Some(session);
    Ok(resp)
}

#[tauri::command]
pub fn get_acquisition_watch_status(
    sessionId: String,
) -> Result<AcquisitionSessionResponse, String> {
    let guard = session_mutex();
    let mut opt = guard.lock().map_err(|e| format!("LOCK_POISONED: {}", e))?;
    let session = match opt.as_mut() {
        Some(s) if s.session_id == sessionId => s,
        Some(s) => {
            return Err(format!(
                "SESSION_NOT_FOUND: requested {} but active is {}",
                sessionId, s.session_id
            ))
        }
        None => return Err("SESSION_NOT_FOUND: no active acquisition session".to_string()),
    };

    match session.state {
        AcquisitionState::Installed
        | AcquisitionState::AlreadyInstalled
        | AcquisitionState::Failed
        | AcquisitionState::Cancelled
        | AcquisitionState::TimedOut
        | AcquisitionState::Ambiguous
        | AcquisitionState::Collision => {
            return Ok(session.to_response());
        }
        _ => {}
    }

    if let Ok(elapsed) = SystemTime::now().duration_since(session.started_at) {
        if elapsed > session.timeout_duration {
            session.state = AcquisitionState::TimedOut;
            session.error_code = Some("TIMED_OUT".to_string());
            session.message = Some(format!(
                "Acquisition timed out after {}s",
                session.timeout_duration.as_secs()
            ));
            log_event(
                "info",
                &format!(
                    "acquisition timeout session_id={} state=TIMED_OUT",
                    session.session_id
                ),
            );
            return Ok(session.to_response());
        }
    }

    let candidates = scan_new_candidates(
        &session.watch_directory,
        &session.baseline_files,
        &session.system_id,
    );

    let now = SystemTime::now();

    let mut stable_candidates: Vec<PathBuf> = Vec::new();

    for cand_path in &candidates {
        let key = cand_path.to_string_lossy().to_string();
        let meta = match fs::metadata(cand_path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size = meta.len();
        let mtime = meta.modified().unwrap_or(now);

        let open_ok = fs::File::open(cand_path).is_ok();

        let state_entry = session
            .candidate_states
            .entry(key.clone())
            .or_insert(CandidateState {
                size,
                mtime,
                observed_count: 0,
                first_seen: now,
                stable_since: now,
                last_seen: now,
            });

        if state_entry.size != size || state_entry.mtime != mtime {
            state_entry.size = size;
            state_entry.mtime = mtime;
            state_entry.observed_count = 1;
            state_entry.stable_since = now;
            state_entry.first_seen = now;
            state_entry.last_seen = now;
            continue;
        } else {
            state_entry.observed_count += 1;
            state_entry.last_seen = now;
            let elapsed_stable = now
                .duration_since(state_entry.stable_since)
                .unwrap_or(Duration::from_secs(0));
            if state_entry.observed_count >= 3
                && elapsed_stable >= Duration::from_millis(1500)
                && open_ok
            {
                stable_candidates.push(cand_path.clone());
            }
        }
    }

    let current_keys: HashSet<String> = candidates
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    session
        .candidate_states
        .retain(|k, _| current_keys.contains(k));

    session.candidate_paths = candidates.clone();

    if candidates.is_empty() {
        session.state = AcquisitionState::Watching;
        return Ok(session.to_response());
    }

    if stable_candidates.is_empty() {
        if session.state == AcquisitionState::Watching {
            session.state = AcquisitionState::CandidateDetected;
        } else {
            session.state = AcquisitionState::WaitingForStability;
        }
        log_event(
            "info",
            &format!(
                "acquisition progress session_id={} state={:?} candidate_count={} stable=0",
                session.session_id,
                session.state,
                candidates.len()
            ),
        );
        return Ok(session.to_response());
    }

    let mut high: Vec<PathBuf> = Vec::new();
    for stable_path in &stable_candidates {
        let norm_cand = candidate_normalized_title(stable_path);
        if norm_cand == session.normalized_expected {
            high.push(stable_path.clone());
        }
    }

    if high.is_empty() {
        session.state = AcquisitionState::WaitingForStability;
        log_event(
            "info",
            &format!(
                "acquisition no high match session_id={} candidate_count={} stable={} expected='{}'",
                session.session_id,
                candidates.len(),
                stable_candidates.len(),
                session.normalized_expected
            ),
        );
        return Ok(session.to_response());
    }

    if high.len() > 1 {
        session.state = AcquisitionState::Ambiguous;
        session.error_code = Some("AMBIGUOUS".to_string());
        session.message = Some(format!(
            "Multiple high-confidence candidates ({}): {}",
            high.len(),
            high.iter()
                .map(|p| p.file_name().and_then(|n| n.to_str()).unwrap_or("unknown"))
                .collect::<Vec<_>>()
                .join(", ")
        ));
        session.candidate_paths = high.clone();
        log_event(
            "info",
            &format!(
                "acquisition ambiguous session_id={} candidate_count={} high={}",
                session.session_id,
                candidates.len(),
                high.len()
            ),
        );
        return Ok(session.to_response());
    }

    let selected = high[0].clone();
    let size = fs::metadata(&selected).map(|m| m.len()).unwrap_or(0);
    session.selected_candidate = Some(selected.clone());
    session.last_observed_size = Some(size);
    session.stable_since = Some(now);
    session.stable_since_epoch = Some(system_time_to_epoch(now));
    session.state = AcquisitionState::Ready;

    session.state = AcquisitionState::Importing;
    let selected_str = selected.to_string_lossy().to_string();
    let selected_basename = selected
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    log_event(
        "info",
        &format!(
            "acquisition importing session_id={} candidate_basename={} candidate_count=1",
            session.session_id, selected_basename
        ),
    );

    let req = ImportRequest {
        systemId: session.system_id.clone(),
        sourcePath: selected_str.clone(),
        expectedTitle: Some(session.expected_title.clone()),
    };

    match import_game_source(req) {
        Ok(res) => {
            session.import_result = Some(res.clone());
            match res.status.as_str() {
                "INSTALLED" => {
                    session.state = AcquisitionState::Installed;
                }
                "ALREADY_INSTALLED" => {
                    session.state = AcquisitionState::AlreadyInstalled;
                }
                "COLLISION" => {
                    session.state = AcquisitionState::Failed;
                    session.error_code = Some("COLLISION".to_string());
                    session.message = res
                        .message
                        .clone()
                        .or_else(|| Some("Collision detected".to_string()));
                }
                _ => {
                    if res.status == "INSTALLED" {
                        session.state = AcquisitionState::Installed;
                    } else if res.status == "ALREADY_INSTALLED" {
                        session.state = AcquisitionState::AlreadyInstalled;
                    } else {
                        session.state = AcquisitionState::Failed;
                        session.error_code = res.errorCode.clone().or(Some(res.status.clone()));
                        session.message = res.message.clone();
                    }
                }
            }
            log_event(
                "info",
                &format!(
                    "acquisition import result session_id={} state={:?} error_code={}",
                    session.session_id,
                    session.state,
                    session.error_code.as_ref().unwrap_or(&"none".to_string())
                ),
            );
        }
        Err(e) => {
            let code = if let Some(colon) = e.find(':') {
                e[..colon].trim().to_string()
            } else {
                e.clone()
            };
            session.state = AcquisitionState::Failed;
            session.error_code = Some(code.clone());
            session.message = Some(e.clone());
            log_event(
                "info",
                &format!(
                    "acquisition import failed session_id={} error_code={}",
                    session.session_id, code
                ),
            );
        }
    }

    Ok(session.to_response())
}

#[tauri::command]
pub fn cancel_acquisition_watch(sessionId: String) -> Result<AcquisitionSessionResponse, String> {
    let guard = session_mutex();
    let mut opt = guard.lock().map_err(|e| format!("LOCK_POISONED: {}", e))?;
    let session = match opt.as_mut() {
        Some(s) if s.session_id == sessionId => s,
        Some(s) => {
            return Err(format!(
                "SESSION_NOT_FOUND: requested {} but active is {}",
                sessionId, s.session_id
            ))
        }
        None => return Err("SESSION_NOT_FOUND: no active session".to_string()),
    };

    session.state = AcquisitionState::Cancelled;
    session.error_code = Some("CANCELLED".to_string());
    session.message = Some("Acquisition cancelled by user".to_string());
    log_event(
        "info",
        &format!("acquisition cancelled session_id={}", session.session_id),
    );
    Ok(session.to_response())
}

#[tauri::command]
pub fn get_acquisition_settings() -> Result<AcquisitionSettings, String> {
    Ok(load_acquisition_settings())
}

#[tauri::command]
pub fn set_acquisition_custom_watch_directory(path: String) -> Result<AcquisitionSettings, String> {
    let p = PathBuf::from(path.trim());
    validate_custom_watch_dir(&p)?;
    let mut settings = load_acquisition_settings();
    settings.watchDirectoryMode = "custom".to_string();
    settings.customWatchDirectory = Some(p.to_string_lossy().to_string());
    save_acquisition_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn clear_acquisition_custom_watch_directory() -> Result<AcquisitionSettings, String> {
    let mut settings = load_acquisition_settings();
    settings.watchDirectoryMode = "default-downloads".to_string();
    settings.customWatchDirectory = None;
    save_acquisition_settings(&settings)?;
    Ok(settings)
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use std::fs;
    use tempfile::TempDir;

    fn create_mock_config(rom_dir: &Path, exts: Vec<&str>) -> serde_json::Value {
        let systems = vec![
            serde_json::json!({
                "id": "gbc",
                "romDirectory": rom_dir.to_string_lossy().to_string(),
                "validExtensions": exts
            }),
            serde_json::json!({
                "id": "ps2",
                "romDirectory": rom_dir.to_string_lossy().to_string(),
                "validExtensions": exts
            }),
        ];
        serde_json::json!({
            "schemaVersion": 1,
            "machineNameWindows": "TestRig",
            "systems": systems
        })
    }

    fn with_test_config<F, R>(rom_dir: &Path, exts: Vec<&str>, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _guard = acquire_shared_test_env_lock();
        let td = TempDir::new().unwrap();
        let cfg_path = td.path().join("crystal-machine-config.json");
        let cfg = create_mock_config(rom_dir, exts);
        fs::write(&cfg_path, serde_json::to_string_pretty(&cfg).unwrap()).unwrap();
        let prev = std::env::var("CRYSTAL_MACHINE_CONFIG").ok();
        std::env::set_var("CRYSTAL_MACHINE_CONFIG", &cfg_path);
        let r = f();
        if let Some(p) = prev {
            std::env::set_var("CRYSTAL_MACHINE_CONFIG", p);
        } else {
            std::env::remove_var("CRYSTAL_MACHINE_CONFIG");
        }
        r
    }

    #[test]
    fn default_downloads_resolver_no_username_hardcode() {
        let res = resolve_default_download_dir();
        match res {
            Ok(p) => {
                let s = p.to_string_lossy().to_string();
                assert!(!s.contains("USERNAME"));
                assert!(!s.contains("%USERPROFILE%"));
                assert_ne!(s, "C:\\Users\\USERNAME\\Downloads");
            }
            Err(e) => {
                assert!(e.contains("DOWNLOADS_DIRECTORY_UNAVAILABLE") || e.contains("Unable"));
            }
        }
    }

    #[test]
    fn temp_file_detection() {
        assert!(is_temp_file("Game.zip.crdownload"));
        assert!(is_temp_file("Game.zip.PART"));
        assert!(is_temp_file("something.partial"));
        assert!(is_temp_file("foo.tmp"));
        assert!(is_temp_file("bar.download"));
        assert!(!is_temp_file("Game.zip"));
        assert!(!is_temp_file("photo.jpg"));
    }

    #[test]
    fn baseline_ignores_old_file() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        fs::write(watch.join("old.zip"), b"old").unwrap();
        let baseline = baseline_snapshot(watch);
        assert!(baseline.contains("old.zip"));

        let candidates = scan_new_candidates(watch, &baseline, "gbc");
        assert!(candidates.is_empty());

        fs::write(watch.join("new.zip"), b"new").unwrap();
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let detected = with_test_config(&rom_dir, vec!["zip", "gbc", "gb"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert_eq!(detected.len(), 1);
        assert!(detected[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .contains("new.zip"));
    }

    #[test]
    fn new_valid_candidate_detected() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        let baseline = baseline_snapshot(watch);
        assert!(baseline.is_empty());

        fs::write(watch.join("Super Mario World (USA).zip"), b"data").unwrap();
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let cands = with_test_config(&rom_dir, vec!["gbc", "zip"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert_eq!(cands.len(), 1);
    }

    #[test]
    fn browser_rename_temp_to_final() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        let baseline = baseline_snapshot(watch);
        fs::write(watch.join("Game.zip.crdownload"), b"partial").unwrap();
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let cands1 = with_test_config(&rom_dir, vec!["zip"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert!(cands1.is_empty());

        fs::remove_file(watch.join("Game.zip.crdownload")).unwrap();
        fs::write(watch.join("Game.zip"), b"final").unwrap();
        let cands2 = with_test_config(&rom_dir, vec!["zip"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert_eq!(cands2.len(), 1);
        assert_eq!(cands2[0].file_name().unwrap().to_string_lossy(), "Game.zip");
    }

    #[test]
    fn stability_growing_file_not_ready() {
        let mut map: HashMap<String, CandidateState> = HashMap::new();
        let now = SystemTime::now();
        let key = "game.zip".to_string();

        map.insert(
            key.clone(),
            CandidateState {
                size: 100,
                mtime: now,
                observed_count: 1,
                first_seen: now,
                stable_since: now,
                last_seen: now,
            },
        );
        let entry = map.get(&key).unwrap();
        assert!(entry.observed_count < 3);

        let mut e = map.get_mut(&key).unwrap();
        if e.size != 200 {
            e.size = 200;
            e.observed_count = 1;
        }
        assert_eq!(e.observed_count, 1);
    }

    #[test]
    fn title_normalization_exact_region_punctuation() {
        let exp = normalize_title("Super Mario World");
        assert_eq!(exp, "super mario world");

        let cand1 = normalize_title("Super Mario World (USA)");
        assert_eq!(cand1, "super mario world");

        let cand2 = normalize_title("Super Mario World [USA]");
        assert_eq!(cand2, "super mario world");

        let cand3 = normalize_title("Super_Mario-World");
        assert_eq!(cand3, "super mario world");

        assert_eq!(
            normalize_title("Super Mario World (USA).zip"),
            "super mario world"
        );

        let unrelated = normalize_title("vacation-photo");
        assert_ne!(unrelated, exp);
    }

    #[test]
    fn matching_two_plausible_ambiguous() {
        let expected = normalize_title("Mario");
        let cands = vec!["Mario Kart".to_string(), "Mario Tennis".to_string()];
        let mut highs = 0;
        for c in &cands {
            if normalize_title(c) == expected {
                highs += 1;
            }
        }
        assert_eq!(highs, 0);

        let cands2 = vec![
            "Super Mario World".to_string(),
            "Super Mario World".to_string(),
        ];
        let expected2 = normalize_title("Super Mario World");
        let highs2 = cands2
            .iter()
            .filter(|c| normalize_title(c) == expected2)
            .count();
        assert_eq!(highs2, 2);
    }

    #[test]
    fn system_valid_ext_and_archive_allowed() {
        let td = TempDir::new().unwrap();
        let rom_dir = td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        with_test_config(&rom_dir, vec!["gb", "gbc", "zip"], || {
            assert!(is_allowed_candidate(Path::new("game.zip"), "gbc"));
            assert!(is_allowed_candidate(Path::new("game.7z"), "gbc"));
            assert!(is_allowed_candidate(Path::new("game.gb"), "gbc"));
            assert!(!is_allowed_candidate(Path::new("game.nes"), "gbc"));
        });
    }

    #[test]
    fn no_recursive_symlink() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        let sub = watch.join("subdir");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("inner.zip"), b"inside").unwrap();

        let baseline = baseline_snapshot(watch);
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let cands = with_test_config(&rom_dir, vec!["zip"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert!(cands.is_empty());
    }

    #[test]
    fn cancellation_stops_detection() {
        let dir = TempDir::new().unwrap();
        let watch_dir = dir.path().to_path_buf();
        let baseline = HashSet::new();
        let session = AcquisitionSessionInternal {
            session_id: "test-cancel-1".to_string(),
            system_id: "gbc".to_string(),
            expected_title: "Game".to_string(),
            normalized_expected: normalize_title("Game"),
            watch_directory: watch_dir,
            started_at: SystemTime::now(),
            started_at_epoch: now_epoch_secs(),
            state: AcquisitionState::Watching,
            candidate_paths: Vec::new(),
            selected_candidate: None,
            last_observed_size: None,
            stable_since: None,
            stable_since_epoch: None,
            import_result: None,
            error_code: None,
            message: None,
            baseline_files: baseline,
            candidate_states: HashMap::new(),
            timeout_duration: Duration::from_secs(1500),
        };
        {
            let guard = session_mutex();
            let mut opt = guard.lock().unwrap();
            *opt = Some(session);
        }
        let res = cancel_acquisition_watch("test-cancel-1".to_string()).unwrap();
        assert_eq!(res.state, AcquisitionState::Cancelled);

        let res2 = get_acquisition_watch_status("test-cancel-1".to_string()).unwrap();
        assert_eq!(res2.state, AcquisitionState::Cancelled);

        {
            let guard = session_mutex();
            let mut opt = guard.lock().unwrap();
            *opt = None;
        }
    }

    #[test]
    fn only_one_active_session() {
        let _lock = acquire_shared_test_env_lock();
        {
            let guard = session_mutex();
            let mut opt = guard.lock().unwrap();
            *opt = None;
        }

        let td = TempDir::new().unwrap();
        let watch_dir = td.path().to_path_buf();

        let first = start_acquisition_watch(
            "gbc".to_string(),
            "Pokemon".to_string(),
            None,
            Some(watch_dir.to_string_lossy().to_string()),
            None,
        );
        assert!(first.is_ok(), "first should succeed {:?}", first.err());

        let second = start_acquisition_watch(
            "gbc".to_string(),
            "Mario".to_string(),
            None,
            Some(watch_dir.to_string_lossy().to_string()),
            None,
        );
        assert!(second.is_err());
        assert!(second.unwrap_err().contains("ACQUISITION_ALREADY_ACTIVE"));

        let third = start_acquisition_watch(
            "gbc".to_string(),
            "Zelda".to_string(),
            None,
            Some(watch_dir.to_string_lossy().to_string()),
            Some(true),
        );
        assert!(third.is_ok());

        if let Ok(s) = third {
            let _ = cancel_acquisition_watch(s.sessionId);
        }
        {
            let guard = session_mutex();
            let mut opt = guard.lock().unwrap();
            *opt = None;
        }
    }

    #[test]
    fn downloads_source_remains_after_import_simulated() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let src = watch.join("Game.zip");
        fs::write(&src, b"data").unwrap();

        let cfg = create_mock_config(&rom_dir, vec!["zip", "gbc"]);
        let cfg_path = td.path().join("cfg.json");
        fs::write(&cfg_path, serde_json::to_string_pretty(&cfg).unwrap()).unwrap();
        let prev = std::env::var("CRYSTAL_MACHINE_CONFIG").ok();
        std::env::set_var("CRYSTAL_MACHINE_CONFIG", &cfg_path);

        let staging = td.path().join("staging");
        fs::create_dir_all(&staging).unwrap();
        let prev_cache = std::env::var("CRYSTAL_CACHE_DIR").ok();
        std::env::set_var("CRYSTAL_CACHE_DIR", &staging);

        let req = ImportRequest {
            systemId: "gbc".to_string(),
            sourcePath: src.to_string_lossy().to_string(),
            expectedTitle: Some("Game".to_string()),
        };
        let res = import_game_source(req);
        assert!(res.is_ok(), "import should succeed {:?}", res.err());
        assert!(src.exists());

        if let Some(p) = prev {
            std::env::set_var("CRYSTAL_MACHINE_CONFIG", p);
        } else {
            std::env::remove_var("CRYSTAL_MACHINE_CONFIG");
        }
        if let Some(p) = prev_cache {
            std::env::set_var("CRYSTAL_CACHE_DIR", p);
        } else {
            std::env::remove_var("CRYSTAL_CACHE_DIR");
        }
    }

    #[test]
    fn privacy_no_recursive() {
        let td = TempDir::new().unwrap();
        let watch = td.path();
        fs::write(watch.join("a.zip"), b"a").unwrap();
        let sub = watch.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("b.zip"), b"b").unwrap();
        let baseline = HashSet::new();
        let rom_td = TempDir::new().unwrap();
        let rom_dir = rom_td.path().join("roms");
        fs::create_dir_all(&rom_dir).unwrap();
        let cands = with_test_config(&rom_dir, vec!["zip"], || {
            scan_new_candidates(watch, &baseline, "gbc")
        });
        assert_eq!(cands.len(), 1, "non-recursive only top level");
    }
}
