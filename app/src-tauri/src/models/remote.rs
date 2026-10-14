use serde::Serialize;

#[derive(Serialize)]
pub struct Remote {
  pub name: String,
  pub url: String,
}
