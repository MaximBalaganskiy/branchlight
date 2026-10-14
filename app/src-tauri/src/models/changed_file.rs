use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
  pub path: String,
  pub original_path: Option<String>,
  pub index: String,
  pub worktree: String,
  pub staged: bool,
  pub unstaged: bool,
  pub conflict: bool,
}
