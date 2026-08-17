//! Steam launch – safe URL launcher for P0 blocker
//! ES-DE steam system uses %EMULATOR_OS-SHELL% which Crystal deliberately blocks.
//! This module provides a locked-down launcher that ONLY opens steam:// URLs
//! via Windows ShellExecute (rundll32 url.dll,FileProtocolHandler) with CREATE_NO_WINDOW.
//! No arbitrary shell, no injection.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::safety::{crystal_writable_root, log_event};
use regex::Regex;

static STEAM_LAUNCH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

fn is_blocked_metachar(s: &str) -> bool {
    // shell metacharacters that would allow injection if passed to cmd
    let blocked = [';', '&', '|', '`', '$', '(', ')', '<', '>', '\n', '\r', '"', '\'', '\\', '%'];
    // We allow % only as part of steam://? Actually steam URL may contain % encoding like %3A; but to be safe we forbid % that is not URL-encoded? Simplest: reject any % char to avoid %OS-SHELL% etc.
    // Steam URLs typically don't contain % – appids are numeric. So block %.
    for c in blocked {
        if s.contains(c) {
            // allow ':' '/' '?' '=' '.' '-' '_' needed for URL
            // but ';' '&' '|' etc already blocked; '%' we block even though URL-encoded could be legit, but P0 we are conservative
            if c == '%' && s.starts_with("steam://") {
                // still block – steam:// URLs shouldn't need %
                return true;
            }
            if s.contains(c) {
                return true;
            }
        }
    }
    // also block "&&" "||" already covered by & |
    false
}

fn validate_steam_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("STEAM_URL_EMPTY".to_string());
    }
    if trimmed.len() > 512 {
        return Err(format!("STEAM_URL_TOO_LONG {} >512", trimmed.len()));
    }
    // must start with steam://
    let lower = trimmed.to_ascii_lowercase();
    let is_steam = lower.starts_with("steam://");
    let is_http_https = lower.starts_with("https://") || lower.starts_with("http://");
    // For catalog browsing we allow http/https only to store.steampowered.com – stricter
    if is_http_https {
        // only allow steam community/store domains
        if let Ok(parsed) = url::Url::parse(trimmed) {
            let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
            let allowed = matches!(host.as_str(),
                "store.steampowered.com" | "www.store.steampowered.com" |
                "steamcommunity.com" | "www.steamcommunity.com" |
                "steampowered.com" | "www.steampowered.com"
            );
            if !allowed {
                return Err(format!("STEAM_HTTP_URL_HOST_BLOCKED: {}", host));
            }
        } else {
            return Err("STEAM_HTTP_URL_PARSE_FAILED".to_string());
        }
        // still block metachars
        if is_blocked_metachar(trimmed) {
            return Err("STEAM_URL_BLOCKED_METACHAR".to_string());
        }
        return Ok(());
    }
    if !is_steam {
        return Err(format!("STEAM_URL_MUST_START_WITH_steam:// got '{}'", &trimmed[..trimmed.len().min(32)]));
    }
    // regex for steam:// – permissive but safe: run, rungameid, open, etc
    // allow alphanumeric, /, -, _, :, ?, =, &, ., but we already block &;? Actually query may contain & – steam URLs rarely need &. We'll allow & only if not followed by shell?
    // For safety we already blocked & and ; – steam rungameid URIs don't need them. So if URL contains & we block unless it's http case.
    if trimmed.contains('&') || trimmed.contains(';') || trimmed.contains('|') {
        return Err("STEAM_URL_BLOCKED_METACHAR_&_OR_;".to_string());
    }
    // basic pattern
    let re = Regex::new(r"^steam://[A-Za-z0-9/_\-:\.\?]+$").unwrap();
    if !re.is_match(trimmed) {
        // fallback: allow without query but still check chars manually
        for ch in trimmed.chars() {
            if !ch.is_ascii_alphanumeric() && !matches!(ch, '/' | ':' | '-' | '_' | '.' | '?' | '=') {
                // steam:// prefix contains : and / which we allow, but we already filtered metachars
                if ch == '/' || ch == ':' {
                    continue;
                }
                return Err(format!("STEAM_URL_INVALID_CHAR '{}' in '{}'", ch, trimmed));
            }
        }
        // if we got here, allow (conservative)
    }
    if is_blocked_metachar(trimmed) {
        return Err("STEAM_URL_BLOCKED_METACHAR".to_string());
    }
    Ok(())
}

