use serde::Deserialize;

#[derive(Deserialize)]
pub struct RepositoryRequest {
  pub directory: String,
  pub url: Option<String>,
  pub branch: Option<String>,
}
