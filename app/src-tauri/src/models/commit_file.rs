use serde::Serialize;

#[derive(Serialize)]
pub struct CommitFile {
  pub path: String,
  pub status: String,
}
