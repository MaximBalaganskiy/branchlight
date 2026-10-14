use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct WindowContext {
  pub mode: String,
  pub repo: String,
}
