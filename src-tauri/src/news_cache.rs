//! Emulation Pulse News – cache, fetch, validation, prune, SAFE_MODE aware
//! Location: writable_root + cache/news/news.json
//! MAX 300KB, 12h TTL, prune, bounded fields.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::safety::{crystal_writable_root, is_safe_write_path, log_event};

const MAX_NEWS_BYTES: usize = 300 * 1024;
const TTL_SECS: u64 = 12 * 3600;
const MAX_ITEMS: usize = 20;
const MAX_TITLE_LEN: usize = 200;
const MAX_SUMMARY_LEN: usize = 500;
const MAX_URL_LEN: usize = 512;

const ALLOWED_HOSTS: &[&str] = &[
    "libretro.com",
    "www.libretro.com",
    "docs.libretro.com",
    "emudeck.github.io",
    "pcsx2.net",
    "www.pcsx2.net",
    "dolphin-emu.org",
    "www.dolphin-emu.org",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub title: String,
    pub url: String,
    #[serde(rename = "source")]
    pub source: String,
    pub published_at: String,
    #[serde(default)]
    pub summary: String,
}

impl NewsItem {
    fn sanitize(mut self) -> Result<Self, String> {
        let title = self.title.trim().to_string();
        if title.is_empty() {
            return Err("NEWS_TITLE_EMPTY".to_string());
        }
        if title.len() > MAX_TITLE_LEN {
            // truncate at char boundary
            let truncated: String = title.chars().take(MAX_TITLE_LEN).collect();
            self.title = truncated;
        } else {
            self.title = title;
        }
        if self.title.contains('\0') || self.title.contains('<') && self.title.contains("script") {
            // basic injection guard – reject script-like
            if self.title.to_ascii_lowercase().contains("<script") {
                return Err("NEWS_TITLE_REJECTED_SCRIPT".to_string());
            }
        }

        // url validation https + whitelist
        validate_news_url(&self.url)?;
        if self.url.len() > MAX_URL_LEN {
            return Err(format!("NEWS_URL_TOO_LONG {}", self.url.len()));
        }

        let src = self.source.trim().to_string();
        if src.is_empty() {
            return Err("NEWS_SOURCE_EMPTY".to_string());
        }
        if src.len() > 40 {
            self.source = src.chars().take(40).collect();
        } else {
            self.source = src;
        }

        // published_at must be UTC ISO8601 – try parse, normalize to RFC3339
        if self.published_at.trim().is_empty() {
            return Err("NEWS_PUBLISHED_EMPTY".to_string());
        }
        // attempt to parse as rfc3339 or rfc2822 then convert to UTC ISO
        let parsed = parse_pub_date_to_iso(&self.published_at).unwrap_or_else(|| {
            // fallback: now UTC if unparseable, but log
            Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        });
        self.published_at = parsed;

        let summary = self.summary.trim().to_string();
        if summary.len() > MAX_SUMMARY_LEN {
            let trunc: String = summary.chars().take(MAX_SUMMARY_LEN).collect();
            self.summary = trunc;
        } else {
            self.summary = summary;
        }
        // strip html tags basic
        if self.summary.contains('<') {
            // naive strip – remove <...>
            let stripped = strip_html_tags(&self.summary);
            self.summary = stripped.chars().take(MAX_SUMMARY_LEN).collect();
        }

        if self.title.len() > MAX_TITLE_LEN || self.summary.len() > MAX_SUMMARY_LEN {
            return Err("NEWS_BOUNDS_EXCEEDED_AFTER_SANITIZE".to_string());
        }

        Ok(self)
    }
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if ch == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            out.push(ch);
        }
    }
    out.trim().to_string()
}

