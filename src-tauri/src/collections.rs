//! Collections – Pinned + Backlog for V3.1
//! Rust backend parity with notes, ~3KB atomic write, SAFE_MODE block, symlink/traversal reject, bounded <4KB
//! State file: writable_root + state/collections.json via safety.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use crate::safety::{crystal_writable_root, is_safe_write_path, is_safe_mode, log_event};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PinnedItem {
  pub system_id: String,
  pub rom_basename: String,
  #[serde(default)]
  pub rom_path: Option<String>,
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub added_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BacklogItem {
  pub system_id: String,
  pub rom_basename: String,
  #[serde(default)]
  pub rom_path: Option<String>,
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub queued: Option<bool>,
  #[serde(default)]
  pub added_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionState {
  pub pinned: Vec<PinnedItem>,   // max 5
  pub backlog: Vec<BacklogItem>, // unbounded but bounded file size <4KB
  #[serde(default = "default_version")]
  pub version: u8,
}

fn default_version() -> u8 { 1 }

impl Default for CollectionState {
  fn default() -> Self {
    Self { pinned: vec![], backlog: vec![], version: 1 }
  }
}

fn now_ts() -> u64 {
  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn collections_file_path() -> Result<PathBuf, String> {
  let root = crystal_writable_root();
  let dir = root.join("state");
  fs::create_dir_all(&dir).map_err(|e| format!("COLLECTIONS_DIR_FAILED '{}': {}", dir.display(), e))?;
  let p = dir.join("collections.json");
  is_safe_write_path(&p).map_err(|e| format!("COLLECTIONS_PATH_UNSAFE '{}': {}", p.display(), e))?;
  if p.exists() {
    if let Ok(meta) = fs::symlink_metadata(&p) {
      if meta.file_type().is_symlink() {
        let _ = fs::remove_file(&p);
      }
    }
  }
  Ok(p)
}

fn sanitize_segment(s: &str) -> Result<String, String> {
  let t = s.trim();
  if t.is_empty() { return Err("EMPTY_SEGMENT".to_string()) }
  if t.contains('/') || t.contains('\\') || t.contains(':') || t.contains("..") {
    return Err(format!("SEGMENT_INVALID '{}'", s))
  }
  if t.to_lowercase().contains("secret") || t.to_lowercase().contains("token") {
    return Err("SEGMENT_REJECTED_SECRET".to_string())
  }
  Ok(t.to_string())
}

fn validate_pinned_item(item: &PinnedItem) -> Result<(), String> {
  sanitize_segment(&item.system_id)?;
  sanitize_segment(&item.rom_basename)?;
  if item.system_id.len() > 64 || item.rom_basename.len() > 256 {
    return Err("PINNED_ITEM_TOO_LONG".to_string())
  }
  Ok(())
}
fn validate_backlog_item(item: &BacklogItem) -> Result<(), String> {
  sanitize_segment(&item.system_id)?;
  sanitize_segment(&item.rom_basename)?;
  if item.system_id.len() > 64 || item.rom_basename.len() > 256 { return Err("BACKLOG_ITEM_TOO_LONG".to_string()) }
  Ok(())
}

fn load_state_inner() -> CollectionState {
  let path = match collections_file_path() {
    Ok(p) => p,
    Err(_) => return CollectionState::default(),
  };
  if !path.exists() { return CollectionState::default() }
  if let Ok(meta) = fs::metadata(&path) {
    if meta.len() > 8*1024 { let _ = fs::remove_file(&path); return CollectionState::default() }
  }
  let content = match fs::read_to_string(&path) {
    Ok(c) => c,
    Err(_) => return CollectionState::default(),
  };
  if content.len() > 8*1024 { return CollectionState::default() }
  match serde_json::from_str::<CollectionState>(&content) {
    Ok(mut s) => {
      if s.version != 1 { s.version = 1 }
      // cap pinned 5
      if s.pinned.len() > 5 { s.pinned.truncate(5) }
      s
    },
    Err(_) => CollectionState::default(),
  }
}

fn save_state_inner(state: &CollectionState) -> Result<PathBuf, String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".to_string()) }
  if state.pinned.len() > 5 { return Err("PINNED_MAX_5".to_string()) }
  // validate each
  for p in &state.pinned { validate_pinned_item(p)? }
  for b in &state.backlog { validate_backlog_item(b)? }

  let json = serde_json::to_string(state).map_err(|e| format!("COLLECTIONS_SERIALIZE {}", e))?;
  if json.len() > 4096 {
    return Err(format!("COLLECTIONS_BOUNDED_EXCEEDED {} > 4096", json.len()))
  }
  if json.to_ascii_lowercase().contains("secret") || json.to_ascii_lowercase().contains("token") {
    return Err("COLLECTIONS_REJECTED_SECRET_FIELD".to_string())
  }
  let path = collections_file_path()?;
  let tmp = path.with_extension("tmp");
  fs::write(&tmp, json.as_bytes()).map_err(|e| format!("COLLECTIONS_WRITE_TMP {}: {}", tmp.display(), e))?;
  fs::rename(&tmp, &path).map_err(|e| { let _ = fs::remove_file(&tmp); format!("COLLECTIONS_RENAME {}", e) })?;
  log_event("info", &format!("collections_saved pinned={} backlog={} bytes={}", state.pinned.len(), state.backlog.len(), json.len()));
  Ok(path)
}

#[tauri::command]
pub fn get_collections() -> CollectionState {
  load_state_inner()
}

#[tauri::command]
pub fn set_pinned(pinned: Vec<PinnedItem>) -> Result<CollectionState, String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".into()) }
  if pinned.len() > 5 { return Err("PINNED_MAX_5: max 5 pinned allowed".to_string()) }
  let mut state = load_state_inner();
  let now = now_ts();
  let mut cleaned: Vec<PinnedItem> = pinned.into_iter().map(|mut p| { if p.added_at.is_none() { p.added_at = Some(now) } p.system_id = p.system_id.trim().to_string(); p.rom_basename = p.rom_basename.trim().to_string(); p }).collect();
  // dedupe by system+basename keep first
  let mut seen = std::collections::HashSet::new();
  cleaned.retain(|x| {
    let k = format!("{}::{}", x.system_id.to_lowercase(), x.rom_basename.to_lowercase());
    if seen.contains(&k) { false } else { seen.insert(k); true }
  });
  for p in &cleaned { validate_pinned_item(p)? }
  state.pinned = cleaned;
  state.version = 1;
  save_state_inner(&state)?;
  Ok(state)
}