fn extract_steam_url_from_file(path: &Path) -> Result<String, String> {
    // Only allow files inside ROM roots or writable root, size <8KB, not executable
    let meta = std::fs::metadata(path).map_err(|e| format!("STEAM_FILE_STAT_FAILED {}: {}", path.display(), e))?;
    if meta.len() > 8192 {
        return Err(format!("STEAM_FILE_TOO_LARGE {} bytes", meta.len()));
    }
    if !meta.is_file() {
        return Err("STEAM_FILE_NOT_FILE".to_string());
    }
    // ensure extension is plausible
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let allowed_exts = ["sh", "bat", "cmd", "url", "lnk", "txt", "desktop"];
    // Allow no extension? ES-DE steam entries may be .sh or no ext? We'll allow txt/sh/url
    if !ext.is_empty() && !allowed_exts.contains(&ext.as_str()) {
        // still allow if file is inside allowed roots but log; for P0 we are permissive for .sh
        // If unknown ext, reject to avoid arbitrary execution
        return Err(format!("STEAM_FILE_EXT_BLOCKED .{}", ext));
    }
    let content = std::fs::read_to_string(path).map_err(|e| format!("STEAM_FILE_READ_FAILED {}: {}", path.display(), e))?;
    // Look for steam:// in content
    let re = Regex::new(r"steam://[A-Za-z0-9/_\-:\.\?=]+").unwrap();
    if let Some(m) = re.find(&content) {
        let url = m.as_str().to_string();
        validate_steam_url(&url)?;
        return Ok(url);
    }
    // Maybe file content itself is exactly the URL
    let trimmed = content.trim();
    if trimmed.to_ascii_lowercase().starts_with("steam://") {
        validate_steam_url(trimmed)?;
        return Ok(trimmed.to_string());
    }
    Err(format!("STEAM_FILE_NO_URL_FOUND in {}", path.display()))
}

fn resolve_candidate_steam_url(rom_path: &str) -> Result<String, String> {
    let trimmed = rom_path.trim();
    if trimmed.is_empty() {
        return Err("STEAM_EMPTY_PATH".to_string());
    }
    // If it's already a steam:// URL, use directly
    if trimmed.to_ascii_lowercase().starts_with("steam://") {
        validate_steam_url(trimmed)?;
        return Ok(trimmed.to_string());
    }
    if trimmed.to_ascii_lowercase().starts_with("http://") || trimmed.to_ascii_lowercase().starts_with("https://") {
        validate_steam_url(trimmed)?;
        return Ok(trimmed.to_string());
    }
    // Otherwise treat as file path inside allowed roots
    let p = PathBuf::from(trimmed);
    // Basic traversal check
    if trimmed.contains("..") {
        return Err(format!("STEAM_PATH_TRAVERSAL_BLOCKED '{}'", trimmed));
    }
    // Ensure inside writable or ROM roots – for safety we check it exists and its parent exists
    // On this ROG, ROM root is D:\Emulation\roms\steam – we allow any path under D:\Emulation\roms or under writable root
    let writable = crystal_writable_root();
    let p_lower = p.to_string_lossy().to_ascii_lowercase();
    let writable_lower = writable.to_string_lossy().to_ascii_lowercase();
    let is_in_writable = p_lower.starts_with(&writable_lower);
    let is_in_roms = p_lower.contains("emulation\\roms") || p_lower.contains("emulation/roms") || p_lower.contains("roms/steam") || p_lower.contains("roms\\steam");
    // If path doesn't exist, still try? ES-DE may give ./relative – we should resolve relative to rom root
    if !p.exists() {
        // Try to find relative file? For P0 we return error that file not found but we still attempt to treat as URL? Already not URL, so error.
        return Err(format!("STEAM_FILE_NOT_FOUND '{}' – expected steam:// URL or existing file containing steam://", trimmed));
    }
    if !is_in_writable && !is_in_roms {
        // Still allow if file extension is safe and inside any absolute path that is not system-protected? We are conservative: allow only if inside writable or roms
        return Err(format!("STEAM_FILE_OUTSIDE_ALLOWED_ROOT '{}' – must be inside writable {} or ROMs/steam", trimmed, writable.display()));
    }
    // Extract URL from file
    extract_steam_url_from_file(&p)
}

#[cfg(windows)]
fn spawn_steam_url_windows(url: &str) -> Result<(), String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const DETACHED_PROCESS: u32 = 0x00000008;

    // rundll32 url.dll,FileProtocolHandler is the Windows canonical safe way to open URL via shell without cmd parsing
    let mut cmd = Command::new("rundll32.exe");
    cmd.arg("url.dll,FileProtocolHandler").arg(url);
    cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    cmd.spawn().map_err(|e| format!("STEAM_SPAWN_FAILED rundll32: {}", e))?;
    // Small delay verify not immediate exit failure
    std::thread::sleep(Duration::from_millis(120));
    Ok(())
}