pub fn validate_news_url(url_str: &str) -> Result<(), String> {
    let trimmed = url_str.trim();
    if trimmed.is_empty() {
        return Err("NEWS_URL_EMPTY".to_string());
    }
    if trimmed.len() > MAX_URL_LEN {
        return Err(format!("NEWS_URL_TOO_LONG {}", trimmed.len()));
    }
    let parsed = Url::parse(trimmed).map_err(|e| format!("NEWS_URL_PARSE_FAILED {}: {}", trimmed, e))?;
    if parsed.scheme() != "https" {
        return Err(format!("NEWS_URL_SCHEME_NOT_HTTPS: {}", parsed.scheme()));
    }
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() {
        return Err("NEWS_URL_NO_HOST".to_string());
    }
    if !ALLOWED_HOSTS.contains(&host.as_str()) {
        return Err(format!("NEWS_URL_HOST_NOT_ALLOWED: {}", host));
    }
    if parsed.port().is_some() {
        return Err(format!("NEWS_URL_PORT_REJECTED: {}", trimmed));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("NEWS_URL_CREDENTIALS_REJECTED".to_string());
    }
    // block metachars injection – similar to steam_launch
    if trimmed.contains(';') || trimmed.contains('|') || trimmed.contains('`') || trimmed.contains('$') || trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("NEWS_URL_BLOCKED_METACHAR".to_string());
    }
    // reject javascript: etc handled by scheme
    Ok(())
}

