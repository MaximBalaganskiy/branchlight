use serde::Serialize;

#[derive(Serialize)]
pub struct Tag {
  pub name: String,
  pub object: String,
  pub target: String,
  pub message: String,
  pub annotated: bool,
}
