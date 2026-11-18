//! Multi-monitor screen capture. One thread per monitor grabs frames with `xcap`,
//! downsizes + JPEG-encodes them, and streams the bytes to the webview over a Tauri
//! channel. The webview paints them to a canvas and publishes `canvas.captureStream()`
//! as one WebRTC video track per monitor (see `host/src/lib/session.ts`).

use serde::Serialize;
use std::{
    collections::HashMap,
    hash::Hasher,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{ipc::{Channel, InvokeResponseBody}, State};
use xcap::{
    image::{codecs::jpeg::JpegEncoder, imageops, imageops::FilterType, DynamicImage, ExtendedColorType},
    Monitor,
};

#[derive(Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub label: String,
    pub w: u32,
    pub h: u32,
    pub x: i32,
    pub y: i32,
    pub primary: bool,
}

/// Live-tunable knobs for one capture thread. `fps == 0` pauses capture.
pub struct CaptureCtl {
    stop: AtomicBool,
    fps: AtomicU32,
    max_width: AtomicU32,
    quality: AtomicU32,
}

#[derive(Default)]
pub struct CaptureState(Mutex<HashMap<u32, Arc<CaptureCtl>>>);

#[tauri::command]
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(monitors.len());
    for (index, monitor) in monitors.iter().enumerate() {
        let primary = monitor.is_primary().unwrap_or(false);
        out.push(MonitorInfo {
            id: monitor.id().map_err(|e| e.to_string())?,
            label: format!("Monitor {}{}", index + 1, if primary { " (primary)" } else { "" }),
            w: monitor.width().unwrap_or(0),
            h: monitor.height().unwrap_or(0),
            x: monitor.x().unwrap_or(0),
            y: monitor.y().unwrap_or(0),
            primary,
        });
    }
    Ok(out)
}

fn find_monitor(id: u32) -> Option<Monitor> {
    Monitor::all().ok()?.into_iter().find(|m| m.id().map(|v| v == id).unwrap_or(false))
}

/// Cheap change detector: FNV-1a over a strided sample of the pixels.
fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut i = 0;
    while i < bytes.len() {
        hasher.write_u8(bytes[i]);
        i += 61;
    }
    hasher.finish()
}

#[tauri::command]
pub fn start_capture(
    state: State<'_, CaptureState>,
    monitor_id: u32,
    fps: u32,
    max_width: u32,
    quality: u32,
    on_frame: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let ctl = Arc::new(CaptureCtl {
        stop: AtomicBool::new(false),
        fps: AtomicU32::new(fps),
        max_width: AtomicU32::new(max_width),
        quality: AtomicU32::new(quality.clamp(10, 95)),
    });
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(previous) = map.insert(monitor_id, ctl.clone()) {
            previous.stop.store(true, Ordering::Relaxed);
        }
    }

    thread::spawn(move || {
        let mut monitor = find_monitor(monitor_id);
        let mut last_print = 0u64;
        let mut last_sent = Instant::now() - Duration::from_secs(5);

        while !ctl.stop.load(Ordering::Relaxed) {
            let fps = ctl.fps.load(Ordering::Relaxed);
            if fps == 0 {
                thread::sleep(Duration::from_millis(150));
                continue;
            }
            let started = Instant::now();

            if monitor.is_none() {
                monitor = find_monitor(monitor_id);
            }
            let Some(current) = monitor.as_ref() else {
                thread::sleep(Duration::from_millis(500));
                continue;
            };

            match current.capture_image() {
                Ok(frame) => {
                    let max_width = ctl.max_width.load(Ordering::Relaxed);
                    let rgb = if max_width > 0 && frame.width() > max_width {
                        let height = ((frame.height() as u64 * max_width as u64) / frame.width() as u64).max(1) as u32;
                        let resized = imageops::resize(&frame, max_width, height, FilterType::CatmullRom);
                        DynamicImage::ImageRgba8(resized).into_rgb8()
                    } else {
                        DynamicImage::ImageRgba8(frame).into_rgb8()
                    };

                    let print = fingerprint(rgb.as_raw());
                    // Skip unchanged frames, but always send at least one per second so a
                    // freshly connected viewer is never left staring at a blank tile.
                    if print != last_print || last_sent.elapsed() >= Duration::from_secs(1) {
                        let mut jpeg = Vec::with_capacity(rgb.as_raw().len() / 8);
                        let quality = ctl.quality.load(Ordering::Relaxed) as u8;
                        let encoded = JpegEncoder::new_with_quality(&mut jpeg, quality).encode(
                            rgb.as_raw(),
                            rgb.width(),
                            rgb.height(),
                            ExtendedColorType::Rgb8,
                        );
                        if encoded.is_ok() {
                            if on_frame.send(InvokeResponseBody::Raw(jpeg)).is_err() {
                                break; // the webview is gone
                            }
                            last_print = print;
                            last_sent = Instant::now();
                        }
                    }
                }
                Err(_) => {
                    // Display went away (unplugged / locked screen / resolution change): re-resolve it.
                    monitor = None;
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }
            }

            let target = Duration::from_millis(1000 / fps.max(1) as u64);
            if let Some(rest) = target.checked_sub(started.elapsed()) {
                thread::sleep(rest);
            }
        }
    });
    Ok(())
}

/// Lets the Viewer's "grid vs single screen" hint trade quality for bandwidth live.
#[tauri::command]
pub fn set_capture_profile(
    state: State<'_, CaptureState>,
    monitor_id: u32,
    fps: u32,
    max_width: u32,
    quality: u32,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ctl) = map.get(&monitor_id) {
        ctl.fps.store(fps, Ordering::Relaxed);
        ctl.max_width.store(max_width, Ordering::Relaxed);
        ctl.quality.store(quality.clamp(10, 95), Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn stop_capture(state: State<'_, CaptureState>, monitor_id: u32) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ctl) = map.remove(&monitor_id) {
        ctl.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn stop_all_captures(state: State<'_, CaptureState>) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    for (_, ctl) in map.drain() {
        ctl.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
