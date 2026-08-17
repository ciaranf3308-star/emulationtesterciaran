use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Global SAFE MODE flag – set at startup from env, checked at runtime.
static SAFE_MODE: AtomicBool = AtomicBool::new(false);

/// Initialise SAFE_MODE from environment once. Idempotent.
pub fn init_safe_mode_from_env() -> bool {
    let enabled = match std::env::var("CRYSTAL_SAFE_MODE") {
        Ok(v) => {
            let low = v.trim().to_ascii_lowercase();
            low == "1" || low == "true" || low == "yes" || low == "on"
        }
        Err(_) => false,
    };
    SAFE_MODE.store(enabled, Ordering::SeqCst);
    enabled
}

/// Check if SAFE MODE is active.
///
/// Priority:
///  1. env var live (covers tests / late set)
///  2. cached static set at startup
pub fn is_safe_mode() -> bool {
    // Live env check – allows `CRYSTAL_SAFE_MODE=1 cargo test` without init call
    if let Ok(v) = std::env::var("CRYSTAL_SAFE_MODE") {
        let low = v.trim().to_ascii_lowercase();
        if low == "1" || low == "true" || low == "yes" || low == "on" {
            return true;
        }
        // If env explicitly disables (0/false/no/off/empty), fall through to cached
        // to allow programmatic disabling, but env true always wins.
        if low == "0" || low == "false" || low == "no" || low == "off" {
            // respect explicit false only if cache is also false – otherwise env false overrides? We treat false as override to allow toggling.
            // To keep simple: if cache was true from init, env false should disable? We will let env false disable.
            // So if we reach here cache may still be true; return false only if env says false AND we want env to win. We'll return cached value only when env is absent.
            // Actually re-evaluate: safe mode should be sticky once true for security, but spec says env var check each call. So we honour env falsy as falsy only when cache also falsy.
            // Simpler: if env is set and not truthy, return cached? Let's implement: truthy env => true, otherwise use cached.
            // That matches "static cache at startup" semantics.
            return SAFE_MODE.load(Ordering::SeqCst);
        }
    }
    SAFE_MODE.load(Ordering::SeqCst)
}

// ---------- Writable Root ----------

#[cfg(test)]
static TEST_WRITABLE_ROOT_OVERRIDE: std::sync::OnceLock<std::sync::Mutex<Option<PathBuf>>> =
    std::sync::OnceLock::new();

#[cfg(test)]
fn test_writable_root_mutex() -> &'static std::sync::Mutex<Option<PathBuf>> {
    TEST_WRITABLE_ROOT_OVERRIDE.get_or_init(|| std::sync::Mutex::new(None))
}

#[cfg(test)]
pub(crate) fn set_test_writable_root_override<P: Into<PathBuf>>(p: P) {
    let m = test_writable_root_mutex();
    if let Ok(mut g) = m.lock() {
        *g = Some(p.into());
    }
}

#[cfg(test)]
pub(crate) fn clear_test_writable_root_override() {
    let m = test_writable_root_mutex();
    if let Ok(mut g) = m.lock() {
        *g = None;
    }
}

#[cfg(test)]
pub(crate) fn get_test_writable_root_override() -> Option<PathBuf> {
    if let Some(m) = TEST_WRITABLE_ROOT_OVERRIDE.get() {
        if let Ok(g) = m.lock() {
            return g.clone();
        }
    }
    None
}

/// Returns %LOCALAPPDATA%\CrystalFrontend on Windows (via LOCALAPPDATA env),
/// otherwise dirs::data_local_dir()/CrystalFrontend,
/// fallback $HOME/.local/share/CrystalFrontend.
pub fn crystal_writable_root() -> PathBuf {
    #[cfg(test)]
    {
        if let Some(ov) = get_test_writable_root_override() {
            return ov;
        }
    }
    if let Ok(configured) = std::env::var("CRYSTAL_DATA_ROOT") {
        let trimmed = configured.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // This ROG installation keeps its emulation library on D:. Prefer the
    // dedicated Crystal data directory there when that drive is mounted.
    let d_root = PathBuf::from(r"D:\CrystalFrontend");
    if Path::new(r"D:\").exists() {
        return d_root;
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let trimmed = local.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("CrystalFrontend");
        }
    }
    if let Some(dir) = dirs::data_local_dir() {
        return dir.join("CrystalFrontend");
    }
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("CrystalFrontend");
        }
    }
    // Last resort – relative to exe cwd (still safe-checked via descendant rule)
    PathBuf::from("CrystalFrontend")
}

