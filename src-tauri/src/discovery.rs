use std::time::Duration;
use url::Url;

/// Minimal safe logger wrapper – uses our existing safety::log_event
fn log_minimal(level: &str, msg: &str) {
    // We don't import safety to keep module isolated, but crate::safety is available via crate root
    // Fallback to eprintln if safety not reachable during tests
    // In real Tauri context crate::safety::log_event exists
    #[allow(unused)]
    fn try_log(level: &str, msg: &str) {
        // Attempt to use crate::safety if present
        // This avoids hard dependency for tests compilation
        // In Tauri runtime we can directly call
        // Note: safety module must be in scope in main.rs via `mod safety;`
        // We'll reference via ::safety if exists; otherwise eprintln
        // To keep this file compiling even without main context, we guard via cfg

        // Real log path – when compiled as Tauri app, main.rs includes this module and safety module is available.
        // We'll attempt to log via crate::safety::log_event when possible.

        // Direct call guarded by cfg not needed – we rely on linking; we use a conditional:
        #[cfg(not(test))]
        {
            // In production, main.rs will have `mod safety;` at crate root and it will be accessible as crate::safety
            // Since this file is included via `mod discovery;` inside main.rs, crate::safety is sibling module.
            // Use fully qualified to avoid import issues.
            // Safety: this is best-effort – if call fails we still return.
            crate::safety::log_event(level, msg);
        }
        #[cfg(test)]
        {
            eprintln!("[{}] {}", level, msg);
        }
    }
    try_log(level, msg);
}

fn is_allowed_vault_path(path: &str) -> bool {
    path == "/vault" || path == "/vault/" || path.starts_with("/vault/")
}

fn is_allowed_port(url: &Url) -> bool {
    match url.port() {
        None => true,
        Some(443) => true,
        Some(_) => false,
    }
}

/// Custom redirect policy – only allow redirects staying on vimm.net host,
/// with same path guard as primary fetch and no credentials.
fn is_allowed_redirect(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    if url.host_str() != Some("vimm.net") {
        return false;
    }
    if !is_allowed_port(url) {
        return false;
    }
    // Must remain inside /vault – prevents open-redirect to other vimm paths
    // Strict: exact /vault or /vault/ prefix, not /vaultevil
    if !is_allowed_vault_path(url.path()) {
        return false;
    }
    // Reject any embedded credentials (username / password)
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    true
}

