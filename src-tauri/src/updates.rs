//! Update check: once a day, if allowed in settings. Nothing is downloaded until the user clicks
//! "Install" in the tray, as the privacy policy says.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update is installed: start the new version once this process has exited (see `relaunch_if_installed`).
static RELAUNCH: AtomicBool = AtomicBool::new(false);

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

/// What the "Check for updates" tray item shows while no update is waiting to be installed.
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum Check {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Failed,
    /// Downloading an update the user chose to install: percent, when the server gave the size.
    Downloading(Option<u8>),
    Installing,
}

/// Checks right away, from the user's click in the tray. `done` gets the update, `None` when this version is the
/// latest, or an error when the server could not be reached.
pub fn check_now(app: AppHandle, done: impl FnOnce(Result<Option<Update>, ()>) + Send + 'static) {
    tauri::async_runtime::spawn(async move {
        let result = match app.updater() {
            Ok(updater) => updater.check().await.map_err(|_| ()),
            Err(_) => Err(()),
        };
        done(result);
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
/// `progress` gets the download percent each time it changes, then `Check::Installing`.
pub fn install(
    app: AppHandle,
    update: Update,
    progress: impl Fn(Check) + Send + Sync + 'static,
    failed: impl FnOnce(Update) + Send + 'static,
) {
    tauri::async_runtime::spawn(async move {
        let mut done: u64 = 0;
        let mut shown: Option<Option<u8>> = None;
        let result = update
            .download_and_install(
                |chunk, total| {
                    done += chunk as u64;
                    let pct = total.filter(|t| *t > 0).map(|t| (done * 100 / t).min(100) as u8);
                    if shown != Some(pct) {
                        shown = Some(pct);
                        progress(Check::Downloading(pct));
                    }
                },
                || progress(Check::Installing),
            )
            .await;
        match result {
            Ok(()) if cfg!(target_os = "macos") => {
                RELAUNCH.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            Ok(()) => app.restart(),
            Err(_) => failed(update),
        }
    });
}

/// Called on exit. Started at login, the app runs as a launchd job, and launchd ends the whole job when its main
/// process exits: a new copy started as our child (what `restart()` does) died with it, and the app was gone after
/// an update. LaunchServices starts the new version as a separate app instead. By the time this runs the
/// single-instance socket is already removed, so the new copy doesn't hand over to this one and quit.
pub fn relaunch_if_installed() {
    if !RELAUNCH.load(Ordering::SeqCst) {
        return;
    }
    #[cfg(target_os = "macos")]
    if let Ok(exe) = std::env::current_exe() {
        // …/Unslouch.app/Contents/MacOS/unslouch → …/Unslouch.app
        match exe.ancestors().nth(3).filter(|b| b.extension().is_some_and(|e| e == "app")) {
            // `status()`, not `spawn()`: `open` is our child and must finish handing the launch to LaunchServices
            // before this process exits and launchd ends the job together with its children.
            Some(bundle) => {
                let _ = std::process::Command::new("/usr/bin/open").arg("-n").arg(bundle).status();
            }
            // Not in an app bundle (a development build): start the binary itself, as `restart()` would.
            None => {
                let _ = std::process::Command::new(&exe).spawn();
            }
        }
    }
}
