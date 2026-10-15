use serde::Serialize;

#[derive(Serialize)]
pub struct ConflictStage {
  pub stage: u8,
  pub mode: String,
  pub hash: String,
}
