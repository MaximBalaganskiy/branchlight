use serde::Serialize;

#[derive(Serialize)]
pub struct Stash {
  pub hash: String,
  pub reference: String,
  pub message: String,
  pub date: String,
}
