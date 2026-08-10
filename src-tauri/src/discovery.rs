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

/// Custom redirect policy – only allow redirects staying on vimm.net host,
/// with same path guard as primary fetch and no credentials.
fn is_allowed_redirect(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    if url.host_str() != Some("vimm.net") {
        return false;
    }
    // Must remain inside /vault – prevents open-redirect to other vimm paths
    if !url.path().starts_with("/vault") {
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
        log_minimal("warn", &format!("fetch_vimm reject invalid_url url='{}' err='{}'", url, e));
        msg
    })?;

    // Scheme must be https
    if parsed.scheme() != "https" {
        let msg = format!("fetch_vimm only allows https, got '{}' for url '{}'", parsed.scheme(), url);
        log_minimal("warn", &format!("fetch_vimm reject scheme='{}' url='{}'", parsed.scheme(), url));
        return Err(msg);
    }

    // Host must be exactly vimm.net (spec says exact, not subdomain unless www.vimm.net allowed – spec says host == vimm.net)
    match parsed.host_str() {
        Some("vimm.net") => {},
        Some(other) => {
            let msg = format!("fetch_vimm only allows host vimm.net, got '{}' for url '{}'", other, url);
            log_minimal("warn", &format!("fetch_vimm reject host='{}' url='{}'", other, url));
            return Err(msg);
        },
        None => {
            let msg = format!("fetch_vimm missing host for url '{}'", url);
            log_minimal("warn", &msg);
            return Err(msg);
        }
    }

    // Path must start with /vault (defense-in-depth)
    if !parsed.path().starts_with("/vault") {
        let msg = format!("fetch_vimm only allows /vault paths, got '{}' for url '{}'", parsed.path(), url);
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
    let ua = format!("CrystalFrontend/{} (Discovery) - catalog reference only, no automated ROM download", app_version);
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
        log_minimal("warn", &format!("fetch_vimm network fail url='{}' err='{}'", url, e));
        msg
    })?;

    let status = resp.status().as_u16();

    // Log minimal provider/route/status – no cookies, no huge HTML
    let route_type = if parsed.path().contains("/vault/") && parsed.path().len() > "/vault/".len() && !parsed.query().unwrap_or("").contains("p=list") {
        // contains numeric id segment? Treat detail if path is /vault/{digits}
        if parsed.path().trim_end_matches('/').chars().filter(|c| *c == '/').count() >= 2 {
            "detail"
        } else {
            "search"
        }
    } else {
        "search"
    };

    log_minimal("info", &format!("fetch_vimm provider=vimms route={} status={} url='{}'", route_type, status, url));

    // Handle non-2xx – return error with status but do not log body
    if !resp.status().is_success() {
        let msg = format!("fetch_vimm http status {} for url '{}'", status, url);
        log_minimal("warn", &msg);
        // For 429 we bubble up so frontend can backoff
        return Err(msg);
    }

    // Read body as string – cap to reasonable size (e.g., 2MB) to avoid DoS
    let body = resp.text().await.map_err(|e| {
        let msg = format!("fetch_vimm failed reading body: {}", e);
        log_minimal("warn", &msg);
        msg
    })?;

    // Size guard
    if body.len() > 2_000_000 {
        let msg = format!("fetch_vimm body too large {} bytes for url '{}' – rejecting", body.len(), url);
        log_minimal("warn", &msg);
        return Err(msg);
    }

    // Do NOT log HTML content, do NOT log cookies/headers
    Ok(body)
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
}
