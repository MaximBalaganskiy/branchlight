use serde::Serialize;

#[derive(Serialize)]
pub struct Commit {
  pub hash: String,
  pub parents: Vec<String>,
  pub author: String,
  pub date: String,
  pub subject: String,
  pub refs: Vec<String>,
}
