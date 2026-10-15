use serde::Serialize;

#[derive(Serialize)]
pub struct Submodule {
  pub path: String,
  pub target: String,
  pub head: String,
  pub dirty: bool,
}
