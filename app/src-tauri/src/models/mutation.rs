use serde::Deserialize;

#[derive(Default, Deserialize)]
pub struct Mutation {
  pub paths: Option<Vec<String>>,
  pub message: Option<String>,
  pub name: Option<String>,
  pub url: Option<String>,
}