/// Ensure config/cache/logs/state exist inside writable root only.
pub fn ensure_writable_dirs() -> Result<PathBuf, String> {
    let root = crystal_writable_root();
    // create root
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create writable root '{}': {}", root.display(), e))?;
    for sub in &["config", "cache", "logs", "state"] {
        let p = root.join(sub);
        // Security: only create inside root – lexical check is inherent because we join.
        std::fs::create_dir_all(&p)
            .map_err(|e| format!("Failed to create '{}': {}", p.display(), e))?;
    }
    Ok(root)
}

// ---------- Safe write guard ----------

/// Validate a path is safe to write – must be descendant of writable root.
///
/// Rejects:
/// - empty
/// - ParentDir components (`..`)
/// - drive root (`C:\`, `C:`, `/`)
/// - absolute outside writable root
/// - relative paths with traversal or drive-relative patterns
pub fn is_safe_write_path(path: &Path) -> Result<(), String> {
    let raw = path.to_string_lossy();
    let s = raw.trim();
    if s.is_empty() {
        return Err("Empty path – refusing write".to_string());
    }

    // Drive / root guard
    if s == "/" || s == "\\" || s == "." {
        return Err(format!(
            "Refusing to write to filesystem root / current dir marker '{}'",
            s
        ));
    }
    // Windows drive root patterns: "C:", "C:\", "C:/", "D:", etc.
    if s.len() == 2
        && s.chars()
            .next()
            .map(|c| c.is_ascii_alphabetic())
            .unwrap_or(false)
        && s.chars().nth(1) == Some(':')
    {
        return Err(format!("Refusing drive root '{}'", s));
    }
    if s.len() == 3
        && s.chars()
            .next()
            .map(|c| c.is_ascii_alphabetic())
            .unwrap_or(false)
        && s.chars().nth(1) == Some(':')
        && (s.chars().nth(2) == Some('\\') || s.chars().nth(2) == Some('/'))
    {
        return Err(format!("Refusing drive root '{}'", s));
    }

    // Component traversal check
    for comp in path.components() {
        if let Component::ParentDir = comp {
            return Err(format!(
                "Path '{}' contains '..' traversal – write blocked",
                path.display()
            ));
        }
    }

    // Also quick string traversal defense (covers `foo/../bar` that components already catches, plus `..` embedded with separators)
    let lower_raw = s.to_ascii_lowercase();
    if lower_raw.contains("..") {
        // If any ".." remains after component check, it's still suspicious (e.g., part of filename? we disallow any ".." for safety)
        // Allow legitimate names containing ".." ??? safer to reject.
        // Check components already rejected ParentDir, but to avoid bypass like "a..b" is okay – however spec says reject contains ".." segments.
        // We already rejected ParentDir; to be spec compliant, we also reject any segment exactly "..".
        // For extra safety, if ".." appears as path separator context we already rejected. Keep behaviour: reject only when it is a traversal.
        // So we will not reject "my..file.txt" – but spec says check lowercased checks for traversal attempts.
        // To avoid false positive, only reject if Path components saw ParentDir (already done). So we skip pure substring reject here.
    }

    let root = crystal_writable_root();
    let root_str_lc = root.to_string_lossy().to_ascii_lowercase();
    let path_str_lc = path.to_string_lossy().to_ascii_lowercase();

    if path.is_absolute() {
        // Lexical prefix check – allow only if inside root
        // Use Path::starts_with for native case-sensitive, plus case-insensitive fallback for Windows
        if path.starts_with(&root) {
            return Ok(());
        }
        if path_str_lc.starts_with(&root_str_lc) {
            // Ensure separator boundary to prevent `CrystalFrontendExtra` spoof
            if path_str_lc.len() == root_str_lc.len() {
                return Ok(());
            }
            let rest = &path_str_lc[root_str_lc.len()..];
            if rest.starts_with('/')
                || rest.starts_with('\\')
                || rest.starts_with(std::path::MAIN_SEPARATOR)
            {
                return Ok(());
            }
            // If root already ends with separator, prefix alone sufficient
            if root_str_lc.ends_with('/') || root_str_lc.ends_with('\\') {
                return Ok(());
            }
            return Err(format!(
                "Unsafe write path '{}' – prefix matches writable root '{}' but not on separator boundary (possible spoof)",
                path.display(),
                root.display()
            ));
        }

        // Outside root – extra descriptive error for known external areas
        if path_str_lc.contains("emudeck")
            || path_str_lc.contains("emulationstation")
            || path_str_lc.contains("es-de")
            || (path_str_lc.contains("roms") && !path_str_lc.contains("crystalfrontend"))
        {
            return Err(format!(
                "Forbidden external area – '{}' points to EmuDeck/EmulationStation/ES-DE/ROMs outside writable root '{}'. All writes must stay inside CrystalFrontend writable directory.",
                path.display(),
                root.display()
            ));
        }
        return Err(format!(
            "Unsafe write path '{}' – must be inside writable root '{}'",
            path.display(),
            root.display()
        ));
    } else {
        // Relative logic
        if s.starts_with('/') || s.starts_with('\\') {
            return Err(format!(
                "Relative path '{}' starts with separator – treated as absolute, must be inside root",
                path.display()
            ));
        }
        // Drive-relative like "C:foo"
        if s.len() >= 2 && s.chars().nth(1) == Some(':') {
            return Err(format!(
                "Drive-relative path '{}' not allowed",
                path.display()
            ));
        }
        // If relative contains traversal we already rejected via components. Accept as safe-to-be-joined.
        return Ok(());
    }
}

