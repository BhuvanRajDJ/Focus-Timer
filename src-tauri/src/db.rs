use chrono::Utc;
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push("focus_timer.db");
    path
}

pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let path = get_db_path(app);
    let conn = Connection::open(&path).map_err(|e| format!("DB Open Error: {}", e))?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS completed_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_type TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            completed_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("DB Table Create Error: {}", e))?;

    Ok(())
}

pub fn log_completed_session(app: &AppHandle, session_type: &str, duration_minutes: u32) -> Result<(), String> {
    let path = get_db_path(app);
    let conn = Connection::open(&path).map_err(|e| format!("DB Open Error: {}", e))?;
    
    let now_iso = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO completed_sessions (session_type, duration_minutes, completed_at) VALUES (?1, ?2, ?3)",
        params![session_type, duration_minutes, now_iso],
    )
    .map_err(|e| format!("DB Log Insert Error: {}", e))?;

    Ok(())
}
