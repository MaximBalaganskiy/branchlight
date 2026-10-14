use crate::{git::service::GitService, models::window_context::WindowContext};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{atomic::AtomicUsize, Mutex};

pub struct AppState {
  pub git: GitService,
  pub windows: Mutex<HashMap<String, WindowContext>>,
  pub next_window: AtomicUsize,
  recent: Mutex<Vec<String>>,
  settings: PathBuf,
}

impl AppState {
  pub fn new(data_dir: &Path) -> Self {
    let settings = data_dir.join("repositories.json");
    let recent = std::fs::read(&settings)
      .ok()
      .and_then(|bytes| serde_json::from_slice(&bytes).ok())
      .unwrap_or_default();
    Self {
      git: GitService::default(),
      windows: Mutex::new(HashMap::new()),
      next_window: AtomicUsize::new(1),
      recent: Mutex::new(recent),
      settings,
    }
  }

  pub fn context(&self, label: &str) -> Result<WindowContext, String> {
    self
      .windows
      .lock()
      .map_err(|error| error.to_string())?
      .get(label)
      .cloned()
      .ok_or_else(|| "Unknown application window.".into())
  }

  pub fn repo(&self, label: &str) -> Result<PathBuf, String> {
    let context = self.context(label)?;
    if context.repo.is_empty() {
      return Err("Open a repository first.".into());
    }
    Ok(PathBuf::from(context.repo))
  }

  pub fn recent(&self) -> Result<Vec<String>, String> {
    Ok(self.recent.lock().map_err(|error| error.to_string())?.clone())
  }

  pub fn remember(&self, repo: &str) -> Result<(), String> {
    let mut recent = self.recent.lock().map_err(|error| error.to_string())?;
    recent.retain(|path| path != repo);
    recent.insert(0, repo.into());
    recent.truncate(12);
    let parent = self.settings.parent().ok_or("Invalid settings directory.")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = self.settings.with_extension("tmp");
    std::fs::write(&temp, serde_json::to_vec(&*recent).map_err(|error| error.to_string())?)
      .map_err(|error| error.to_string())?;
    std::fs::rename(temp, &self.settings).map_err(|error| error.to_string())
  }
}