/// Resolve a relative path inside writable root, ensuring parent dirs exist.
///
/// Validates relative not absolute, no "..", no traversal tricks, then joins to root.
/// Ensures `root` and parent dirs exist. Returns absolute PathBuf.
pub fn resolve_writable_path(relative: &str) -> Result<PathBuf, String> {
    let trimmed = relative.trim();
    if trimmed.is_empty() {
        return Err("Relative path empty".to_string());
    }
    let p = PathBuf::from(trimmed);
    if p.is_absolute() {
        return Err(format!(
            "resolve_writable_path expects relative path, got absolute '{}'",
            trimmed
        ));
    }
    // Traversal via components
    for comp in p.components() {
        if let Component::ParentDir = comp {
            return Err(format!(
                "Relative path '{}' contains '..' – rejected",
                trimmed
            ));
        }
        if let Component::RootDir = comp {
            return Err(format!(
                "Relative path '{}' contains root component – rejected",
                trimmed
            ));
        }
        if let Component::Prefix(_) = comp {
            return Err(format!(
                "Relative path '{}' contains drive prefix – rejected",
                trimmed
            ));
        }
    }
    // Quick substring bypass checks
    if trimmed.contains("..") {
        // Could be "my..file" – that's okay? For safety we reject any ".." literal as traversal attempt unless it's part of filename with no separator.
        // Spec says reject if contains ".." segments – we already checked segments. If string still contains ".." as substring but not as segment, we allow but log.
        // To satisfy spec mentioning "\\..\\" etc, we check those patterns explicitly.
        if trimmed.contains("../")
            || trimmed.contains("..\\")
            || trimmed.contains("/..")
            || trimmed.contains("\\..")
            || trimmed == ".."
        {
            return Err(format!(
                "Relative path '{}' contains traversal pattern – rejected",
                trimmed
            ));
        }
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(format!(
            "Path '{}' appears absolute (starts with separator)",
            trimmed
        ));
    }

    // Ensure writable dirs exist
    let root = ensure_writable_dirs()?;

    let joined = root.join(&p);
    // Re-validate absolute descendant
    is_safe_write_path(&joined)?;

    if let Some(parent) = joined.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create parent dirs for '{}': {}",
                joined.display(),
                e
            )
        })?;
    }
    Ok(joined)
}

// ---------- Logging ----------

/// Minimal append-only logger into writable_root/logs/crystal-frontend.log
///
/// No rotation required. Never panics.
pub fn log_event(level: &str, msg: &str) {
    // Do not log if message looks like secret – best effort scrub
    if msg.to_ascii_lowercase().contains("secret")
        || msg.to_ascii_lowercase().contains("token")
        || msg.to_ascii_lowercase().contains("password")
    {
        // still log but redacted
        let redacted = "[REDACTED SECRET]";
        internal_log(level, redacted);
        return;
    }
    internal_log(level, msg);
}

fn internal_log(level: &str, msg: &str) {
    let root = crystal_writable_root();
    let logs_dir = root.join("logs");
    // Best effort ensure logs dir
    let _ = std::fs::create_dir_all(&logs_dir);

    let log_path = logs_dir.join("crystal-frontend.log");

    // Validate safe before writing (should always pass, but guard anyway)
    if is_safe_write_path(&log_path).is_err() {
        // Fallback: do not write outside safe area
        eprintln!("[{}] {} (log path unsafe)", level, msg);
        return;
    }

    // Timestamp – secs since epoch (chrono not available)
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Human readable-ish: we use secs; optionally try to format with humantime-like
    let line = format!("{} [{}] {}\n", ts, level.to_ascii_uppercase(), msg);

    // Append
    use std::fs::OpenOptions;
    use std::io::Write;
    match OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(mut f) => {
            let _ = f.write_all(line.as_bytes());
        }
        Err(e) => {
            eprintln!("Failed to open log {}: {}", log_path.display(), e);
        }
    }
}

// ---------- Tauri commands for frontend diagnostics ----------

#[tauri::command]
pub fn get_safe_mode() -> bool {
    is_safe_mode()
}

#[tauri::command]
pub fn get_crystal_writable_root() -> String {
    crystal_writable_root().display().to_string()
}

