use serde::Serialize;

#[derive(Serialize)]
pub struct LfsStatus {
  pub installed: bool,
  pub version: String,
  pub tracking: String,
  pub files: String,
  pub status: String,
}