#[tauri::command]
pub fn toggle_pinned(item: PinnedItem) -> Result<CollectionState, String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".into()) }
  validate_pinned_item(&item)?;
  let mut state = load_state_inner();
  let key = format!("{}::{}", item.system_id.to_lowercase(), item.rom_basename.to_lowercase());
  let pos = state.pinned.iter().position(|p| format!("{}::{}", p.system_id.to_lowercase(), p.rom_basename.to_lowercase()) == key);
  if let Some(idx) = pos {
    state.pinned.remove(idx);
  } else {
    if state.pinned.len() >= 5 {
      return Err("PINNED_MAX_5_REACHED: max 5 pinned items".to_string())
    }
    let mut new_item = item;
    new_item.added_at = Some(now_ts());
    new_item.system_id = new_item.system_id.trim().to_string();
    new_item.rom_basename = new_item.rom_basename.trim().to_string();
    state.pinned.insert(0, new_item);
  }
  save_state_inner(&state)?;
  Ok(state)
}

#[tauri::command]
pub fn set_backlog(backlog: Vec<BacklogItem>) -> Result<CollectionState, String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".into()) }
  let mut state = load_state_inner();
  let now = now_ts();
  let mut cleaned: Vec<BacklogItem> = backlog.into_iter().map(|mut b| { if b.added_at.is_none() { b.added_at = Some(now) } b.system_id = b.system_id.trim().to_string(); b.rom_basename = b.rom_basename.trim().to_string(); b }).collect();
  // dedupe
  let mut seen = std::collections::HashSet::new();
  cleaned.retain(|x| {
    let k = format!("{}::{}", x.system_id.to_lowercase(), x.rom_basename.to_lowercase());
    if seen.contains(&k) { false } else { seen.insert(k); true }
  });
  for b in &cleaned { validate_backlog_item(b)? }
  state.backlog = cleaned;
  state.version = 1;
  save_state_inner(&state)?;
  Ok(state)
}

