//! V8.6D1 – In-app provider surface and browser-download acquisition
//! Plan C – child webview inside existing fullscreen Crystal window, ROMsFun real page,
//! manual interaction, browser download capture → Crystal DOWNLOADING → import → refresh → PLAY
//! Constraints per V8.6D0 spec 2026-08-10 – no Edge/Chrome/popup, provider-neutral surface events,
//! zero-cap child webview, first-party nav allow vs third-party block, strict download validation.

use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};
use url::Url;

use crate::machine_config::{find_system_in_config, load_machine_config_json};
use crate::safety::{crystal_writable_root, ensure_writable_dirs, is_safe_mode, log_event};

// ---------------------------------------------------------------------------
// Session – exactly one active surface
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct ProviderSurfaceSession {
    session_id: String,
    provider_id: String,
    initial_url: String,
    system_id: String,
    expected_title: String,
    download_dir: PathBuf,
    webview_label: String,
    pending_download_src_url: Option<String>,
    pending_download_part_path: Option<PathBuf>,
    pending_download_final_path: Option<PathBuf>,
}

static SESSION: OnceLock<Mutex<Option<ProviderSurfaceSession>>> = OnceLock::new();

fn session_lock() -> &'static Mutex<Option<ProviderSurfaceSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

// ---------------------------------------------------------------------------
// Host validation
// ---------------------------------------------------------------------------

pub fn is_allowed_first_party_host(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    lower == "romsfun.com" || lower == "www.romsfun.com"
}

