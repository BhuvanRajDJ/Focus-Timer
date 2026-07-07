use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AlarmSound {
    Chime,
    Beep,
    Marimba,
    SteadyAscent,
}

impl Default for AlarmSound {
    fn default() -> Self {
        AlarmSound::Chime
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FloatBounds {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
}

impl Default for FloatBounds {
    fn default() -> Self {
        FloatBounds {
            x: None,
            y: None,
            width: 150,
            height: 42,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
#[allow(non_snake_case)]
pub struct Config {
    pub focusMinutes: u32,
    pub shortBreakMinutes: u32,
    pub longBreakMinutes: u32,
    pub sessionsBeforeLongBreak: u32,
    pub addTimeMinutes: u32,
    pub focusEndSound: AlarmSound,
    pub breakEndSound: AlarmSound,
    pub muteFocusEnd: bool,
    pub muteBreakEnd: bool,
    pub reopenInLastMode: bool,
    pub lastMode: String, // "full" or "float"
    pub floatBounds: FloatBounds,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            focusMinutes: 25,
            shortBreakMinutes: 5,
            longBreakMinutes: 15,
            sessionsBeforeLongBreak: 4,
            addTimeMinutes: 5,
            focusEndSound: AlarmSound::Chime,
            breakEndSound: AlarmSound::Marimba,
            muteFocusEnd: false,
            muteBreakEnd: false,
            reopenInLastMode: true,
            lastMode: "full".to_string(),
            floatBounds: FloatBounds::default(),
        }
    }
}

fn clamp(v: u32, lo: u32, hi: u32, fallback: u32) -> u32 {
    if v < lo || v > hi {
        fallback
    } else {
        v
    }
}

pub fn sanitize(input: Config) -> Config {
    Config {
        focusMinutes: clamp(input.focusMinutes, 1, 180, 25),
        shortBreakMinutes: clamp(input.shortBreakMinutes, 1, 180, 5),
        longBreakMinutes: clamp(input.longBreakMinutes, 1, 180, 15),
        sessionsBeforeLongBreak: clamp(input.sessionsBeforeLongBreak, 2, 8, 4),
        addTimeMinutes: clamp(input.addTimeMinutes, 1, 60, 5),
        focusEndSound: input.focusEndSound,
        breakEndSound: input.breakEndSound,
        muteFocusEnd: input.muteFocusEnd,
        muteBreakEnd: input.muteBreakEnd,
        reopenInLastMode: input.reopenInLastMode,
        lastMode: if input.lastMode == "float" { "float".to_string() } else { "full".to_string() },
        floatBounds: FloatBounds {
            x: input.floatBounds.x,
            y: input.floatBounds.y,
            width: clamp(input.floatBounds.width, 40, 400, 150),
            height: clamp(input.floatBounds.height, 40, 400, 42),
        },
    }
}

pub fn get_config_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push("config.json");
    path
}

pub fn load_config(app: &AppHandle) -> Config {
    let path = get_config_path(app);
    if !path.exists() {
        let default_cfg = Config::default();
        let _ = save_config(app, &default_cfg);
        return default_cfg;
    }

    match fs::read_to_string(&path) {
        Ok(data) => match serde_json::from_str::<Config>(&data) {
            Ok(cfg) => sanitize(cfg),
            Err(_) => {
                let default_cfg = Config::default();
                let _ = save_config(app, &default_cfg);
                default_cfg
            }
        },
        Err(_) => Config::default(),
    }
}

pub fn save_config(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = get_config_path(app);
    let sanitized = sanitize(cfg.clone());
    match serde_json::to_string_pretty(&sanitized) {
        Ok(json) => match fs::write(&path, json) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to write config file: {}", e)),
        },
        Err(e) => Err(format!("Failed to serialize config: {}", e)),
    }
}