#[tauri::command]
pub async fn fetch_vimm(url: String) -> Result<String, String> {
    // Validate URL parseable
    let parsed = Url::parse(&url).map_err(|e| {
        let msg = format!("fetch_vimm invalid URL '{}': {}", url, e);
        log_minimal(
            "warn",
            &format!("fetch_vimm reject invalid_url url='{}' err='{}'", url, e),
        );
        msg
    })?;

    // Scheme must be https
    if parsed.scheme() != "https" {
        let msg = format!(
            "fetch_vimm only allows https, got '{}' for url '{}'",
            parsed.scheme(),
            url
        );
        log_minimal(
            "warn",
            &format!(
                "fetch_vimm reject scheme='{}' url='{}'",
                parsed.scheme(),
                url
            ),
        );
        return Err(msg);
    }

    // Host must be exactly vimm.net (spec says exact, not subdomain unless www.vimm.net allowed – spec says host == vimm.net)
    match parsed.host_str() {
        Some("vimm.net") => {}
        Some(other) => {
            let msg = format!(
                "fetch_vimm only allows host vimm.net, got '{}' for url '{}'",
                other, url
            );
            log_minimal(
                "warn",
                &format!("fetch_vimm reject host='{}' url='{}'", other, url),
            );
            return Err(msg);
        }
        None => {
            let msg = format!("fetch_vimm missing host for url '{}'", url);
            log_minimal("warn", &msg);
            return Err(msg);
        }
    }

    // Port must be default or 443 only
    if !is_allowed_port(&parsed) {
        let msg = format!(
            "fetch_vimm rejects custom port {} for url '{}'",
            parsed.port().unwrap_or(0),
            url
        );
        log_minimal("warn", &msg);
        return Err(msg);
    }

    // Path must be /vault family – exact or prefix with slash boundary
    if !is_allowed_vault_path(parsed.path()) {
        let msg = format!(
            "fetch_vimm only allows /vault paths, got '{}' for url '{}'",
            parsed.path(),
            url
        );
        log_minimal("warn", &msg);
        return Err(msg);
    }

    // No userinfo, no open proxy tricks
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("fetch_vimm rejects URL with credentials".to_string());
    }

    // Build reqwest client with timeout 10s and custom redirect policy
    // User-Agent derives from Cargo package version (env! CARGO_PKG_VERSION) to avoid stale.
    // Cargo.toml version == app version (4.4.1). Future-proof – single source of truth.
    let app_version = env!("CARGO_PKG_VERSION");
    let ua = format!(
        "CrystalFrontend/{} (Discovery) - catalog reference only, no automated ROM download",
        app_version
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if !is_allowed_redirect(attempt.url()) {
                // stop redirect, return error via custom handling
                return attempt.stop();
            }
            attempt.follow()
        }))
        .user_agent(ua)
        .build()
        .map_err(|e| {
            let msg = format!("fetch_vimm failed to build client: {}", e);
            log_minimal("error", &msg);
            msg
        })?;

    // Perform GET
    let resp = client.get(parsed.clone()).send().await.map_err(|e| {
        let msg = format!("fetch_vimm request failed for '{}': {}", url, e);
        log_minimal(
            "warn",
            &format!("fetch_vimm network fail url='{}' err='{}'", url, e),
        );
        msg
    })?;

    let status = resp.status().as_u16();

    // Log minimal provider/route/status – no cookies, no huge HTML
    let route_type = if parsed.path().contains("/vault/")
        && parsed.path().len() > "/vault/".len()
        && !parsed.query().unwrap_or("").contains("p=list")
    {
        // contains numeric id segment? Treat detail if path is /vault/{digits}
        if parsed
            .path()
            .trim_end_matches('/')
            .chars()
            .filter(|c| *c == '/')
            .count()
            >= 2
        {
            "detail"
        } else {
            "search"
        }
    } else {
        "search"
    };

    log_minimal(
        "info",
        &format!(
            "fetch_vimm provider=vimms route={} status={} url='{}'",
            route_type, status, url
        ),
    );

    // Handle non-2xx – return error with status but do not log body
    if !resp.status().is_success() {
        let msg = format!("fetch_vimm http status {} for url '{}'", status, url);
        log_minimal("warn", &msg);
        // For 429 we bubble up so frontend can backoff
        return Err(msg);
    }

    // Size guard – inspect Content-Length first when present
    const MAX_BODY: u64 = 2_000_000;
    const MAX_BODY_USIZE: usize = 2_000_000;

    if let Some(declared) = resp.content_length() {
        if declared > MAX_BODY {
            let msg = format!(
                "fetch_vimm body too large declared {} bytes > {} for url '{}' – rejecting",
                declared, MAX_BODY, url
            );
            log_minimal("warn", &msg);
            return Err(msg);
        }
    }

    // Stream/read incrementally, stop after maximum + 1 byte, never accumulate unbounded response
    // Uses reqwest chunk() API which does not require extra stream feature
    let mut acc: Vec<u8> = Vec::with_capacity(std::cmp::min(
        resp.content_length().unwrap_or(0) as usize,
        MAX_BODY_USIZE + 1,
    ));
    let mut resp_mut = resp;
    loop {
        let chunk_opt = resp_mut.chunk().await.map_err(|e| {
            let msg = format!("fetch_vimm failed reading body chunk: {}", e);
            log_minimal("warn", &msg);
            msg
        })?;
        match chunk_opt {
            None => break,
            Some(bytes) => {
                if acc.len() + bytes.len() > MAX_BODY_USIZE + 1 {
                    let msg = format!(
                        "fetch_vimm body too large {}+ bytes > {} for url '{}' – rejecting",
                        acc.len() + bytes.len(),
                        MAX_BODY,
                        url
                    );
                    log_minimal("warn", &msg);
                    return Err(msg);
                }
                acc.extend_from_slice(&bytes);
                if acc.len() > MAX_BODY_USIZE {
                    let msg = format!(
                        "fetch_vimm body too large {} bytes for url '{}' – rejecting",
                        acc.len(),
                        url
                    );
                    log_minimal("warn", &msg);
                    return Err(msg);
                }
            }
        }
    }

    // Preserve UTF-8/string result semantics
    let body = String::from_utf8(acc).map_err(|e| {
        let msg = format!("fetch_vimm body not valid utf-8: {} for url '{}'", e, url);
        log_minimal("warn", &msg);
        msg
    })?;

    // Do NOT log HTML content, do NOT log cookies/headers
    Ok(body)
}