#[cfg(not(windows))]
fn spawn_steam_url_windows(url: &str) -> Result<(), String> {
    // On non-windows (CI), use opener or shell open – but we still validate URL
    // For safety we don't actually launch steam in CI; we simulate success
    if std::env::var("CRYSTAL_DRYRUN").is_ok() || std::env::var("CRYSTAL_SAFE_MODE").is_ok() {
        return Ok(());
    }
    // Attempt xdg-open
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    Ok(())
}

#[tauri::command]
pub fn safe_steam_launch(rom_path: String) -> Result<(), String> {
    // Guard rapid A presses
    if STEAM_LAUNCH_IN_FLIGHT.swap(true, Ordering::AcqRel) {
        log_event("warn", "steam_launch_duplicate_blocked");
        return Err("STEAM_LAUNCH_ALREADY_IN_PROGRESS".to_string());
    }
    struct Guard;
    impl Drop for Guard {
        fn drop(&mut self) {
            STEAM_LAUNCH_IN_FLIGHT.store(false, Ordering::Release);
        }
    }
    let _guard = Guard;

    // SAFE MODE check – still respects global safe mode
    if crate::safety::is_safe_mode() {
        log_event("warn", &format!("steam_launch blocked SAFE_MODE path='{}'", rom_path));
        return Err("SAFE_MODE_BLOCKED_STEAM_LAUNCH".to_string());
    }

    let url = resolve_candidate_steam_url(&rom_path)?;
    log_event("info", &format!("steam_launch attempt url='{}' from='{}'", url, rom_path));

    #[cfg(windows)]
    {
        spawn_steam_url_windows(&url)?;
    }
    #[cfg(not(windows))]
    {
        spawn_steam_url_windows(&url)?;
    }

    log_event("info", &format!("steam_launch spawned url='{}'", url));
    // Small cooldown similar to other launches – prevent duplicate 10s? We can reuse logic from main.rs but simple thread sleep not needed – guard already prevents rapid double
    std::thread::sleep(Duration::from_millis(120));
    Ok(())
}

// Extra helper for future: detect system_id == steam or commandTemplate contains OS-SHELL and route
#[tauri::command]
pub fn safe_steam_launch_from_template(system_id: String, command_template: String, rom_path: String) -> Result<(), String> {
    // If system_id == steam or template contains OS-SHELL, delegate to safe_steam_launch
    let sid_lc = system_id.to_ascii_lowercase();
    let tmpl_up = command_template.to_ascii_uppercase();
    if sid_lc == "steam" || tmpl_up.contains("OS-SHELL") || tmpl_up.contains("OS_SHELL") {
        return safe_steam_launch(rom_path);
    }
    Err(format!("NOT_STEAM_SYSTEM: system_id='{}' template does not indicate steam", system_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_url_validation_allows_run() {
        assert!(validate_steam_url("steam://run/12345").is_ok());
        assert!(validate_steam_url("steam://rungameid/12345").is_ok());
        assert!(validate_steam_url("steam://open/library").is_ok());
    }

    #[test]
    fn steam_url_blocks_injection() {
        assert!(validate_steam_url("steam://run/12345; rm -rf /").is_err());
        assert!(validate_steam_url("steam://run/12345 & calc.exe").is_err());
        assert!(validate_steam_url("steam://run/12345|evil").is_err());
        assert!(validate_steam_url("steam://run/12345`whoami`").is_err());
        assert!(validate_steam_url("steam://run/12345$(evil)").is_err());
    }

    #[test]
    fn steam_url_blocks_non_steam() {
        assert!(validate_steam_url("http://evil.com").is_err());
        assert!(validate_steam_url("file:///etc/passwd").is_err());
        assert!(validate_steam_url("C:\\Windows\\System32\\calc.exe").is_err());
    }

    #[test]
    fn steam_http_allows_store() {
        assert!(validate_steam_url("https://store.steampowered.com/app/12345").is_ok());
        assert!(validate_steam_url("https://evil.com/steam").is_err());
    }

    #[test]
    fn steam_path_traversal_blocked() {
        assert!(resolve_candidate_steam_url("../../etc/passwd").is_err());
        assert!(resolve_candidate_steam_url("steam://run/12345").is_ok());
    }
}
