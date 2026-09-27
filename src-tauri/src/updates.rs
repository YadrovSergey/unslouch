//! Update check: once a day, if allowed in settings. Nothing is downloaded until the user clicks
//! "Install" in the tray, as the privacy policy says.

use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK_DELAY_SEC: u64 = 60;
const CHECK_EVERY_SEC: u64 = 24 * 60 * 60;

/// Checks in the background and calls `found` with the update when there is one.
pub fn watch(app: AppHandle, enabled: impl Fn() -> bool + Send + 'static, found: impl Fn(Update) + Send + 'static) {
    tauri::async_runtime::spawn(async move {
        tokio_sleep(FIRST_CHECK_DELAY_SEC).await;
        loop {
            if enabled() {
                if let Ok(updater) = app.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        found(update);
                    }
                }
            }
            tokio_sleep(CHECK_EVERY_SEC).await;
        }
    });
}

async fn tokio_sleep(sec: u64) {
    let (tx, rx) = tauri::async_runtime::channel::<()>(1);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(sec));
        let _ = tx.blocking_send(());
    });
    let mut rx = rx;
    let _ = rx.recv().await;
}

/// Downloads, installs and restarts. Called only from the user's click. If anything fails, the update goes
/// back to `failed` so the tray item keeps working.
pub fn install(app: AppHandle, update: Update, failed: impl FnOnce(Update) + Send + 'static) {
    tauri::async_runtime::spawn(async move {
        match update.download_and_install(|_, _| {}, || {}).await {
            Ok(()) => app.restart(),
            Err(_) => failed(update),
        }
    });
}