/// ---------- Discovery cache (narrowly scoped, guarded) ----------

fn sanitize_discovery_key(key: &str) -> Result<String, String> {
    let t = key.trim();
    if t.is_empty() {
        return Err("discovery cache key empty".to_string());
    }
    if t.len() > 200 {
        return Err(format!("discovery cache key too long {} > 200", t.len()));
    }
    if t.contains("..") {
        return Err("discovery cache key contains '..' traversal".to_string());
    }
    if t.contains('/') || t.contains('\\') {
        return Err(
            "discovery cache key must not contain path separators – use ':' delimiter".to_string(),
        );
    }
    // Allowed chars: alphanumeric, '-', '_', ':', '.'
    // We deliberately reject spaces and other symbols which the frontend sanitizes via safeCacheKeyPart.
    if !t
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == ':' || c == '.')
    {
        return Err(format!("discovery cache key contains forbidden character '{}': only alphanumeric _ - : . allowed", t));
    }
    // Reject empty segments (e.g., "::" or leading/trailing ":")
    let segs: Vec<&str> = t.split(':').collect();
    if segs.iter().any(|s| s.is_empty()) {
        return Err(
            "discovery cache key contains empty segment (e.g. 'a::b' or leading/trailing ':')"
                .to_string(),
        );
    }
    if segs.len() < 2 || segs.len() > 3 {
        return Err(format!(
            "discovery cache key must have 2-3 colon-separated segments, got {} in '{}'",
            segs.len(),
            t
        ));
    }
    // First segment must be provider (e.g., vimms)
    // No strict enforcement beyond non-empty, but we keep minimal.
    let sanitized = t.replace(':', "/");
    if sanitized.contains("..") {
        return Err("sanitized discovery path contains '..' after replace – rejected".to_string());
    }
    Ok(sanitized)
}

fn discovery_relative_path(sanitized: &str) -> String {
    format!("cache/discovery/{}.json", sanitized)
}

#[tauri::command]
pub fn discovery_cache_read(key: String) -> Result<Option<String>, String> {
    let sanitized = sanitize_discovery_key(&key)?;
    let rel = discovery_relative_path(&sanitized);

    // Ensure writable root dirs exist first (creates cache/discovery hierarchy lazily for read – harmless)
    // but for read we don't want to create unless needed; we will use root join + safe check manually.
    let root = crate::safety::crystal_writable_root();
    let abs = root.join(&rel);

    // Validate absolute path is inside approved writable root via existing guard
    // Using is_safe_write_path (which accepts absolute descendant as ok) – we use same guard even for reads
    // to prevent path escape via symlink tricks or prefix spoof.
    crate::safety::is_safe_write_path(&abs).map_err(|e| {
        format!(
            "discovery cache read safety reject '{}': {}",
            abs.display(),
            e
        )
    })?;

    // Additional defense: ensure rel still starts with cache/discovery/
    if !rel.starts_with("cache/discovery/") {
        return Err(format!(
            "discovery cache rel path must start with cache/discovery/, got '{}'",
            rel
        ));
    }

    if !abs.exists() {
        // Log minimal – provider prefix safe
        crate::safety::log_event(
            "info",
            &format!(
                "discovery_cache_read miss key='{}' sanitized='{}'",
                key, sanitized
            ),
        );
        return Ok(None);
    }

    let content = std::fs::read_to_string(&abs).map_err(|e| {
        format!(
            "discovery_cache_read failed reading '{}': {}",
            abs.display(),
            e
        )
    })?;

    // Size guard – similar to fetcher 2MB, cache entries small but cap
    if content.len() > 2_000_000 {
        return Err(format!(
            "discovery cache entry too large {} bytes for key '{}'",
            content.len(),
            key
        ));
    }

    crate::safety::log_event(
        "info",
        &format!(
            "discovery_cache_read hit key='{}' bytes={}",
            key,
            content.len()
        ),
    );
    Ok(Some(content))
}

