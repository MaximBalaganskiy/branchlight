use serde::Serialize;

#[derive(Serialize)]
pub struct ConflictContent {
  pub base: String,
  pub ours: String,
  pub theirs: String,
  pub working: String,
  pub editable: bool,
  pub preview: Option<String>,
}
