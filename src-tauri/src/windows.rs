use crate::config::{load_config, save_config};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, PhysicalPosition};

pub fn create_main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(win);
    }

    let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Focus Timer")
        .inner_size(380.0, 560.0)
        .min_inner_size(320.0, 480.0)
        .background_color(tauri::Color(20, 22, 28, 255)) // #14161c
        .resizable(true)
        .visible(false)
        .build()
        .map_err(|e| format!("Failed to build main window: {}", e))?;

    let _ = win.show();
    Ok(win)
}

pub fn create_float_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(win);
    }

    let cfg = load_config(app);
    let mut builder = WebviewWindowBuilder::new(app, "float", WebviewUrl::App("float.html".into()))
        .title("Focus Timer — Floating")
        .inner_size(150.0, 42.0)
        .min_inner_size(150.0, 42.0)
        .max_inner_size(150.0, 42.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false);

    // Position window if saved bounds exist
    if let (Some(x), Some(y)) = (cfg.floatBounds.x, cfg.floatBounds.y) {
        builder = builder.position(x as f64, y as f64);
    }

    let win = builder.build().map_err(|e| format!("Failed to build float window: {}", e))?;

    // Keep restored position on-screen (check monitors to prevent off-screen window)
    if let (Some(x), Some(y)) = (cfg.floatBounds.x, cfg.floatBounds.y) {
        if let Ok(monitors) = win.available_monitors() {
            let mut on_screen = false;
            for m in monitors {
                let pos = m.position();
                let size = m.size();
                let mx = pos.x;
                let my = pos.y;
                let mw = size.width as i32;
                let mh = size.height as i32;

                // Simple check if the top-left is inside this monitor
                if x >= mx && x < mx + mw && y >= my && y < my + mh {
                    on_screen = true;
                    break;
                }
            }

            // If not on any monitor, move it to the primary or first monitor's center/top-right
            if !on_screen {
                if let Ok(Some(m)) = win.primary_monitor() {
                    let pos = m.position();
                    let size = m.size();
                    // Place near top right of primary monitor
                    let target_x = pos.x + (size.width as i32) - 200;
                    let target_y = pos.y + 100;
                    let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(target_x, target_y)));
                }
            }
        }
    }

    let _ = win.show();

    // Re-assert always on top on blur to ensure it stays above other windows on Windows
    let win_clone = win.clone();
    let app_clone = app.clone();
    win.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Focused(false) => {
                let _ = win_clone.set_always_on_top(true);
            }
            tauri::WindowEvent::CloseRequested { .. } => {
                if let Ok(pos) = win_clone.outer_position() {
                    save_float_bounds(&app_clone, pos.x, pos.y);
                }
            }
            _ => {}
        }
    });

    Ok(win)
}

pub fn close_float_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        // Position is saved on CloseRequested
        let _ = win.close();
    }
}

pub fn close_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

pub fn save_float_bounds(app: &AppHandle, x: i32, y: i32) {
    let mut cfg = load_config(app);
    cfg.floatBounds.x = Some(x);
    cfg.floatBounds.y = Some(y);
    let _ = save_config(app, &cfg);
}