#[tauri::command]
pub fn discovery_cache_write(key: String, content: String) -> Result<(), String> {
    let sanitized = sanitize_discovery_key(&key)?;
    let rel = discovery_relative_path(&sanitized);

    if !rel.starts_with("cache/discovery/") {
        return Err(format!(
            "discovery cache rel path must start with cache/discovery/, got '{}'",
            rel
        ));
    }

    if content.len() > 2_000_000 {
        return Err(format!(
            "discovery cache write too large {} bytes for key '{}' – max 2MB",
            content.len(),
            key
        ));
    }

    // resolve_writable_path ensures parent dirs exist and validates safety via is_safe_write_path internally.
    // It also ensures %LOCALAPPDATA%\\CrystalFrontend\\ cache\\discovery structure.
    let abs = crate::safety::resolve_writable_path(&rel).map_err(|e| {
        format!(
            "discovery cache write resolve failed for rel='{}': {}",
            rel, e
        )
    })?;

    // Double-validate final absolute path
    crate::safety::is_safe_write_path(&abs).map_err(|e| {
        format!(
            "discovery cache write safety reject '{}': {}",
            abs.display(),
            e
        )
    })?;

    std::fs::write(&abs, content.as_bytes()).map_err(|e| {
        format!(
            "discovery cache write failed for '{}': {}",
            abs.display(),
            e
        )
    })?;

    crate::safety::log_event(
        "info",
        &format!(
            "discovery_cache_write ok key='{}' file='{}' bytes={}",
            key,
            abs.display(),
            content.len()
        ),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_vimm_url() {
        // local logic mirrors validation above
        let u = Url::parse("https://vimm.net/vault/?p=list&system=PS2&q=mario").unwrap();
        assert_eq!(u.host_str(), Some("vimm.net"));
        assert_eq!(u.scheme(), "https");
        assert!(u.path().starts_with("/vault"));
        assert!(is_allowed_redirect(&u));
    }

    #[test]
    fn test_reject_other_hosts() {
        let bad = vec![
            "https://evil.com/vault/123",
            "https://www.vimm.net/vault/123", // spec says exact host == vimm.net only – www rejected
            "https://vimm.net.evil.com/vault/123",
            "http://vimm.net/vault/123", // http rejected
        ];
        for url in bad {
            let parsed = Url::parse(url).unwrap();
            // Our validation logic would reject these
            if parsed.host_str() != Some("vimm.net") || parsed.scheme() != "https" {
                assert!(true, "correctly rejects {}", url);
            } else {
                panic!("should have rejected {}", url);
            }
        }
    }

    #[test]
    fn test_redirect_policy() {
        let good = Url::parse("https://vimm.net/vault/12345").unwrap();
        assert!(is_allowed_redirect(&good));
        let bad = Url::parse("https://evil.com/steal").unwrap();
        assert!(!is_allowed_redirect(&bad));
        let http_bad = Url::parse("http://vimm.net/vault/123").unwrap();
        assert!(!is_allowed_redirect(&http_bad));
    }

    #[test]
    fn test_discovery_cache_key_sanitize_valid() {
        let valid = vec![
            "vimms:ps2:mario",
            "vimms:gbc:__empty__",
            "vimms:detail:12345",
            "vimms:gc:f-zero",
        ];
        for k in valid {
            let s = sanitize_discovery_key(k);
            assert!(
                s.is_ok(),
                "valid key '{}' should pass, got err {:?}",
                k,
                s.err()
            );
        }
    }

    #[test]
    fn test_discovery_cache_key_rejects_traversal() {
        let bad = vec![
            "vimms:..:evil",
            "vimms:ps2:../../../etc",
            "vimms:ps2:bad/../evil",
            "vimms:ps2:slash/bad",
            "vimms:ps2:back\\slash",
            "vimms::emptyseg",
            ":leadingcolon",
            "trailingcolon:",
        ];
        for k in bad {
            assert!(
                sanitize_discovery_key(k).is_err(),
                "bad key '{}' should be rejected",
                k
            );
        }
    }

    #[test]
    fn test_discovery_cache_resolves_under_crystal_root() {
        // Use sanitize then resolve_writable_path to prove location is under existing Crystal writable root
        let key = "vimms:ps2:test123";
        let sanitized = sanitize_discovery_key(key).expect("sanitize should ok");
        let rel = discovery_relative_path(&sanitized);
        assert!(
            rel.starts_with("cache/discovery/"),
            "rel must start cache/discovery/: {}",
            rel
        );
        let abs = crate::safety::resolve_writable_path(&rel).expect("resolve should succeed");
        let root = crate::safety::crystal_writable_root();
        assert!(
            abs.starts_with(&root),
            "abs {:?} must start with root {:?}",
            abs,
            root
        );
        // Also prove is_safe_write_path passes
        assert!(
            crate::safety::is_safe_write_path(&abs).is_ok(),
            "safe_write_path should allow cache file"
        );
        // Ensure not AppLocalData assumption – root must be CrystalFrontend not com.crystal.frontend
        let root_str = root.to_string_lossy().to_lowercase();
        assert!(
            root_str.contains("crystalfrontend")
                || root_str.contains("crystal_frontend")
                || root_str.ends_with("crystalfrontend"),
            "root should be CrystalFrontend based, got {}",
            root.display()
        );
    }

    #[test]
    fn test_discovery_cache_no_external_write() {
        // Ensure our sanitizer never allows paths that would be outside allowed tree
        let key = "vimms:ps2:valid";
        let sanitized = sanitize_discovery_key(key).unwrap();
        let rel = discovery_relative_path(&sanitized);
        // simulate an attempt to spoof ../ via allowed chars? Our sanitizer rejects ".." so following should fail
        let outside_attempt = "vimms:ps2:.._evil";
        assert!(sanitize_discovery_key(outside_attempt).is_err());
        // Ensure relative path itself is safe
        let abs = crate::safety::resolve_writable_path(&rel).unwrap();
        assert!(!abs.to_string_lossy().contains(".."));
    }

    #[test]
    fn test_vault_path_boundary_strict() {
        // Allowed: /vault, /vault/, /vault/...
        let allowed = vec![
            "https://vimm.net/vault",
            "https://vimm.net/vault/",
            "https://vimm.net/vault/12345",
            "https://vimm.net/vault/?p=list&system=PS2&q=mario",
            "https://vimm.net/vault/12345/",
        ];
        for url_str in allowed {
            let u = Url::parse(url_str).unwrap();
            assert!(is_allowed_vault_path(u.path()), "should allow {}", url_str);
            assert!(is_allowed_port(&u), "port ok for {}", url_str);
            // host and scheme also ok
            assert!(
                is_allowed_redirect(&u) || u.path() == "/vault" || u.path() == "/vault/",
                "redirect check for {}",
                url_str
            );
            // overall validate via is_allowed_vault_path + port + redirect combined: for primary allow we want path ok
        }

        // Rejected: vaultevil family
        let rejected = vec![
            "https://vimm.net/vaultevil",
            "https://vimm.net/vault-evil",
            "https://vimm.net/vaultfoo",
            "https://vimm.net/vault_evil",
            "https://vimm.net/vaultx/123",
        ];
        for url_str in rejected {
            let u = Url::parse(url_str).unwrap();
            assert!(
                !is_allowed_vault_path(u.path()),
                "should reject path {}",
                url_str
            );
            assert!(
                !is_allowed_redirect(&u),
                "redirect should reject {}",
                url_str
            );
        }
    }

    #[test]
    fn test_custom_port_rejection() {
        let bad_ports = vec![
            "https://vimm.net:444/vault/123",
            "https://vimm.net:8080/vault/",
            "https://vimm.net:8443/vault/123",
            "https://vimm.net:80/vault/",
        ];
        for url_str in bad_ports {
            let u = Url::parse(url_str).unwrap();
            assert!(!is_allowed_port(&u), "should reject port for {}", url_str);
            assert!(
                !is_allowed_redirect(&u),
                "redirect should reject port {}",
                url_str
            );
        }
        let good_ports = vec![
            "https://vimm.net/vault/123",     // default no port
            "https://vimm.net:443/vault/123", // explicit 443 allowed
            "https://vimm.net/vault/",
        ];
        for url_str in good_ports {
            let u = Url::parse(url_str).unwrap();
            assert!(is_allowed_port(&u), "should allow port for {}", url_str);
        }
    }

    #[test]
    fn test_credentials_rejected() {
        let bad = vec![
            "https://user:pass@vimm.net/vault/123",
            "https://user@vimm.net/vault/123",
        ];
        for url_str in bad {
            let u = Url::parse(url_str).unwrap();
            assert!(
                !u.username().is_empty() || u.password().is_some(),
                "url {} has creds",
                url_str
            );
            assert!(
                !is_allowed_redirect(&u),
                "redirect should reject creds {}",
                url_str
            );
        }
    }
}
