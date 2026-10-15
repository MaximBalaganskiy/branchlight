use serde::Serialize;

#[derive(Serialize)]
pub struct ReflogEntry {
  pub hash: String,
  pub reference: String,
  pub message: String,
  pub date: String,
}
