//! Local, per-machine settings. Permission choices live ONLY here — they are never pushed to the Relay.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const SECRET_SERVICE: &str = "viex-host";
const SECRET_USER: &str = "relay-password";

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct TrustedViewer {
    pub viewer_id: String,
    pub name: String,
    /// "auto-approve" or "quiet"
    pub mode: String,
    pub added_at: f64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Config {
    pub device_id: String,
    pub device_name: String,
    pub server_url: String,
    pub trusted_viewers: Vec<TrustedViewer>,
    /// JSON array of ICE servers; empty means "use the Relay's / built-in defaults".
    pub custom_ice: String,
    /// "balanced" | "high" | "max" — stream quality preset (empty = high).
    pub quality: String,
    /// "system" | "light" | "dark"
    pub theme: String,
    pub setup_complete: bool,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> Result<Config, String> {
    let path = config_path(app)?;
    let mut config: Config = match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Config::default(),
    };
    let mut dirty = false;
    if config.device_id.is_empty() {
        config.device_id = uuid::Uuid::new_v4().simple().to_string();
        dirty = true;
    }
    if config.device_name.is_empty() {
        config.device_name = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .filter(|h| !h.is_empty())
            .unwrap_or_else(|| "My-PC".into());
        dirty = true;
    }
    if config.quality.is_empty() {
        config.quality = "high".into();
        dirty = true;
    }
    if config.theme.is_empty() {
        config.theme = "system".into();
        dirty = true;
    }
    if dirty {
        save(app, &config)?;
    }
    Ok(config)
}

pub fn save(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<Config, String> {
    load(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    save(&app, &config)
}

fn secret_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SECRET_SERVICE, SECRET_USER).map_err(|e| e.to_string())
}

/// The Relay password lives in the OS credential vault, not in config.json.
#[tauri::command]
pub fn get_secret() -> Result<Option<String>, String> {
    match secret_entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_secret(value: String) -> Result<(), String> {
    secret_entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_secret() -> Result<(), String> {
    match secret_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
