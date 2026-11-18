//! The persistent "live" indicator — a project guardrail, not a preference.
//!
//! While a viewer is watching, a small always-on-top pill is shown and the tray icon
//! carries a red dot + tooltip. There is deliberately no setting, flag or command to
//! turn this off: Quiet Mode only suppresses popups, never the indicator. A watchdog
//! recreates the pill if it is closed. See README → "The indicator guardrail".

use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

pub const TRAY_ID: &str = "viex-tray";
const INDICATOR_LABEL: &str = "indicator";

static LIVE: AtomicBool = AtomicBool::new(false);
static WATCHDOG_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "Open VIEX Host").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("VIEX Host — online")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Copy of the app icon with a red dot in the bottom-right corner.
fn live_icon(app: &AppHandle) -> Option<Image<'static>> {
    let base = app.default_window_icon()?;
    let (w, h) = (base.width() as i32, base.height() as i32);
    let mut rgba = base.rgba().to_vec();
    let radius = (w.min(h) as f32 * 0.24).max(3.0);
    let (cx, cy) = (w as f32 - radius - 1.0, h as f32 - radius - 1.0);
    for y in 0..h {
        for x in 0..w {
            let (dx, dy) = (x as f32 - cx, y as f32 - cy);
            let distance = (dx * dx + dy * dy).sqrt();
            if distance <= radius {
                let i = ((y * w + x) * 4) as usize;
                let ring = distance > radius - 1.5;
                let color: [u8; 4] = if ring { [255, 255, 255, 255] } else { [239, 68, 68, 255] };
                rgba[i..i + 4].copy_from_slice(&color);
            }
        }
    }
    Some(Image::new_owned(rgba, w as u32, h as u32))
}

fn open_indicator(app: &AppHandle, text: &str) {
    if app.get_webview_window(INDICATOR_LABEL).is_some() {
        return;
    }
    let (width, height) = (300.0_f64, 40.0_f64);
    let (mut x, mut y) = (20.0_f64, 12.0_f64);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        x = position.x as f64 / scale + (size.width as f64 / scale - width) / 2.0;
        y = position.y as f64 / scale + 12.0;
    }
    let url = format!("indicator.html?text={}", urlencode(text));
    let _ = WebviewWindowBuilder::new(app, INDICATOR_LABEL, WebviewUrl::App(url.into()))
        .title("VIEX is live")
        .inner_size(width, height)
        .position(x, y)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .shadow(true)
        .visible_on_all_workspaces(true)
        .build();
}

fn urlencode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

/// `async` on purpose: building a window from a synchronous command runs on the main thread and
/// deadlocks the app on Windows (WebView2). Async commands run on a worker thread, which is safe.
#[tauri::command]
pub async fn set_live(app: AppHandle, live: bool, viewer: String, screens: u32) -> Result<(), String> {
    LIVE.store(live, Ordering::SeqCst);
    let tray = app.tray_by_id(TRAY_ID);

    if live {
        let text = format!("{} is viewing {} screen{}", viewer, screens, if screens == 1 { "" } else { "s" });
        if let Some(tray) = &tray {
            let _ = tray.set_tooltip(Some(format!("VIEX Host — LIVE: {text}")));
            if let Some(icon) = live_icon(&app) {
                let _ = tray.set_icon(Some(icon));
            }
        }
        open_indicator(&app, &text);

        // Watchdog: if the pill is closed by anything, bring it straight back.
        if !WATCHDOG_RUNNING.swap(true, Ordering::SeqCst) {
            let handle = app.clone();
            let text = text.clone();
            thread::spawn(move || {
                while LIVE.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_secs(2));
                    // Called from this worker thread (never the main thread) so window creation can't deadlock.
                    if LIVE.load(Ordering::SeqCst) && handle.get_webview_window(INDICATOR_LABEL).is_none() {
                        open_indicator(&handle, &text);
                    }
                }
                WATCHDOG_RUNNING.store(false, Ordering::SeqCst);
            });
        }
    } else {
        if let Some(tray) = &tray {
            let _ = tray.set_tooltip(Some("VIEX Host — online"));
            if let Some(icon) = app.default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
            }
        }
        if let Some(window) = app.get_webview_window(INDICATOR_LABEL) {
            let _ = window.destroy();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
