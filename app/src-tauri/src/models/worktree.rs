use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
  pub path: String,
  pub branch: String,
  pub head: String,
  pub locked: bool,
  pub main: bool,
}
