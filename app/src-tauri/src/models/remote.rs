use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
  pub name: String,
  pub url: String,
  pub push_url: String,
  pub prune: bool,
}
