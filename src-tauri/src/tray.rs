use crate::windows::{create_float_window, create_main_window};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let tray_menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open_main", "Open timer", true, None::<&str>).unwrap(),
            &MenuItem::with_id(app, "open_float", "Floating mini-window", true, None::<&str>).unwrap(),
            &PredefinedMenuItem::separator(app).unwrap(),
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).unwrap(),
        ],
    )
    .map_err(|e| format!("Failed to create tray menu: {}", e))?;

    // Load tray icon from resources
    let mut icon = None;
    if let Ok(resource_dir) = app.path().resource_dir() {
        let tray_path = resource_dir.join("resources/tray.png");
        if tray_path.exists() {
            if let Ok(img) = Image::from_path(&tray_path) {
                icon = Some(img);
            }
        }
    }

    // Fallback to default icon if tray.png is not loaded
    let final_icon = match icon {
        Some(i) => i,
        None => {
            if let Some(w_icon) = app.default_window_icon() {
                w_icon.clone()
            } else {
                return Err("Failed to load any tray icon".to_string());
            }
        }
    };

    let _tray = TrayIconBuilder::new()
        .icon(final_icon)
        .menu(&tray_menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open_main" => {
                let _ = create_main_window(app);
            }
            "open_float" => {
                let _ = create_float_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|app, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                let _ = create_main_window(app);
            }
        })
        .build(app)
        .map_err(|e| format!("Failed to build tray icon: {}", e))?;

    Ok(())
}