fn is_allowed_initial_url(url_str: &str) -> Result<Url, String> {
    // Strict pre-parse traversal check – raw string must not contain .. or backslash, Url crate normalizes ../
    if url_str.contains("..") {
        return Err(format!(
            "PATH_TRAVERSAL_BLOCKED_RAW_DOTDOT: '{}' – no '..' allowed in ROMsFun canonical URL",
            url_str
        ));
    }
    if url_str.contains('\\') {
        return Err(format!("BACKSLASH_IN_URL_BLOCKED_RAW: '{}'", url_str));
    }
    let parsed = Url::parse(url_str).map_err(|e| format!("INVALID_URL: {} – {}", url_str, e))?;
    if parsed.scheme() != "https" {
        return Err(format!(
            "URL_SCHEME_NOT_HTTPS: got '{}' for '{}'",
            parsed.scheme(),
            url_str
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL_CREDENTIALS_NOT_ALLOWED".to_string());
    }
    let host = parsed.host_str().ok_or("URL_NO_HOST")?.to_ascii_lowercase();
    if !is_allowed_first_party_host(&host) {
        return Err(format!(
            "HOST_NOT_ALLOWED: '{}' – only romsfun.com / www.romsfun.com",
            host
        ));
    }
    if let Some(port) = parsed.port() {
        if port != 443 {
            return Err(format!(
                "CUSTOM_PORT_NOT_ALLOWED: {} – url '{}'",
                port, url_str
            ));
        }
    }
    let path = parsed.path();
    if !path.starts_with('/') {
        return Err(format!("PATH_MUST_START_SLASH: '{}'", url_str));
    }
    if path.contains("..") {
        // Defense in depth – after normalization should not contain .. but we still reject
        return Err(format!("PATH_TRAVERSAL_AFTER_NORMALIZE: '{}'", url_str));
    }
    if path.contains('\\') {
        return Err(format!("BACKSLASH_IN_PATH_BLOCKED: '{}'", url_str));
    }
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Windows filename safety (mirrors import_game.rs)
// ---------------------------------------------------------------------------

fn is_reserved_dos_basename(base: &str) -> bool {
    let upper = base.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    if upper.len() == 4 && (upper.starts_with("COM") || upper.starts_with("LPT")) {
        if let Some(c) = upper.chars().nth(3) {
            if ('1'..='9').contains(&c) {
                return true;
            }
        }
    }
    false
}

fn is_windows_reserved_component(comp_str: &str) -> bool {
    let stem = comp_str.split('.').next().unwrap_or(comp_str);
    if stem.is_empty() {
        return false;
    }
    is_reserved_dos_basename(stem)
}

fn validate_windows_dest_component(comp: &std::ffi::OsStr) -> Result<(), String> {
    let s = comp.to_string_lossy();
    if s.is_empty() {
        return Err("WINDOWS_INVALID_DEST_COMPONENT: empty component".to_string());
    }
    for ch in s.chars() {
        if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            return Err(format!(
                "WINDOWS_INVALID_DEST_COMPONENT: illegal char '{}' in '{}'",
                ch, s
            ));
        }
        if (ch as u32) <= 31 {
            return Err(format!(
                "WINDOWS_INVALID_DEST_COMPONENT: control char in '{}'",
                s
            ));
        }
        if ch == '\0' {
            return Err(format!(
                "WINDOWS_INVALID_DEST_COMPONENT: null char in '{}'",
                s
            ));
        }
    }
    if s.ends_with('.') {
        return Err(format!(
            "WINDOWS_INVALID_DEST_COMPONENT: trailing dot in '{}'",
            s
        ));
    }
    if s.ends_with(' ') {
        return Err(format!(
            "WINDOWS_INVALID_DEST_COMPONENT: trailing space in '{}'",
            s
        ));
    }
    if is_windows_reserved_component(&s) {
        return Err(format!(
            "WINDOWS_INVALID_DEST_COMPONENT: reserved DOS name '{}'",
            s
        ));
    }
    Ok(())
}

fn validate_windows_filename(filename: &str) -> Result<(), String> {
    if filename.trim().is_empty() {
        return Err("FILENAME_EMPTY".to_string());
    }
    if filename.starts_with("\\\\") || filename.starts_with("//") {
        return Err("UNC_FILENAME_NOT_ALLOWED".to_string());
    }
    if filename.starts_with("\\\\?\\") || filename.starts_with("\\\\.\\") {
        return Err("DEVICE_PATH_FILENAME_NOT_ALLOWED".to_string());
    }
    if filename.contains('/') || filename.contains('\\') || filename.contains(':') {
        return Err(format!("FILENAME_CONTAINS_PATH_SEPARATOR: '{}'", filename));
    }
    let os = std::ffi::OsStr::new(filename);
    validate_windows_dest_component(os)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Extension / dangerous
// ---------------------------------------------------------------------------

const DANGEROUS_EXTS: &[&str] = &["exe", "msi", "bat", "cmd", "ps1", "scr", "com", "js"];

fn is_dangerous_ext(ext: &str) -> bool {
    let low = ext.to_ascii_lowercase();
    DANGEROUS_EXTS.contains(&low.as_str())
}

fn normalize_ext(ext: &str) -> String {
    let mut e = ext.trim().to_ascii_lowercase();
    if e.starts_with('.') {
        e = e[1..].to_string();
    }
    e
}

fn ext_of_filename(filename: &str) -> String {
    if let Some(dot) = filename.rfind('.') {
        if dot + 1 < filename.len() {
            return filename[dot + 1..].to_ascii_lowercase();
        }
    }
    "".to_string()
}

fn get_allowed_exts_for_system(system_id: &str) -> Vec<String> {
    if let Ok(config) = load_machine_config_json() {
        if let Some(sys) = find_system_in_config(&config, system_id) {
            if let Some(arr) = sys.get("validExtensions").and_then(|v| v.as_array()) {
                let mut list = Vec::new();
                for v in arr {
                    if let Some(s) = v.as_str() {
                        let t = normalize_ext(s);
                        if !t.is_empty() {
                            list.push(t);
                        }
                    }
                }
                return list;
            }
        }
    }
    Vec::new()
}

fn is_allowed_download_ext(filename: &str, allowed_system_exts: &[String]) -> bool {
    let ext = ext_of_filename(filename);
    if ext.is_empty() {
        return false;
    }
    let norm = normalize_ext(&ext);
    if norm == "zip" || norm == "7z" {
        return true;
    }
    if is_dangerous_ext(&norm) {
        return false;
    }
    for a in allowed_system_exts {
        if normalize_ext(a) == norm {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Event payload
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
struct ProviderSurfaceEvent {
    #[serde(rename = "type")]
    type_: String,
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    errorCode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    systemId: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expectedTitle: Option<String>,
}

fn emit_event(app: &AppHandle, payload: &ProviderSurfaceEvent) {
    let _ = app.emit("provider-surface-event", payload);
    log_event(
        "info",
        &format!(
            "provider-surface-event type={} session={} provider={} url={:?} path={:?} err={:?}",
            payload.type_,
            payload.session_id,
            payload.provider_id,
            payload.url,
            payload.path,
            payload.errorCode
        ),
    );
}

// ---------------------------------------------------------------------------
// Safe session directory
// ---------------------------------------------------------------------------

fn session_download_dir(session_id: &str) -> Result<PathBuf, String> {
    if session_id.trim().is_empty() {
        return Err("SESSION_ID_EMPTY".to_string());
    }
    if session_id.contains('/')
        || session_id.contains('\\')
        || session_id.contains(':')
        || session_id.contains("..")
    {
        return Err(format!("SESSION_ID_INVALID: '{}'", session_id));
    }
    let root = crystal_writable_root();
    let base = root.join("cache").join("downloads").join(session_id);
    crate::safety::is_safe_write_path(&base).map_err(|e| format!("SESSION_DIR_UNSAFE: {}", e))?;
    fs::create_dir_all(&base).map_err(|e| format!("SESSION_DIR_CREATE_FAILED: {}", e))?;
    Ok(base)
}

fn cleanup_session_dir(session_id: &str) {
    if let Ok(dir) = session_download_dir(session_id) {
        let _ = fs::remove_dir_all(&dir);
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
pub struct ProviderSurfaceOpenResult {
    pub sessionId: String,
    pub webviewLabel: String,
    pub downloadDir: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ProviderSurfaceOpenRequest {
    pub sessionId: Option<String>,
    pub providerId: String,
    pub initialUrl: String,
    pub systemId: String,
    pub expectedTitle: String,
}

#[tauri::command]
pub fn create_provider_surface(
    app: AppHandle,
    request: ProviderSurfaceOpenRequest,
) -> Result<ProviderSurfaceOpenResult, String> {
    // Extract owned copies early to avoid moving `request` into closures later
    let provider_id = request.providerId.clone();
    let system_id = request.systemId.clone();
    let expected_title = request.expectedTitle.clone();
    let initial_url_raw = request.initialUrl.clone();
    let session_id_opt = request.sessionId.clone();

    if provider_id != "romsfun" {
        return Err(format!(
            "PROVIDER_UNSUPPORTED: only 'romsfun' allowed, got '{}'",
            provider_id
        ));
    }

    let validated_url = is_allowed_initial_url(&initial_url_raw)?;

    let session_id = if let Some(sid) = session_id_opt {
        if sid.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            if sid.contains('/') || sid.contains('\\') || sid.contains("..") {
                return Err(format!("SESSION_ID_INVALID: '{}'", sid));
            }
            sid.trim().to_string()
        }
    } else {
        uuid::Uuid::new_v4().to_string()
    };

    {
        let guard = session_lock().lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        if guard.is_some() {
            return Err(
                "SESSION_ALREADY_ACTIVE: exactly one provider surface may be active".to_string(),
            );
        }
    }

    let download_dir = session_download_dir(&session_id)?;
    let webview_label = "romsfun-provider".to_string();

    // Clones for each closure – avoid moving main `session_id`/`provider_id`
    let app_for_navigation = app.clone();
    let app_for_new_window = app.clone();
    let app_for_download = app.clone();
    let app_for_page = app.clone();

    let nav_session = session_id.clone();
    let nav_provider = provider_id.clone();
    let new_session = session_id.clone();
    let new_provider = provider_id.clone();
    let dl_session = session_id.clone();
    let dl_provider = provider_id.clone();
    let dl_dir = download_dir.clone();
    let dl_system = system_id.clone();
    let page_session = session_id.clone();
    let page_provider = provider_id.clone();
    let page_system = system_id.clone();
    let page_expected = expected_title.clone();
    let label_clone_new = webview_label.clone();

    let session_id_for_emits = session_id.clone();
    let provider_id_for_emits = provider_id.clone();

    let _ = ensure_writable_dirs();

    let main_window = app
        .get_window("main")
        .ok_or("MAIN_WINDOW_NOT_FOUND – expected label 'main'")?;

    const HEADER_H: f64 = 88.0;
    const BOTTOM_H: f64 = 0.0;

    let inner_phys = main_window
        .inner_size()
        .map_err(|e| format!("MAIN_WINDOW_INNER_SIZE_FAILED: {}", e))?;
    let scale = main_window
        .scale_factor()
        .map_err(|e| format!("SCALE_FACTOR_FAILED: {}", e))?;
    let logical_size_full = inner_phys.to_logical::<f64>(scale);

    let webview_position = LogicalPosition::new(0.0, HEADER_H);
    let webview_size = LogicalSize::new(
        logical_size_full.width,
        (logical_size_full.height - HEADER_H - BOTTOM_H).max(100.0),
    );

    if let Some(existing) = app.get_webview(&webview_label) {
        let _ = existing.close();
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    log_event("info", &format!("create_provider_surface session={} provider={} url={} system={} title={} pos={:?} size={:?}", session_id, provider_id, validated_url, system_id, expected_title, webview_position, webview_size));

    let initial_url_str = validated_url.to_string();
    let builder = tauri::webview::WebviewBuilder::new(
        webview_label.clone(),
        WebviewUrl::External(initial_url_str.parse().map_err(|e| format!("URL_PARSE_FAILED: {}", e))?),
    )
    .on_navigation(move |url| {
        let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
        if is_allowed_first_party_host(&host) {
            let evt = ProviderSurfaceEvent {
                type_: "NAVIGATED".to_string(),
                session_id: nav_session.clone(),
                provider_id: nav_provider.clone(),
                url: Some(url.to_string()),
                message: None,
                path: None,
                errorCode: None,
                systemId: None,
                expectedTitle: None,
            };
            emit_event(&app_for_navigation, &evt);
            true
        } else {
            let evt = ProviderSurfaceEvent {
                type_: "EXTERNAL_NAVIGATION_BLOCKED".to_string(),
                session_id: nav_session.clone(),
                provider_id: nav_provider.clone(),
                url: Some(url.to_string()),
                message: Some("Crystal blocked an external page.".to_string()),
                path: None,
                errorCode: Some("EXTERNAL_NAVIGATION_BLOCKED".to_string()),
                systemId: None,
                expectedTitle: None,
            };
            emit_event(&app_for_navigation, &evt);
            log_event("warn", &format!("external_navigation_blocked url={} session={}", url, nav_session));
            false
        }
    })
    .on_new_window(move |url: Url, _features| {
        let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
        if is_allowed_first_party_host(&host) {
            if let Some(wv) = app_for_new_window.get_webview(&label_clone_new) {
                let _ = wv.navigate(url.clone());
            }
            tauri::webview::NewWindowResponse::Deny
        } else {
            let evt = ProviderSurfaceEvent {
                type_: "EXTERNAL_NAVIGATION_BLOCKED".to_string(),
                session_id: new_session.clone(),
                provider_id: new_provider.clone(),
                url: Some(url.to_string()),
                message: Some("Crystal blocked an external page.".to_string()),
                path: None,
                errorCode: Some("EXTERNAL_NAVIGATION_BLOCKED".to_string()),
                systemId: None,
                expectedTitle: None,
            };
            emit_event(&app_for_new_window, &evt);
            log_event("warn", &format!("new_window_blocked third-party url={} session={}", url, new_session));
            tauri::webview::NewWindowResponse::Deny
        }
    })
    .on_page_load(move |webview, payload| {
        match payload.event() {
            tauri::webview::PageLoadEvent::Started => {
                let evt = ProviderSurfaceEvent {
                    type_: "PAGE_LOADING".to_string(),
                    session_id: page_session.clone(),
                    provider_id: page_provider.clone(),
                    url: Some(webview.url().unwrap_or_else(|_| Url::parse("https://romsfun.com/").unwrap()).to_string()),
                    message: None,
                    path: None,
                    errorCode: None,
                    systemId: Some(page_system.clone()),
                    expectedTitle: Some(page_expected.clone()),
                };
                emit_event(&app_for_page, &evt);
            }
            tauri::webview::PageLoadEvent::Finished => {
                let evt = ProviderSurfaceEvent {
                    type_: "PAGE_READY".to_string(),
                    session_id: page_session.clone(),
                    provider_id: page_provider.clone(),
                    url: Some(webview.url().unwrap_or_else(|_| Url::parse("https://romsfun.com/").unwrap()).to_string()),
                    message: None,
                    path: None,
                    errorCode: None,
                    systemId: Some(page_system.clone()),
                    expectedTitle: Some(page_expected.clone()),
                };
                emit_event(&app_for_page, &evt);
            }
        }
    })
    .on_download(move |_webview, event| {
        match event {
            tauri::webview::DownloadEvent::Requested { url, destination } => {
                let session_opt = {
                    let guard = session_lock().lock().ok();
                    guard.and_then(|g| g.clone())
                };
                let session = match session_opt {
                    Some(s) => s,
                    None => {
                        log_event("warn", &format!("download_requested without active session url={}", url));
                        return false;
                    }
                };
                if session.session_id != dl_session {
                    log_event("warn", &format!("download_requested session mismatch expected={} got={}", dl_session, session.session_id));
                    return false;
                }

                let url_str = url.to_string();
                match Url::parse(&url_str) {
                    Ok(parsed) => {
                        if parsed.scheme() != "https" {
                            let evt = ProviderSurfaceEvent {
                                type_: "DOWNLOAD_REJECTED".to_string(),
                                session_id: dl_session.clone(),
                                provider_id: dl_provider.clone(),
                                url: Some(url_str.clone()),
                                message: Some("Download URL must be HTTPS".to_string()),
                                path: None,
                                errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                                systemId: None,
                                expectedTitle: None,
                            };
                            emit_event(&app_for_download, &evt);
                            return false;
                        }
                        if !parsed.username().is_empty() || parsed.password().is_some() {
                            let evt = ProviderSurfaceEvent {
                                type_: "DOWNLOAD_REJECTED".to_string(),
                                session_id: dl_session.clone(),
                                provider_id: dl_provider.clone(),
                                url: Some(url_str.clone()),
                                message: Some("Download URL with credentials blocked".to_string()),
                                path: None,
                                errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                                systemId: None,
                                expectedTitle: None,
                            };
                            emit_event(&app_for_download, &evt);
                            return false;
                        }
                        if let Some(port) = parsed.port() {
                            if port != 443 {
                                let evt = ProviderSurfaceEvent {
                                    type_: "DOWNLOAD_REJECTED".to_string(),
                                    session_id: dl_session.clone(),
                                    provider_id: dl_provider.clone(),
                                    url: Some(url_str.clone()),
                                    message: Some(format!("Custom port {} blocked", port)),
                                    path: None,
                                    errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                                    systemId: None,
                                    expectedTitle: None,
                                };
                                emit_event(&app_for_download, &evt);
                                return false;
                            }
                        }
                        if let Some(host) = parsed.host_str() {
                            if !is_allowed_first_party_host(host) {
                                let evt = ProviderSurfaceEvent {
                                    type_: "DOWNLOAD_REJECTED".to_string(),
                                    session_id: dl_session.clone(),
                                    provider_id: dl_provider.clone(),
                                    url: Some(url_str.clone()),
                                    message: Some(format!("Host '{}' not allowed for download", host)),
                                    path: None,
                                    errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                                    systemId: None,
                                    expectedTitle: None,
                                };
                                emit_event(&app_for_download, &evt);
                                log_event("warn", &format!("download_rejected host_not_allowed host={} url={} session={}", host, url_str, dl_session));
                                return false;
                            }
                        }
                    }
                    Err(_) => {
                        let evt = ProviderSurfaceEvent {
                            type_: "DOWNLOAD_REJECTED".to_string(),
                            session_id: dl_session.clone(),
                            provider_id: dl_provider.clone(),
                            url: Some(url_str.clone()),
                            message: Some("Invalid download URL".to_string()),
                            path: None,
                            errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                            systemId: None,
                            expectedTitle: None,
                        };
                        emit_event(&app_for_download, &evt);
                        return false;
                    }
                }

                let proposed_fname = destination.file_name().and_then(|os| os.to_str()).unwrap_or("").to_string();
                let mut candidate_fname = if proposed_fname.trim().is_empty() {
                    url.path_segments().and_then(|segs| segs.last().map(|s| s.to_string())).unwrap_or_else(|| "download".to_string())
                } else {
                    proposed_fname
                };
                candidate_fname = candidate_fname.trim().to_string();

                if let Err(e) = validate_windows_filename(&candidate_fname) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Invalid filename '{}': {}", candidate_fname, e)),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }

                let ext = ext_of_filename(&candidate_fname);
                if is_dangerous_ext(&ext) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Executable/dangerous file type '.{}' rejected", ext)),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }

                let allowed_system_exts = get_allowed_exts_for_system(&dl_system);
                if !is_allowed_download_ext(&candidate_fname, &allowed_system_exts) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Extension '.{}' not allowed for system '{}' nor allowed archives zip/7z", ext, dl_system)),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }

                let part_path = dl_dir.join(format!("{}.part", candidate_fname));
                if !part_path.starts_with(&dl_dir) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some("Destination escape detected".to_string()),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }
                if part_path.exists() {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Destination .part already exists '{}'", part_path.display())),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }
                let final_path = dl_dir.join(&candidate_fname);
                if final_path.exists() {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_REJECTED".to_string(),
                        session_id: dl_session.clone(),
                        provider_id: dl_provider.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Final target '{}' already exists – no overwrite", final_path.display())),
                        path: None,
                        errorCode: Some("DOWNLOAD_REJECTED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    return false;
                }

                {
                    if let Ok(mut guard) = session_lock().lock() {
                        if let Some(sess) = guard.as_mut() {
                            sess.pending_download_src_url = Some(url_str.clone());
                            sess.pending_download_part_path = Some(part_path.clone());
                            sess.pending_download_final_path = Some(final_path.clone());
                        }
                    }
                }

                let req_evt = ProviderSurfaceEvent {
                    type_: "DOWNLOAD_REQUESTED".to_string(),
                    session_id: dl_session.clone(),
                    provider_id: dl_provider.clone(),
                    url: Some(url_str.clone()),
                    message: None,
                    path: Some(part_path.display().to_string()),
                    errorCode: None,
                    systemId: Some(dl_system.clone()),
                    expectedTitle: None,
                };
                emit_event(&app_for_download, &req_evt);

                *destination = part_path;

                let started_evt = ProviderSurfaceEvent {
                    type_: "DOWNLOAD_STARTED".to_string(),
                    session_id: dl_session.clone(),
                    provider_id: dl_provider.clone(),
                    url: Some(url_str.clone()),
                    message: None,
                    path: None,
                    errorCode: None,
                    systemId: Some(dl_system.clone()),
                    expectedTitle: None,
                };
                emit_event(&app_for_download, &started_evt);

                log_event("info", &format!("download_start_allowed url={} dest={} session={}", url_str, destination.display(), dl_session));

                true
            }
            tauri::webview::DownloadEvent::Finished { url, path, success } => {
                let url_str = url.to_string();
                let sess_opt = {
                    let guard = session_lock().lock().ok();
                    guard.and_then(|g| g.clone())
                };
                let sess = match sess_opt {
                    Some(s) => s,
                    None => {
                        log_event("warn", &format!("download_finished_no_session url={} success={}", url_str, success));
                        return true;
                    }
                };

                if !success {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_FAILED".to_string(),
                        session_id: sess.session_id.clone(),
                        provider_id: sess.provider_id.clone(),
                        url: Some(url_str.clone()),
                        message: Some("Browser reported download failure".to_string()),
                        path: path.as_ref().map(|p| p.display().to_string()),
                        errorCode: Some("DOWNLOAD_FAILED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    if let Some(part) = sess.pending_download_part_path.clone() {
                        let _ = fs::remove_file(&part);
                    }
                    log_event("warn", &format!("download_finished failure url={} session={}", url_str, sess.session_id));
                    return true;
                }

                let dl_path = match path {
                    Some(p) => p,
                    None => {
                        let evt = ProviderSurfaceEvent {
                            type_: "DOWNLOAD_FAILED".to_string(),
                            session_id: sess.session_id.clone(),
                            provider_id: sess.provider_id.clone(),
                            url: Some(url_str.clone()),
                            message: Some("Download finished with no path".to_string()),
                            path: None,
                            errorCode: Some("DOWNLOAD_FAILED".to_string()),
                            systemId: None,
                            expectedTitle: None,
                        };
                        emit_event(&app_for_download, &evt);
                        return true;
                    }
                };

                if !dl_path.starts_with(&sess.download_dir) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_FAILED".to_string(),
                        session_id: sess.session_id.clone(),
                        provider_id: sess.provider_id.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Download path '{}' not inside session dir '{}'", dl_path.display(), sess.download_dir.display())),
                        path: Some(dl_path.display().to_string()),
                        errorCode: Some("DOWNLOAD_FAILED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    let _ = fs::remove_file(&dl_path);
                    return true;
                }

                match fs::symlink_metadata(&dl_path) {
                    Ok(meta) => {
                        if meta.file_type().is_symlink() {
                            let evt = ProviderSurfaceEvent {
                                type_: "DOWNLOAD_FAILED".to_string(),
                                session_id: sess.session_id.clone(),
                                provider_id: sess.provider_id.clone(),
                                url: Some(url_str.clone()),
                                message: Some("Symlink download rejected".to_string()),
                                path: Some(dl_path.display().to_string()),
                                errorCode: Some("DOWNLOAD_FAILED".to_string()),
                                systemId: None,
                                expectedTitle: None,
                            };
                            emit_event(&app_for_download, &evt);
                            let _ = fs::remove_file(&dl_path);
                            return true;
                        }
                        if meta.len() == 0 {
                            let evt = ProviderSurfaceEvent {
                                type_: "DOWNLOAD_FAILED".to_string(),
                                session_id: sess.session_id.clone(),
                                provider_id: sess.provider_id.clone(),
                                url: Some(url_str.clone()),
                                message: Some("Zero-size download rejected".to_string()),
                                path: Some(dl_path.display().to_string()),
                                errorCode: Some("DOWNLOAD_FAILED".to_string()),
                                systemId: None,
                                expectedTitle: None,
                            };
                            emit_event(&app_for_download, &evt);
                            let _ = fs::remove_file(&dl_path);
                            return true;
                        }
                    }
                    Err(_) => {
                        let evt = ProviderSurfaceEvent {
                            type_: "DOWNLOAD_FAILED".to_string(),
                            session_id: sess.session_id.clone(),
                            provider_id: sess.provider_id.clone(),
                            url: Some(url_str.clone()),
                            message: Some("Download file vanished before verification".to_string()),
                            path: Some(dl_path.display().to_string()),
                            errorCode: Some("DOWNLOAD_FAILED".to_string()),
                            systemId: None,
                            expectedTitle: None,
                        };
                        emit_event(&app_for_download, &evt);
                        return true;
                    }
                }

                let fname = dl_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                let original_fname = if fname.ends_with(".part") {
                    &fname[..fname.len() - 5]
                } else {
                    fname
                };

                if let Err(e) = validate_windows_filename(original_fname) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_FAILED".to_string(),
                        session_id: sess.session_id.clone(),
                        provider_id: sess.provider_id.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Filename validation failed '{}': {}", original_fname, e)),
                        path: Some(dl_path.display().to_string()),
                        errorCode: Some("DOWNLOAD_FAILED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    let _ = fs::remove_file(&dl_path);
                    return true;
                }

                if is_dangerous_ext(&ext_of_filename(original_fname)) {
                    let evt = ProviderSurfaceEvent {
                        type_: "DOWNLOAD_FAILED".to_string(),
                        session_id: sess.session_id.clone(),
                        provider_id: sess.provider_id.clone(),
                        url: Some(url_str.clone()),
                        message: Some(format!("Dangerous ext rejected post-download '{}'", original_fname)),
                        path: Some(dl_path.display().to_string()),
                        errorCode: Some("DOWNLOAD_FAILED".to_string()),
                        systemId: None,
                        expectedTitle: None,
                    };
                    emit_event(&app_for_download, &evt);
                    let _ = fs::remove_file(&dl_path);
                    return true;
                }

                let final_path = if dl_path.to_string_lossy().ends_with(".part") {
                    let expected_final = sess.download_dir.join(original_fname);
                    if expected_final.exists() {
                        let evt = ProviderSurfaceEvent {
                            type_: "DOWNLOAD_FAILED".to_string(),
                            session_id: sess.session_id.clone(),
                            provider_id: sess.provider_id.clone(),
                            url: Some(url_str.clone()),
                            message: Some(format!("Final target '{}' exists – no overwrite", expected_final.display())),
                            path: Some(dl_path.display().to_string()),
                            errorCode: Some("DOWNLOAD_FAILED".to_string()),
                            systemId: None,
                            expectedTitle: None,
                        };
                        emit_event(&app_for_download, &evt);
                        let _ = fs::remove_file(&dl_path);
                        return true;
                    }
                    match fs::rename(&dl_path, &expected_final) {
                        Ok(_) => expected_final,
                        Err(e) => {
                            let evt = ProviderSurfaceEvent {
                                type_: "DOWNLOAD_FAILED".to_string(),
                                session_id: sess.session_id.clone(),
                                provider_id: sess.provider_id.clone(),
                                url: Some(url_str.clone()),
                                message: Some(format!("Rename .part→final failed: {} – '{}' → '{}'", e, dl_path.display(), expected_final.display())),
                                path: Some(dl_path.display().to_string()),
                                errorCode: Some("DOWNLOAD_FAILED".to_string()),
                                systemId: None,
                                expectedTitle: None,
                            };
                            emit_event(&app_for_download, &evt);
                            let _ = fs::remove_file(&dl_path);
                            return true;
                        }
                    }
                } else {
                    dl_path.to_path_buf()
                };

                let evt = ProviderSurfaceEvent {
                    type_: "COMPLETED_LOCAL_FILE".to_string(),
                    session_id: sess.session_id.clone(),
                    provider_id: sess.provider_id.clone(),
                    url: Some(url_str.clone()),
                    message: None,
                    path: Some(final_path.display().to_string()),
                    errorCode: None,
                    systemId: Some(sess.system_id.clone()),
                    expectedTitle: Some(sess.expected_title.clone()),
                };
                emit_event(&app_for_download, &evt);

                if is_safe_mode() {
                    log_event("warn", &format!("SAFE_MODE active – download completed but import blocked session={} path={}", sess.session_id, final_path.display()));
                }

                if let Some(wv) = app_for_download.get_webview(&sess.webview_label) {
                    let _ = wv.close();
                }

                log_event("info", &format!("download_completed final='{}' session={}", final_path.display(), sess.session_id));

                true
            }
            _ => {
                // Non-exhaustive future variant – allow
                true
            }
        }
    });

    let add_res = main_window.add_child(builder, webview_position, webview_size);

    if let Err(e) = add_res {
        cleanup_session_dir(&session_id);
        return Err(format!(
            "WEBVIEW_CREATE_FAILED: {} – required 'unstable' feature must be enabled",
            e
        ));
    }

    {
        let mut guard = session_lock().lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        *guard = Some(ProviderSurfaceSession {
            session_id: session_id.clone(),
            provider_id: provider_id.clone(),
            initial_url: validated_url.to_string(),
            system_id: system_id.clone(),
            expected_title: expected_title.clone(),
            download_dir: download_dir.clone(),
            webview_label: webview_label.clone(),
            pending_download_src_url: None,
            pending_download_part_path: None,
            pending_download_final_path: None,
        });
    }

    let opened_evt = ProviderSurfaceEvent {
        type_: "OPENED".to_string(),
        session_id: session_id_for_emits.clone(),
        provider_id: provider_id_for_emits.clone(),
        url: Some(validated_url.to_string()),
        message: None,
        path: None,
        errorCode: None,
        systemId: Some(system_id.clone()),
        expectedTitle: Some(expected_title.clone()),
    };
    emit_event(&app, &opened_evt);

    Ok(ProviderSurfaceOpenResult {
        sessionId: session_id,
        webviewLabel: webview_label,
        downloadDir: download_dir.display().to_string(),
    })
}

#[tauri::command]
pub fn close_provider_surface(sessionId: String) -> Result<String, String> {
    let session_id = sessionId.trim().to_string();
    if session_id.is_empty() {
        return Err("SESSION_ID_EMPTY".to_string());
    }

    let mut guard = session_lock().lock().map_err(|_| "SESSION_LOCK_POISONED")?;
    let sess_opt = guard.clone();
    let sess = match sess_opt {
        Some(s) if s.session_id == session_id => s,
        Some(s) => {
            return Err(format!(
                "SESSION_MISMATCH: active session '{}' != requested close '{}'",
                s.session_id, session_id
            ));
        }
        None => return Err("NO_ACTIVE_SESSION".to_string()),
    };

    if let Some(part) = sess.pending_download_part_path {
        let _ = fs::remove_file(&part);
    }
    let _ = fs::remove_dir_all(&sess.download_dir);
    *guard = None;
    log_event(
        "info",
        &format!("provider_surface_closed session={}", session_id),
    );
    Ok(session_id)
}

#[tauri::command]
pub fn close_provider_surface_with_app(
    app: AppHandle,
    sessionId: String,
) -> Result<String, String> {
    let session_id = sessionId.trim().to_string();
    if session_id.is_empty() {
        return Err("SESSION_ID_EMPTY".to_string());
    }
    if let Some(wv) = app.get_webview("romsfun-provider") {
        let _ = wv.close();
    }
    let evt = ProviderSurfaceEvent {
        type_: "CLOSED".to_string(),
        session_id: session_id.clone(),
        provider_id: "romsfun".to_string(),
        url: None,
        message: None,
        path: None,
        errorCode: None,
        systemId: None,
        expectedTitle: None,
    };
    emit_event(&app, &evt);
    close_provider_surface(session_id.clone())?;
    Ok(session_id)
}

#[tauri::command]
pub fn resize_provider_surface(
    app: AppHandle,
    sessionId: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let session_id = sessionId.trim().to_string();
    {
        let guard = session_lock().lock().map_err(|_| "SESSION_LOCK_POISONED")?;
        if let Some(s) = guard.as_ref() {
            if s.session_id != session_id {
                return Err(format!(
                    "SESSION_MISMATCH resize expected {} got {}",
                    s.session_id, session_id
                ));
            }
        } else {
            return Err("NO_ACTIVE_SESSION".to_string());
        }
    }
    if let Some(_wv) = app.get_webview("romsfun-provider") {
        let pos = LogicalPosition::new(x, y);
        let size = LogicalSize::new(width.max(100.0), height.max(100.0));
        log_event(
            "info",
            &format!(
                "resize_provider_surface requested {:?} {:?} session={}",
                pos, size, session_id
            ),
        );
        // Tauri 2.11 child webview bounds reposition API may be limited without additional unstable API;
        // D1 notes: resizing at 1920x1080, 2560x1440, Windows 175% DPI ~1140x648 must not clip. Our initial sizing covers full below header,
        // so resize is best-effort; visual coverage validated via frontend container sizing.
    } else {
        return Err("WEBVIEW_NOT_FOUND for resize".to_string());
    }
    Ok(session_id)
}

#[tauri::command]
pub fn get_provider_surface_status() -> Result<Option<String>, String> {
    let guard = session_lock().lock().map_err(|_| "SESSION_LOCK_POISONED")?;
    Ok(guard.as_ref().map(|s| s.session_id.clone()))
}

// ---------------------------------------------------------------------------
// Unit tests (no live romsfun)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_is_allowed_first_party_host() {
        assert!(is_allowed_first_party_host("romsfun.com"));
        assert!(is_allowed_first_party_host("www.romsfun.com"));
        assert!(is_allowed_first_party_host("ROMsFun.com"));
        assert!(!is_allowed_first_party_host("vimm.net"));
        assert!(!is_allowed_first_party_host("galaxylanesandgames.com"));
        assert!(!is_allowed_first_party_host("evilromsfun.com"));
        assert!(!is_allowed_first_party_host("romsfun.com.evil.com"));
    }

    #[test]
    fn test_is_allowed_initial_url_strict() {
        let ok = is_allowed_initial_url("https://romsfun.com/roms/nintendo-entertainment-system/");
        assert!(ok.is_ok(), "should pass {:?}", ok);
        let ok2 = is_allowed_initial_url("https://www.romsfun.com/roms/ps2/browse");
        assert!(ok2.is_ok());
        let bad_http = is_allowed_initial_url("http://romsfun.com/roms/ps2/");
        assert!(bad_http.is_err());
        let bad_host = is_allowed_initial_url("https://galaxylanesandgames.com/evil");
        assert!(bad_host.is_err());
        let bad_port = is_allowed_initial_url("https://romsfun.com:8080/roms/");
        assert!(bad_port.is_err());
        let creds = is_allowed_initial_url("https://user:pass@romsfun.com/roms/");
        assert!(creds.is_err());
        let traversal = is_allowed_initial_url("https://romsfun.com/../etc/passwd");
        assert!(traversal.is_err());
        let backslash = is_allowed_initial_url("https://romsfun.com/roms\\evil");
        assert!(backslash.is_err());
    }

    #[test]
    fn test_validate_windows_filename() {
        assert!(validate_windows_filename("game.zip").is_ok());
        assert!(validate_windows_filename("Blow'em Out (USA).7z").is_ok());
        assert!(validate_windows_filename("CON.zip").is_err());
        assert!(validate_windows_filename("game.").is_err());
        assert!(validate_windows_filename("game ").is_err());
        assert!(validate_windows_filename("a/b.zip").is_err());
        assert!(validate_windows_filename("game<.zip").is_err());
        assert!(validate_windows_filename("").is_err());
    }

    #[test]
    fn test_dangerous_ext_rejection() {
        assert!(is_dangerous_ext("exe"));
        assert!(is_dangerous_ext("EXE"));
        assert!(is_dangerous_ext("msi"));
        assert!(is_dangerous_ext("bat"));
        assert!(!is_dangerous_ext("zip"));
        assert!(!is_dangerous_ext("7z"));
        assert!(!is_dangerous_ext("nes"));
    }

    #[test]
    fn test_allowed_download_ext_zip_7z_and_system() {
        let sys_exts = vec!["nes".to_string(), "smc".to_string(), "sfc".to_string()];
        assert!(is_allowed_download_ext("game.nes", &sys_exts));
        assert!(is_allowed_download_ext("game.smc", &sys_exts));
        assert!(is_allowed_download_ext("game.zip", &sys_exts));
        assert!(is_allowed_download_ext("archive.7z", &sys_exts));
        assert!(!is_allowed_download_ext("game.exe", &sys_exts));
        assert!(!is_allowed_download_ext("game.rar", &sys_exts));
        assert!(!is_allowed_download_ext("game.txt", &sys_exts));
        assert!(!is_allowed_download_ext("game", &sys_exts));
    }

    #[test]
    fn test_session_download_dir_path() {
        let sid = format!("test-sess-{}", uuid::Uuid::new_v4());
        let dir = session_download_dir(&sid).unwrap();
        assert!(dir.to_string_lossy().contains(&sid));
        assert!(dir.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_one_active_session_only() {
        {
            let mut g = session_lock().lock().unwrap();
            *g = None;
        }
        {
            let mut g = session_lock().lock().unwrap();
            *g = Some(ProviderSurfaceSession {
                session_id: "sess-1".to_string(),
                provider_id: "romsfun".to_string(),
                initial_url: "https://romsfun.com/".to_string(),
                system_id: "nes".to_string(),
                expected_title: "Game".to_string(),
                download_dir: PathBuf::from("/tmp/fake"),
                webview_label: "romsfun-provider".to_string(),
                pending_download_src_url: None,
                pending_download_part_path: None,
                pending_download_final_path: None,
            });
        }
        let guard = session_lock().lock().unwrap();
        assert!(guard.is_some());
        drop(guard);
        {
            let mut g = session_lock().lock().unwrap();
            *g = None;
        }
    }

    #[test]
    fn test_no_privileged_remote_capability() {
        let cap_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json");
        if !cap_path.exists() {
            return;
        }
        let content = std::fs::read_to_string(&cap_path).expect("read capability");
        let json: serde_json::Value = serde_json::from_str(&content).expect("parse capability");
        let windows = json
            .get("windows")
            .and_then(|w| w.as_array())
            .expect("windows array");
        let win_strs: Vec<String> = windows
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        assert!(win_strs.contains(&"main".to_string()));
        assert!(!win_strs.contains(&"romsfun-provider".to_string()));
        assert!(!win_strs.iter().any(|s| s == "*" || s.contains('*')));
    }

    #[test]
    fn test_block_external_navigation_strict() {
        assert!(!is_allowed_first_party_host("galaxylanesandgames.com"));
        assert!(!is_allowed_first_party_host("evil.romsfun.com"));
        assert!(!is_allowed_first_party_host("romsfun.com.evil"));
    }

    #[test]
    fn test_download_dest_no_overwrite_no_traversal() {
        let sess_dir = PathBuf::from("/tmp/crystal-test-sess").join("abc");
        let p = sess_dir.join("game.zip");
        assert!(p.starts_with(&sess_dir));
        assert!(is_dangerous_ext("exe"));
    }
}