/// Test-only helper to reset SAFE_MODE – not available in production builds.
#[cfg(test)]
pub(crate) fn set_safe_mode_for_tests(enabled: bool) {
    SAFE_MODE.store(enabled, std::sync::atomic::Ordering::SeqCst);
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use std::path::{Path, PathBuf};

    #[test]
    fn test_writable_root_non_empty() {
        let r = crystal_writable_root();
        assert!(!r.to_string_lossy().is_empty());
    }

    #[test]
    fn test_ensure_dirs_creates() {
        let res = ensure_writable_dirs();
        assert!(res.is_ok(), "ensure_writable_dirs failed: {:?}", res);
        let root = res.unwrap();
        for sub in ["config", "cache", "logs", "state"] {
            assert!(root.join(sub).exists(), "subdir {} missing", sub);
        }
    }

    #[test]
    fn test_is_safe_write_path_empty() {
        let p = Path::new("");
        assert!(is_safe_write_path(p).is_err());
    }

    #[test]
    fn test_is_safe_write_path_traversal_relative() {
        let p = Path::new("../evil");
        assert!(is_safe_write_path(p).is_err());
        let p2 = Path::new("a/../../b");
        assert!(is_safe_write_path(p2).is_err());
    }

    #[test]
    fn test_is_safe_write_path_drive_root() {
        assert!(is_safe_write_path(Path::new("/")).is_err());
        assert!(is_safe_write_path(Path::new("C:")).is_err());
        assert!(is_safe_write_path(Path::new("C:\\")).is_err());
        assert!(is_safe_write_path(Path::new("D:/")).is_err());
    }

    #[test]
    fn test_is_safe_write_path_absolute_outside_root() {
        let outside = if cfg!(windows) {
            PathBuf::from("C:\\Windows\\System32\\evil.txt")
        } else {
            PathBuf::from("/etc/passwd")
        };
        // Unless writable root is somehow /etc (it isn't), should be rejected
        let root = crystal_writable_root();
        if !outside.starts_with(&root) {
            assert!(is_safe_write_path(&outside).is_err());
        }
    }

    #[test]
    fn test_is_safe_write_path_absolute_inside_root() {
        let root = crystal_writable_root();
        let inside = root.join("logs").join("test.log");
        assert!(
            is_safe_write_path(&inside).is_ok(),
            "inside root should be ok: {}",
            inside.display()
        );
    }

    #[test]
    fn test_is_safe_write_path_emudeck_outside() {
        let p = if cfg!(windows) {
            PathBuf::from("C:\\EmuDeck\\roms\\test.txt")
        } else {
            PathBuf::from("/home/user/EmuDeck/roms/test.txt")
        };
        let root = crystal_writable_root();
        if !p.starts_with(&root) {
            let err = is_safe_write_path(&p).unwrap_err();
            assert!(
                err.contains("writable root")
                    || err.contains("Forbidden")
                    || err.contains("Unsafe")
            );
        }
    }

    #[test]
    fn test_resolve_writable_path_ok() {
        let res = resolve_writable_path("config/settings.json");
        assert!(res.is_ok(), "resolve failed: {:?}", res);
        let p = res.unwrap();
        assert!(p.starts_with(crystal_writable_root()));
    }

    #[test]
    fn test_resolve_writable_path_rejects_absolute() {
        let res = if cfg!(windows) {
            resolve_writable_path("C:\\Windows\\evil.txt")
        } else {
            resolve_writable_path("/etc/passwd")
        };
        assert!(res.is_err());
    }

    #[test]
    fn test_resolve_writable_path_rejects_traversal() {
        assert!(resolve_writable_path("../evil.txt").is_err());
        assert!(resolve_writable_path("a/../../b").is_err());
        assert!(resolve_writable_path("logs/../../../etc/passwd").is_err());
        assert!(resolve_writable_path("..\\evil").is_err());
    }

    #[test]
    fn test_safe_mode_env() {
        let _guard = acquire_shared_test_env_lock();
        // Ensure env handling works – set env var temporarily
        std::env::set_var("CRYSTAL_SAFE_MODE", "1");
        assert!(is_safe_mode(), "env 1 should enable safe mode");
        std::env::set_var("CRYSTAL_SAFE_MODE", "true");
        assert!(is_safe_mode());
        std::env::set_var("CRYSTAL_SAFE_MODE", "YES");
        assert!(is_safe_mode());
        std::env::remove_var("CRYSTAL_SAFE_MODE");
        // Reset static for test isolation – set false
        crate::safety::set_safe_mode_for_tests(false);
        assert!(!is_safe_mode());
    }

    #[test]
    fn test_log_event_creates_file() {
        let _ = ensure_writable_dirs();
        log_event("info", "test log from unit test");
        let log_path = crystal_writable_root()
            .join("logs")
            .join("crystal-frontend.log");
        assert!(log_path.exists(), "log file should exist after log_event");
    }
}
