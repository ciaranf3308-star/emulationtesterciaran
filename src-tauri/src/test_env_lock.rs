/// Shared process-wide lock for tests that mutate global environment / safe-mode state.
/// Both `import_game` and `safety` tests must use the same lock to stay safe under `cargo test` parallel mode.
use std::sync::{Mutex, OnceLock};

static SHARED_TEST_ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn shared_mutex() -> &'static Mutex<()> {
    SHARED_TEST_ENV_LOCK.get_or_init(|| Mutex::new(()))
}

/// Acquire the shared test env lock. Blocks until available.
/// Use this in tests that touch `CRYSTAL_MACHINE_CONFIG`, `CRYSTAL_SAFE_MODE`, or `SAFE_MODE`.
#[cfg(test)]
pub fn acquire_shared_test_env_lock() -> std::sync::MutexGuard<'static, ()> {
    shared_mutex().lock().unwrap_or_else(|e| e.into_inner())
}

/// For non-test code (or when you need the mutex reference directly)
#[cfg(test)]
pub fn shared_env_mutex() -> &'static Mutex<()> {
    shared_mutex()
}
