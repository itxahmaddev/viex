mod capture;
mod config;
mod live;

use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Two copies registering the same device would keep kicking each other off the Relay.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            live::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(capture::CaptureState::default())
        .setup(|app| {
            live::build_tray(app.handle())?;

            // Autostart launches with `--hidden`: go straight to the tray once set up.
            let launched_hidden = std::env::args().any(|arg| arg == "--hidden");
            let configured = config::load(app.handle()).map(|c| c.setup_complete).unwrap_or(false);
            if !(launched_hidden && configured) {
                live::show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window keeps the Host running in the tray.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::save_config,
            config::get_secret,
            config::set_secret,
            config::clear_secret,
            capture::list_monitors,
            capture::start_capture,
            capture::set_capture_profile,
            capture::stop_capture,
            capture::stop_all_captures,
            live::set_live,
            live::show_main_window,
            live::hide_main_window,
            live::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VIEX Host");
}
