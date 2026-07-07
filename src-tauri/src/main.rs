#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod db;
mod engine;
mod tray;
mod windows;

use config::{load_config, save_config, Config, AlarmSound};
use db::{init_db, log_completed_session};
use engine::{EngineConfig, TimerEngine, TimerState, SessionType, TimerStatus};
use windows::{create_float_window, create_main_window, close_float_window, close_main_window, save_float_bounds};
use tray::setup_tray;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

struct AppState {
    engine: Arc<Mutex<TimerEngine>>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AlarmPayload {
    sound: AlarmSound,
    muted: bool,
    endedType: SessionType,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
pub enum ControlCommand {
    Start,
    Pause,
    Resume,
    Restart,
    Cancel,
    AddTime,
}

// --- Tauri Commands ---------------------------------------------------------

#[tauri::command]
fn timer_get_state(state: State<'_, AppState>) -> TimerState {
    let engine = state.engine.lock().unwrap();
    engine.get_state()
}

#[tauri::command]
fn timer_control(
    cmd: ControlCommand,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    let mut engine = state.engine.lock().unwrap();
    match cmd {
        ControlCommand::Start => engine.start(),
        ControlCommand::Pause => engine.pause(),
        ControlCommand::Resume => engine.resume(),
        ControlCommand::Restart => engine.restart(),
        ControlCommand::Cancel => engine.cancel(),
        ControlCommand::AddTime => engine.add_time(),
    }
    let s = engine.get_state();
    let _ = app.emit("timer:stateChanged", s.clone());
    Ok(s)
}

#[tauri::command]
fn timer_dismiss_alarm(app: AppHandle, state: State<'_, AppState>) -> Result<TimerState, String> {
    let mut engine = state.engine.lock().unwrap();
    let _ = engine.dismiss();
    let s = engine.get_state();
    let _ = app.emit("timer:stateChanged", s.clone());
    Ok(s)
}

#[tauri::command]
fn config_get(app: AppHandle) -> Config {
    load_config(&app)
}

#[tauri::command]
fn config_set(patch: Config, app: AppHandle, state: State<'_, AppState>) -> Result<Config, String> {
    save_config(&app, &patch)?;
    
    // Update active engine config with new durations
    let mut engine = state.engine.lock().unwrap();
    engine.update_config(EngineConfig {
        focus_minutes: patch.focusMinutes,
        short_break_minutes: patch.shortBreakMinutes,
        long_break_minutes: patch.longBreakMinutes,
        sessions_before_long_break: patch.sessionsBeforeLongBreak,
        add_time_minutes: patch.addTimeMinutes,
    });

    let _ = app.emit("config:changed", patch.clone());
    let _ = app.emit("timer:stateChanged", engine.get_state());
    Ok(patch)
}

#[tauri::command]
fn audio_get_custom(app: AppHandle) -> Option<Vec<u8>> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let audio_path = resource_dir.join("resources/A_Steady_Ascent.mp3");
        if audio_path.exists() {
            return std::fs::read(audio_path).ok();
        }
    }
    None
}

#[tauri::command]
fn window_open_float(app: AppHandle) -> Result<(), String> {
    let mut cfg = load_config(&app);
    cfg.lastMode = "float".to_string();
    let _ = save_config(&app, &cfg);

    create_float_window(&app)?;
    close_main_window(&app);
    Ok(())
}

#[tauri::command]
fn window_open_main(app: AppHandle) -> Result<(), String> {
    let mut cfg = load_config(&app);
    cfg.lastMode = "full".to_string();
    let _ = save_config(&app, &cfg);

    create_main_window(&app)?;
    close_float_window(&app);
    Ok(())
}

#[tauri::command]
fn window_save_bounds(x: i32, y: i32, app: AppHandle) {
    save_float_bounds(&app, x, y);
}

// --- Main Runner ------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second instance handler
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            } else if let Some(win) = app.get_webview_window("float") {
                let _ = win.show();
                let _ = win.set_focus();
            } else {
                let _ = create_main_window(app);
            }
        }))
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Initialize SQLite
            let _ = init_db(&app_handle);

            // Load initial config
            let cfg = load_config(&app_handle);

            // Initialize the engine
            let engine = TimerEngine::new(
                EngineConfig {
                    focus_minutes: cfg.focusMinutes,
                    short_break_minutes: cfg.shortBreakMinutes,
                    long_break_minutes: cfg.longBreakMinutes,
                    sessions_before_long_break: cfg.sessionsBeforeLongBreak,
                    add_time_minutes: cfg.addTimeMinutes,
                },
                None,
            );

            let engine_arc = Arc::new(Mutex::new(engine));
            app.manage(AppState {
                engine: engine_arc.clone(),
            });

            // Set up native system tray
            let _ = setup_tray(&app_handle);

            // Open initial window
            if cfg.reopenInLastMode && cfg.lastMode == "float" {
                let _ = create_float_window(&app_handle);
            } else {
                let _ = create_main_window(&app_handle);
            }

            // Spawn background timer tick loop (250ms)
            std::thread::spawn(move || {
                let ticker_app = app_handle;
                loop {
                    std::thread::sleep(Duration::from_millis(250));
                    
                    let mut engine = match ticker_app.try_state::<AppState>() {
                        Some(state) => state.engine.lock().unwrap(),
                        None => break, // app shut down
                    };

                    // Check if current running session finished
                    if let Some(ended_type) = engine.tick() {
                        let cfg = load_config(&ticker_app);
                        let is_focus = ended_type == SessionType::Focus;
                        let play_payload = AlarmPayload {
                            sound: if is_focus { cfg.focusEndSound } else { cfg.breakEndSound },
                            muted: if is_focus { cfg.muteFocusEnd } else { cfg.muteBreakEnd },
                            endedType: ended_type,
                        };

                        // SQLite Logger: focus sessions
                        if is_focus {
                            let _ = log_completed_session(&ticker_app, ended_type.to_str(), cfg.focusMinutes);
                        }

                        // Broadcast playAlarm
                        let _ = ticker_app.emit("timer:playAlarm", play_payload);

                        // Broadcast stateChanged
                        let s = engine.get_state();
                        let _ = ticker_app.emit("timer:stateChanged", s);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            timer_get_state,
            timer_control,
            timer_dismiss_alarm,
            config_get,
            config_set,
            audio_get_custom,
            window_open_float,
            window_open_main,
            window_save_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