#[tauri::command]
pub fn toggle_backlog(item: BacklogItem) -> Result<CollectionState, String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".into()) }
  validate_backlog_item(&item)?;
  let mut state = load_state_inner();
  let key = format!("{}::{}", item.system_id.to_lowercase(), item.rom_basename.to_lowercase());
  let pos = state.backlog.iter().position(|b| format!("{}::{}", b.system_id.to_lowercase(), b.rom_basename.to_lowercase()) == key);
  if let Some(idx) = pos {
    // toggle queued flag if exists else remove? For backlog queued toggle marks, we'll remove on second toggle as simple
    state.backlog.remove(idx);
  } else {
    let mut new_item = item;
    new_item.added_at = Some(now_ts());
    new_item.system_id = new_item.system_id.trim().to_string();
    new_item.rom_basename = new_item.rom_basename.trim().to_string();
    if new_item.queued.is_none() { new_item.queued = Some(true) }
    state.backlog.insert(0, new_item);
  }
  // check bounded still <4KB after insertion – save will enforce
  save_state_inner(&state)?;
  Ok(state)
}

#[tauri::command]
pub fn clear_collections() -> Result<(), String> {
  if is_safe_mode() { return Err("SAFE_MODE_BLOCKED_COLLECTIONS".into()) }
  let path = collections_file_path()?;
  let _ = fs::remove_file(path);
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_env_lock::acquire_shared_test_env_lock;
  use tempfile::tempdir;

  fn with_temp<F: FnOnce()>(f: F) {
    let _g = acquire_shared_test_env_lock();
    let dir = tempdir().unwrap();
    let root = dir.path().join("CrystalFrontend");
    std::fs::create_dir_all(&root).unwrap();
    crate::safety::set_test_writable_root_override(root.clone());
    f();
    crate::safety::clear_test_writable_root_override();
  }

  #[test]
  fn roundtrip_empty() {
    with_temp(|| {
      let state = get_collections();
      assert_eq!(state.pinned.len(), 0);
      assert_eq!(state.backlog.len(), 0);
    })
  }

  #[test]
  fn pin_toggle_max5() {
    with_temp(|| {
      for i in 0..5 {
        let item = PinnedItem { system_id: format!("ps2"), rom_basename: format!("game{}", i), rom_path: None, name: None, added_at: None };
        let res = toggle_pinned(item).unwrap();
        assert!(res.pinned.len() <= 5);
      }
      // 6th should fail
      let item6 = PinnedItem { system_id: "ps2".into(), rom_basename: "game5".into(), rom_path: None, name: None, added_at: None };
      let err = toggle_pinned(item6).unwrap_err();
      assert!(err.contains("MAX_5") || err.contains("PINNED_MAX"));
      let _ = clear_collections();
    })
  }

  #[test]
  fn traversal_reject() {
    with_temp(|| {
      let bad = PinnedItem { system_id: "../evil".into(), rom_basename: "game".into(), rom_path: None, name: None, added_at: None };
      assert!(toggle_pinned(bad).is_err());
      let bad2 = BacklogItem { system_id: "ps2".into(), rom_basename: "a/b".into(), rom_path: None, name: None, queued: None, added_at: None };
      assert!(toggle_backlog(bad2).is_err());
    })
  }

  #[test]
  fn safe_mode_blocks() {
    let _g = acquire_shared_test_env_lock();
    std::env::set_var("CRYSTAL_SAFE_MODE","1");
    let item = PinnedItem { system_id: "ps2".into(), rom_basename: "game".into(), rom_path: None, name: None, added_at: None };
    let err = toggle_pinned(item).unwrap_err();
    assert!(err.contains("SAFE_MODE"));
    std::env::remove_var("CRYSTAL_SAFE_MODE");
    crate::safety::set_safe_mode_for_tests(false);
  }

  #[test]
  fn bounded_exceeded() {
    with_temp(|| {
      // large backlog to exceed 4KB
      let mut big = vec![];
      for i in 0..100 {
        big.push(BacklogItem { system_id: "ps2".into(), rom_basename: format!("a_very_long_basename_to_exhaust_capacity_{}_extra_padding_to_inflate_file_size_beyond_limit", i), rom_path: Some("/very/long/path/repeated/".repeat(3)), name: Some("Very Long Game Name That Adds Bytes".repeat(2)), queued: Some(true), added_at: Some(123) })
      }
      let res = set_backlog(big);
      assert!(res.is_err());
      let _ = clear_collections();
    })
  }
}
