// ---------- Machine Config discovery – single authority ----------
// This module is the canonical source for machine-config location & loading.
use std::collections::HashSet;
use std::path::PathBuf;

use crate::safety::{crystal_writable_root, is_safe_mode, log_event};

pub fn candidate_config_paths() -> Vec<PathBuf> {
    let mut cands = Vec::new();
    if let Ok(envp) = std::env::var("CRYSTAL_MACHINE_CONFIG") {
        if !envp.trim().is_empty() {
            cands.push(PathBuf::from(envp));
        }
    }
    if let Ok(cur) = std::env::current_exe() {
        if let Some(parent) = cur.parent() {
            cands.push(parent.join("crystal-machine-config.json"));
            cands.push(parent.join("machine-config.json"));
            if let Some(gparent) = parent.parent() {
                cands.push(gparent.join("crystal-machine-config.json"));
                cands.push(gparent.join("machine-config.json"));
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        cands.push(cwd.join("crystal-machine-config.json"));
        cands.push(cwd.join("machine-config.json"));
        if let Some(p) = cwd.parent() {
            cands.push(p.join("crystal-machine-config.json"));
            cands.push(p.join("machine-config.json"));
            if let Some(gp) = p.parent() {
                cands.push(gp.join("crystal-machine-config.json"));
            }
        }
    }
    if let Some(data_local) = dirs::data_local_dir() {
        cands.push(
            data_local
                .join("CrystalFrontend")
                .join("crystal-machine-config.json"),
        );
        cands.push(
            data_local
                .join("Crystal Frontend")
                .join("crystal-machine-config.json"),
        );
        cands.push(
            data_local
                .join("CrystalFrontend")
                .join("machine-config.json"),
        );
    }
    if let Some(config_dir) = dirs::config_dir() {
        cands.push(
            config_dir
                .join("CrystalFrontend")
                .join("crystal-machine-config.json"),
        );
        cands.push(
            config_dir
                .join("Crystal Frontend")
                .join("crystal-machine-config.json"),
        );
    }
    if let Some(home) = dirs::home_dir() {
        cands.push(home.join("crystal-machine-config.json"));
        cands.push(
            home.join(".config")
                .join("crystal")
                .join("crystal-machine-config.json"),
        );
    }
    let mut uniq = Vec::new();
    let mut seen = HashSet::new();
    for p in cands {
        let s = p.to_string_lossy().to_string();
        if seen.insert(s) {
            uniq.push(p);
        }
    }
    uniq
}

pub fn load_machine_config_json() -> Result<serde_json::Value, String> {
    let candidates = candidate_config_paths();
    let mut tried: Vec<String> = Vec::new();
    for path in &candidates {
        tried.push(path.display().to_string());
        if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(v) => {
                        if v.get("schemaVersion").is_none() {
                            let msg = format!("Config at {} missing schemaVersion", path.display());
                            log_event(
                                "warn",
                                &format!("machine_config discovery invalid: {}", msg),
                            );
                            return Err(msg);
                        }
                        if v.get("systems").and_then(|s| s.as_array()).is_none() {
                            let msg = format!("Config at {} missing systems array", path.display());
                            log_event(
                                "warn",
                                &format!("machine_config discovery invalid: {}", msg),
                            );
                            return Err(msg);
                        }
                        let sv = v.get("schemaVersion").and_then(|s| s.as_u64()).unwrap_or(0);
                        if sv != 1 {
                            let msg =
                                format!("Unsupported schemaVersion {} at {}", sv, path.display());
                            log_event("warn", &msg);
                            return Err(msg);
                        }
                        let sys_count = v
                            .get("systems")
                            .and_then(|s| s.as_array())
                            .map(|a| a.len())
                            .unwrap_or(0);
                        log_event(
                            "info",
                            &format!(
                                "machine_config loaded ok from '{}' schemaVersion={} systems={} writable_root='{}' safe_mode={}",
                                path.display(),
                                sv,
                                sys_count,
                                crystal_writable_root().display(),
                                is_safe_mode()
                            ),
                        );
                        return Ok(v);
                    }
                    Err(e) => {
                        let msg = format!("Failed to parse JSON at {}: {}", path.display(), e);
                        log_event("error", &msg);
                        return Err(msg);
                    }
                },
                Err(_) => continue,
            }
        }
    }
    let msg = format!(
        "Real machine configuration failed to load – frontend cannot start with example data in installed mode. No machine-local config found. Tried: {}. Place crystal-machine-config.json next to executable, in current directory, in %LOCALAPPDATA%/CrystalFrontend/, or set CRYSTAL_MACHINE_CONFIG env var.",
        tried.join(", ")
    );
    log_event(
        "error",
        &format!("machine_config discovery failed: {}", msg),
    );
    Err(msg)
}

pub fn find_system_in_config<'a>(
    config: &'a serde_json::Value,
    system_id: &str,
) -> Option<&'a serde_json::Value> {
    let systems = config.get("systems")?.as_array()?;
    for sys in systems {
        if sys.get("id").and_then(|i| i.as_str()) == Some(system_id) {
            return Some(sys);
        }
    }
    None
}

pub fn get_rom_dir_and_exts(
    system_json: &serde_json::Value,
) -> Result<(String, Vec<String>), String> {
    let rom_dir = system_json
        .get("romDirectory")
        .and_then(|r| r.as_str())
        .ok_or_else(|| "MachineSystem missing romDirectory".to_string())?
        .to_string();
    if rom_dir.trim().is_empty() {
        return Err("romDirectory empty".to_string());
    }
    let exts_val = system_json
        .get("validExtensions")
        .and_then(|e| e.as_array());
    let mut exts = Vec::new();
    if let Some(arr) = exts_val {
        for v in arr {
            if let Some(s) = v.as_str() {
                let t = s.trim();
                if !t.is_empty() {
                    exts.push(t.to_string());
                }
            }
        }
    }
    if exts.is_empty() {
        return Err(format!(
            "MachineSystem '{}' has empty validExtensions – import/config requires explicit validExtensions. Failing closed.",
            system_json.get("id").and_then(|i| i.as_str()).unwrap_or("unknown")
        ));
    }
    Ok((rom_dir, exts))
}
