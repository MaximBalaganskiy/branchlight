use super::{branch::Branch, changed_file::ChangedFile, commit::Commit};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
  pub path: String,
  pub name: String,
  pub branch: String,
  pub head: String,
  pub files: Vec<ChangedFile>,
  pub branches: Vec<Branch>,
  pub commits: Vec<Commit>,
  pub has_more: bool,
  pub operation: String,
}