fn parse_pub_date_to_iso(input: &str) -> Option<String> {
    let t = input.trim();
    if t.is_empty() {
        return None;
    }
    // Try RFC3339
    if let Ok(dt) = DateTime::parse_from_rfc3339(t) {
        return Some(dt.with_timezone(&Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
    }
    // Try RFC2822
    if let Ok(dt) = DateTime::parse_from_rfc2822(t) {
        return Some(dt.with_timezone(&Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
    }
    // Try custom: "Tue, 02 Jul 2024 12:34:56 +0000" is rfc2822
    // Try Naive parsing common RSS
    let fmts = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ];
    for fmt in fmts {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(t, fmt) {
            let utc: DateTime<Utc> = DateTime::from_naive_utc_and_offset(naive, Utc);
            return Some(utc.to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
        }
        if let Ok(dt) = chrono::NaiveDate::parse_from_str(t, "%Y-%m-%d") {
            let ndt = dt.and_hms_opt(0,0,0).unwrap();
            let utc: DateTime<Utc> = DateTime::from_naive_utc_and_offset(ndt, Utc);
            return Some(utc.to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
        }
    }
    // fallback: try chrono parse via DateTime::parse with offset
    if let Ok(dt) = t.parse::<DateTime<Utc>>() {
        return Some(dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
    }
    None
}

pub fn news_cache_root() -> PathBuf {
    crystal_writable_root().join("cache").join("news")
}

fn news_file_path() -> PathBuf {
    news_cache_root().join("news.json")
}

fn ensure_news_dir() -> Result<PathBuf, String> {
    let dir = news_cache_root();
    fs::create_dir_all(&dir).map_err(|e| format!("NEWS_DIR_CREATE_FAILED {}: {}", dir.display(), e))?;
    Ok(dir)
}

pub fn prune_news_cache() -> Result<(), String> {
    let root = news_cache_root();
    if !root.exists() {
        return Ok(());
    }
    // Single file prune: if >300KB delete or truncate
    let file = news_file_path();
    if file.exists() {
        if let Ok(meta) = fs::metadata(&file) {
            if meta.len() > MAX_NEWS_BYTES as u64 {
                let _ = fs::remove_file(&file);
                log_event("info", &format!("news_cache_prune_oversize removed='{}' size={}", file.display(), meta.len()));
            } else {
                // TTL: if older than 12h keep but mark stale – we don't delete, is_fresh decides.
                // If multiple old cache files (future expansion) prune >20 files
                if let Ok(mtime) = meta.modified() {
                    if let Ok(elapsed) = SystemTime::now().duration_since(mtime) {
                        if elapsed.as_secs() > TTL_SECS * 2 {
                            // if twice TTL and we want to keep size low, delete if > 2*TTL
                            let _ = fs::remove_file(&file);
                            log_event("info", &format!("news_cache_prune_expired removed='{}' age_secs={}", file.display(), elapsed.as_secs()));
                        }
                    }
                }
            }
        }
    }
    // Also prune any extra .json.tmp leftover
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".tmp") {
                        let _ = fs::remove_file(&p);
                    }
                }
                if let Ok(meta) = fs::metadata(&p) {
                    if meta.len() > MAX_NEWS_BYTES as u64 {
                        let _ = fs::remove_file(&p);
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn is_fresh(mtime: SystemTime) -> bool {
    if let Ok(elapsed) = SystemTime::now().duration_since(mtime) {
        elapsed.as_secs() < TTL_SECS
    } else {
        false
    }
}

pub fn load_cached_news() -> Result<Vec<NewsItem>, String> {
    prune_news_cache()?;
    let file = news_file_path();
    if !file.exists() {
        return Ok(vec![]);
    }
    // safety validate path inside writable root
    is_safe_write_path(&file).map_err(|e| format!("NEWS_PATH_UNSAFE {}: {}", file.display(), e))?;

    if let Ok(meta) = fs::metadata(&file) {
        if meta.len() > MAX_NEWS_BYTES as u64 {
            let _ = fs::remove_file(&file);
            return Err(format!("NEWS_CACHE_TOO_LARGE {} bytes – removed", meta.len()));
        }
        let fresh = meta.modified().map(|m| is_fresh(m)).unwrap_or(false);
        if !fresh {
            // still allow load but caller may check freshness separately; we log
            log_event("info", &format!("news_cache_load stale file='{}'", file.display()));
        }
    }

    let content = fs::read_to_string(&file).map_err(|e| format!("NEWS_CACHE_READ_FAILED {}: {}", file.display(), e))?;
    if content.len() > MAX_NEWS_BYTES {
        let _ = fs::remove_file(&file);
        return Err(format!("NEWS_CACHE_CONTENT_TOO_LARGE {} > {}", content.len(), MAX_NEWS_BYTES));
    }
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    let items: Vec<NewsItem> = serde_json::from_str(&content).map_err(|e| format!("NEWS_CACHE_PARSE_FAILED: {}", e))?;
    // validate each
    let mut out = Vec::new();
    for it in items.into_iter().take(MAX_ITEMS * 2) {
        match it.clone().sanitize() {
            Ok(valid) => out.push(valid),
            Err(_) => continue,
        }
    }
    out.truncate(MAX_ITEMS);
    Ok(out)
}

pub fn save_news(items: Vec<NewsItem>) -> Result<(), String> {
    // SAFE_MODE: still allow because cache/news/ is inside writable_root app-data (read/write allowed even safe mode for browsing/caching)
    // But we still validate safe path
    if items.len() > MAX_ITEMS * 2 {
        return Err(format!("NEWS_SAVE_TOO_MANY {} > {}", items.len(), MAX_ITEMS*2));
    }
    let mut sanitized = Vec::new();
    let mut seen_urls: HashSet<String> = HashSet::new();
    for it in items {
        match it.sanitize() {
            Ok(v) => {
                let url_lc = v.url.to_ascii_lowercase();
                if seen_urls.contains(&url_lc) {
                    continue;
                }
                seen_urls.insert(url_lc);
                sanitized.push(v);
            }
            Err(e) => {
                log_event("warn", &format!("news_save_sanitize_skip err={}", e));
                continue;
            }
        }
        if sanitized.len() >= MAX_ITEMS {
            break;
        }
    }
    let json = serde_json::to_string(&sanitized).map_err(|e| format!("NEWS_SERIALIZE_FAILED: {}", e))?;
    if json.len() > MAX_NEWS_BYTES {
        return Err(format!("NEWS_SAVE_TOO_LARGE {} > {} bytes", json.len(), MAX_NEWS_BYTES));
    }
    ensure_news_dir()?;
    let file = news_file_path();
    is_safe_write_path(&file).map_err(|e| format!("NEWS_PATH_UNSAFE {}: {}", file.display(), e))?;
    let tmp = file.with_extension("tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| format!("NEWS_TMP_WRITE_FAILED {}: {}", tmp.display(), e))?;
    fs::rename(&tmp, &file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("NEWS_RENAME_FAILED: {}", e)
    })?;
    log_event("info", &format!("news_cache_write ok items={} file='{}' bytes={}", sanitized.len(), file.display(), sanitized.len()));
    Ok(())
}

// ---------- RSS parsing minimal with quick-xml ----------

#[derive(Debug, Default, Clone)]
struct RawRssItem {
    title: Option<String>,
    link: Option<String>,
    pub_date: Option<String>,
    description: Option<String>,
    source_label: String,
}

fn parse_rss_bytes(bytes: &[u8], source_label: &str) -> Result<Vec<NewsItem>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    if bytes.len() > 2 * 1024 * 1024 {
        return Err(format!("RSS_TOO_LARGE {} > 2MB source={}", bytes.len(), source_label));
    }
    let content = String::from_utf8_lossy(bytes);
    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);

    let mut items: Vec<RawRssItem> = Vec::new();
    let mut current: Option<RawRssItem> = None;
    let mut current_tag: String = String::new();
    let mut in_item = false;
    let mut buf = Vec::new();
    let mut count = 0usize;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string().to_ascii_lowercase();
                if name == "item" || name == "entry" {
                    in_item = true;
                    current = Some(RawRssItem {
                        source_label: source_label.to_string(),
                        ..Default::default()
                    });
                } else if in_item {
                    current_tag = name;
                }
            }
            Ok(Event::Text(t)) => {
                if in_item {
                    if let Some(cur) = current.as_mut() {
                        let txt = t.unescape().unwrap_or_default().to_string();
                        match current_tag.as_str() {
                            "title" => {
                                if cur.title.is_none() {
                                    cur.title = Some(txt);
                                }
                            }
                            "link" => {
                                // <link> may be text or href attr – text case
                                if cur.link.is_none() {
                                    cur.link = Some(txt);
                                }
                            }
                            "guid" => {
                                if cur.link.is_none() {
                                    // sometimes guid is url
                                    if txt.starts_with("http") {
                                        cur.link = Some(txt);
                                    }
                                }
                            }
                            "pubdate" | "published" | "pub_date" | "updated" | "dc:date" => {
                                if cur.pub_date.is_none() {
                                    cur.pub_date = Some(txt);
                                }
                            }
                            "description" | "summary" | "content" | "content:encoded" => {
                                if cur.description.is_none() {
                                    cur.description = Some(txt);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                if in_item {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string().to_ascii_lowercase();
                    if name == "link" {
                        // Atom <link href="..."/>
                        for attr in e.attributes().flatten() {
                            if String::from_utf8_lossy(attr.key.as_ref()).to_ascii_lowercase() == "href" {
                                if let Ok(v) = String::from_utf8(attr.value.to_vec()) {
                                    if let Some(cur) = current.as_mut() {
                                        if cur.link.is_none() {
                                            cur.link = Some(v);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string().to_ascii_lowercase();
                if name == "item" || name == "entry" {
                    if let Some(cur) = current.take() {
                        items.push(cur);
                        count += 1;
                        if count >= 40 {
                            break;
                        }
                    }
                    in_item = false;
                    current_tag.clear();
                } else if in_item {
                    current_tag.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(format!("RSS_PARSE_FAILED source={} err={}", source_label, e));
            }
            _ => {}
        }
        buf.clear();
    }

    // Convert to NewsItem with bounds
    let mut out: Vec<NewsItem> = Vec::new();
    for raw in items {
        let title_raw = raw.title.unwrap_or_default().trim().to_string();
        if title_raw.is_empty() {
            continue;
        }
        let url_raw = raw.link.unwrap_or_default().trim().to_string();
        if url_raw.is_empty() {
            continue;
        }
        if url_raw.len() > MAX_URL_LEN {
            continue;
        }
        // validate host early skip
        if validate_news_url(&url_raw).is_err() {
            continue;
        }
        let pub_raw = raw.pub_date.unwrap_or_else(|| Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
        let iso = parse_pub_date_to_iso(&pub_raw).unwrap_or_else(|| Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
        let summary_raw = raw.description.unwrap_or_default();
        let summary_stripped = strip_html_tags(&summary_raw);
        let candidate = NewsItem {
            title: title_raw.chars().take(MAX_TITLE_LEN).collect(),
            url: url_raw,
            source: source_label.to_string(),
            published_at: iso,
            summary: summary_stripped.chars().take(MAX_SUMMARY_LEN).collect(),
        };
        match candidate.sanitize() {
            Ok(v) => out.push(v),
            Err(_) => continue,
        }
        if out.len() >= 20 {
            break;
        }
    }
    Ok(out)
}

// ---------- Fetching ----------

struct FeedDef {
    url: &'static str,
    source: &'static str,
}

const FEEDS: &[FeedDef] = &[
    FeedDef { url: "https://www.libretro.com/index.php/feed/", source: "Libretro" },
    FeedDef { url: "https://emudeck.github.io/blog/feed.xml", source: "EmuDeck" },
    FeedDef { url: "https://pcsx2.net/feed/", source: "PCSX2" },
    FeedDef { url: "https://dolphin-emu.org/rss.xml", source: "Dolphin" },
];

async fn fetch_one_feed(client: &reqwest::Client, feed: &FeedDef) -> Result<Vec<NewsItem>, String> {
    let resp = client.get(feed.url).send().await.map_err(|e| format!("FETCH_FAILED {}: {}", feed.url, e))?;
    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        return Err(format!("FETCH_STATUS {} for {}", status, feed.url));
    }
    if let Some(len) = resp.content_length() {
        if len > 2_000_000 {
            return Err(format!("FETCH_BODY_TOO_LARGE declared {} for {}", len, feed.url));
        }
    }
    let bytes = resp.bytes().await.map_err(|e| format!("FETCH_BYTES_FAILED {}: {}", feed.url, e))?;
    if bytes.len() > 2_000_000 {
        return Err(format!("FETCH_BODY_TOO_LARGE actual {} for {}", bytes.len(), feed.url));
    }
    let parsed = parse_rss_bytes(&bytes, feed.source)?;
    Ok(parsed)
}

fn dedup_and_sort(mut all: Vec<NewsItem>) -> Vec<NewsItem> {
    // dedup by url lowercased
    let mut seen: HashSet<String> = HashSet::new();
    let mut deduped = Vec::new();
    for it in all.drain(..) {
        let lc = it.url.to_ascii_lowercase();
        if seen.contains(&lc) {
            continue;
        }
        seen.insert(lc);
        deduped.push(it);
    }
    // sort descending by published_at – ISO8601 lexical works, but parse for safety
    deduped.sort_by(|a, b| {
        let da = a.published_at.parse::<DateTime<Utc>>().unwrap_or(Utc::now());
        let db = b.published_at.parse::<DateTime<Utc>>().unwrap_or(Utc::now());
        db.cmp(&da)
    });
    deduped.truncate(MAX_ITEMS);
    deduped
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn get_cached_news() -> Result<Vec<NewsItem>, String> {
    // SAFE_MODE allows read – news fetch allowed even safe mode
    match load_cached_news() {
        Ok(v) => {
            log_event("info", &format!("get_cached_news ok count={} safe_mode={}", v.len(), crate::safety::is_safe_mode()));
            Ok(v)
        }
        Err(e) => {
            log_event("warn", &format!("get_cached_news failed: {}", e));
            // Return empty rather than error to keep UI resilient – but we surface error as empty
            Ok(vec![])
        }
    }
}

#[tauri::command]
pub async fn refresh_news() -> Result<Vec<NewsItem>, String> {
    // SAFE_MODE: fetch allowed even in safe mode per spec – only write must respect safe path
    prune_news_cache()?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent(format!("CrystalFrontend/{} (EmuPulse)", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("CLIENT_BUILD_FAILED: {}", e))?;

    let mut all: Vec<NewsItem> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for feed in FEEDS {
        match fetch_one_feed(&client, feed).await {
            Ok(mut items) => {
                log_event("info", &format!("refresh_news fetched source={} url='{}' count={}", feed.source, feed.url, items.len()));
                all.append(&mut items);
            }
            Err(e) => {
                log_event("warn", &format!("refresh_news fetch failed source={} url='{}' err='{}'", feed.source, feed.url, e));
                errors.push(e);
                continue;
            }
        }
    }

    if all.is_empty() {
        // fallback to cached if fetch all failed
        let cached = load_cached_news().unwrap_or_default();
        if !cached.is_empty() {
            log_event("info", &format!("refresh_news fallback cached count={} errors={:?}", cached.len(), errors));
            return Ok(cached);
        }
        if !errors.is_empty() {
            return Err(format!("NEWS_FETCH_ALL_FAILED: {} – no cached fallback", errors.join(" | ")));
        }
        return Ok(vec![]);
    }

    let final_items = dedup_and_sort(all);

    // Save atomic – respect safe write path (inside app-data allowed even safe mode)
    match save_news(final_items.clone()) {
        Ok(_) => {},
        Err(e) => {
            log_event("warn", &format!("refresh_news save failed: {}", e));
            // still return fetched
        }
    }

    log_event("info", &format!("refresh_news ok final_count={} safe_mode={}", final_items.len(), crate::safety::is_safe_mode()));
    Ok(final_items)
}

#[tauri::command]
pub fn get_news_freshness() -> Result<bool, String> {
    let file = news_file_path();
    if !file.exists() {
        return Ok(false);
    }
    if let Ok(meta) = fs::metadata(&file) {
        if let Ok(modified) = meta.modified() {
            return Ok(is_fresh(modified));
        }
    }
    Ok(false)
}

// Safe external URL opener for news – https only, whitelist hosts same as news + steam store for future?

fn is_blocked_url_metachar(s: &str) -> bool {
    // block shell metachars similar to steam_launch
    let blocked = [';', '&', '|', '`', '$', '(', ')', '<', '>', '\n', '\r', '"', '\'', '\\'];
    for c in blocked {
        if s.contains(c) {
            return true;
        }
    }
    // allow % for url encoding but block if combined with suspicious
    if s.contains("%0a") || s.contains("%0A") || s.to_ascii_lowercase().contains("%3b") && s.contains(';') {
        return true;
    }
    false
}

#[tauri::command]
pub fn safe_url_open(url: String) -> Result<(), String> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err("SAFE_URL_EMPTY".to_string());
    }
    if trimmed.len() > 1024 {
        return Err(format!("SAFE_URL_TOO_LONG {} >1024", trimmed.len()));
    }
    if is_blocked_url_metachar(&trimmed) {
        return Err("SAFE_URL_BLOCKED_METACHAR".to_string());
    }

    // validate https + whitelist hosts (news whitelist)
    validate_news_url(&trimmed).or_else(|_e| {
        // Also allow steam store domain if used for other contexts? but for now only news
        // fallback allow generic https? Spec says https only host whitelist libretro.com docs.libretro.com emudeck.github.io pcsx2.net dolphin-emu.org
        // So we enforce that
        Err(format!("SAFE_URL_HOST_NOT_ALLOWED: {}", trimmed))
    })?;

    // Also ensure file not traversal etc – url only

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;
        // canonical safe: rundll32 url.dll,FileProtocolHandler
        let mut cmd = Command::new("rundll32.exe");
        cmd.arg("url.dll,FileProtocolHandler").arg(&trimmed);
        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
        cmd.spawn().map_err(|e| format!("SAFE_URL_OPEN_SPAWN_FAILED rundll32: {}", e))?;
        std::thread::sleep(Duration::from_millis(120));
    }

    #[cfg(not(target_os = "windows"))]
    {
        // non-windows CI – allow but simulate
        if std::env::var("CRYSTAL_SAFE_MODE").is_ok() {
            // still allowed but log
            log_event("info", &format!("safe_url_open safe_mode sim url='{}'", trimmed));
            return Ok(());
        }
        let _ = std::process::Command::new("xdg-open").arg(&trimmed).spawn();
    }

    log_event("info", &format!("safe_url_open ok url='{}'", trimmed));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::{clear_test_writable_root_override, set_test_writable_root_override};
    use crate::test_env_lock::acquire_shared_test_env_lock;
    use tempfile::tempdir;

    fn with_temp_root<F: FnOnce()>(f: F) {
        let _guard = acquire_shared_test_env_lock();
        let dir = tempdir().unwrap();
        let root = dir.path().join("CrystalFrontend");
        std::fs::create_dir_all(&root).unwrap();
        set_test_writable_root_override(root.clone());
        f();
        clear_test_writable_root_override();
    }

    #[test]
    fn validate_url_whitelist() {
        assert!(validate_news_url("https://www.libretro.com/index.php/2024/01/01/news/").is_ok());
        assert!(validate_news_url("https://docs.libretro.com/guides/").is_ok());
        assert!(validate_news_url("https://emudeck.github.io/blog/2024-01-01-update").is_ok());
        assert!(validate_news_url("https://pcsx2.net/blog/2024").is_ok());
        assert!(validate_news_url("https://dolphin-emu.org/blog/2024/01/01/").is_ok());
        assert!(validate_news_url("https://evil.com/steal").is_err());
        assert!(validate_news_url("http://pcsx2.net/feed/").is_err());
        assert!(validate_news_url("https://pcsx2.net:8080/feed/").is_err());
    }

    #[test]
    fn news_item_bounds() {
        let item = NewsItem {
            title: "A".repeat(250),
            url: "https://pcsx2.net/blog/test".to_string(),
            source: "PCSX2".to_string(),
            published_at: "2024-01-01T00:00:00Z".to_string(),
            summary: "B".repeat(600),
        };
        let sanitized = item.sanitize().unwrap();
        assert!(sanitized.title.len() <= MAX_TITLE_LEN);
        assert!(sanitized.summary.len() <= MAX_SUMMARY_LEN);
    }

    #[test]
    fn rss_parse_minimal() {
        let xml = br#"<?xml version="1.0"?><rss version="2.0"><channel><item><title>EmuDeck 2.7 - Wii fixes</title><link>https://emudeck.github.io/blog/2024-01-01-emudeck-2-7</link><pubDate>Tue, 02 Jan 2024 12:00:00 +0000</pubDate><description>Fixes for Wii</description></item></channel></rss>"#;
        let items = parse_rss_bytes(xml, "EmuDeck").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "EmuDeck 2.7 - Wii fixes");
        assert_eq!(items[0].source, "EmuDeck");
    }

    #[test]
    fn rss_parse_rejects_non_whitelisted() {
        let xml = br#"<?xml version="1.0"?><rss><channel><item><title>Bad</title><link>https://evil.com/bad</link><pubDate>2024-01-01T00:00:00Z</pubDate></item></channel></rss>"#;
        let items = parse_rss_bytes(xml, "Evil").unwrap();
        assert_eq!(items.len(), 0);
    }

    #[test]
    fn save_load_roundtrip() {
        with_temp_root(|| {
            let items = vec![
                NewsItem {
                    title: "Libretro 1.19 released".to_string(),
                    url: "https://www.libretro.com/index.php/retroarch-1-19-released/".to_string(),
                    source: "Libretro".to_string(),
                    published_at: "2024-01-02T12:00:00Z".to_string(),
                    summary: "Libretro core updates".to_string(),
                },
                NewsItem {
                    title: "PCSX2 2.0 progress".to_string(),
                    url: "https://pcsx2.net/blog/2024/01/01/pcsx2-2-0/".to_string(),
                    source: "PCSX2".to_string(),
                    published_at: "2024-01-03T10:00:00Z".to_string(),
                    summary: "PCSX2 improvements".to_string(),
                }
            ];
            save_news(items.clone()).unwrap();
            let loaded = load_cached_news().unwrap();
            assert_eq!(loaded.len(), 2);
            // oversize prune
            let file = news_file_path();
            assert!(file.exists());
        })
    }

    #[test]
    fn prune_oversize() {
        with_temp_root(|| {
            ensure_news_dir().unwrap();
            let file = news_file_path();
            let big = "x".repeat(MAX_NEWS_BYTES + 10);
            std::fs::write(&file, big.as_bytes()).unwrap();
            prune_news_cache().unwrap();
            assert!(!file.exists(), "oversize file should be pruned");
        })
    }

    #[test]
    fn ttl_freshness() {
        assert!(is_fresh(SystemTime::now()));
        let old = SystemTime::now() - std::time::Duration::from_secs(TTL_SECS + 10);
        assert!(!is_fresh(old));
    }

    #[test]
    fn safe_url_open_blocks_injection() {
        assert!(safe_url_open("https://www.libretro.com/; rm -rf /".to_string()).is_err());
        assert!(safe_url_open("https://pcsx2.net/blog | evil".to_string()).is_err());
    }
}
