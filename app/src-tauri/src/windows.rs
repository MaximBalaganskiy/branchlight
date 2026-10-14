use crate::{app_state::AppState, models::window_context::WindowContext};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create(app: &AppHandle, label: &str, mode: &str, repo: String) -> Result<(), String> {
  app
    .state::<AppState>()
    .windows
    .lock()
    .map_err(|error| error.to_string())?
    .insert(
      label.into(),
      WindowContext {
        mode: mode.into(),
        repo,
      },
    );
  let data_dir = std::env::var_os("BRANCHLIGHT_USER_DATA")
    .map(std::path::PathBuf::from)
    .unwrap_or(app.path().app_data_dir().map_err(|error| error.to_string())?);
  let result = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
    .data_directory(data_dir.join("webview"))
    .title(if mode == "commit" {
      "Commit — Branchlight"
    } else {
      "Branchlight"
    })
    .inner_size(if mode == "commit" { 1220.0 } else { 1480.0 }, 920.0)
    .min_inner_size(900.0, 640.0)
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .on_navigation(|url| {
      let local_app = matches!(url.scheme(), "tauri" | "http" | "https") && url.host_str() == Some("tauri.localhost");
      let dev_server = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        && url.port() == Some(5173);
      local_app || dev_server
    })
    .build();
  match result {
    Ok(window) => {
      let app = app.clone();
      let label = label.to_owned();
      window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
          if let Ok(mut windows) = app.state::<AppState>().windows.lock() {
            windows.remove(&label);
          }
        }
      });
      Ok(())
    }
    Err(error) => {
      if let Ok(mut windows) = app.state::<AppState>().windows.lock() {
        windows.remove(label);
      }
      Err(error.to_string())
    }
  }
}
