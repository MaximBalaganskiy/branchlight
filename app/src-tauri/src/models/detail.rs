use super::commit_file::CommitFile;
use serde::Serialize;

#[derive(Serialize)]
pub struct Detail {
  pub message: String,
  pub files: Vec<CommitFile>,
}
