use serde::Deserialize;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRequest {
  pub path: String,
  pub hash: Option<String>,
  #[serde(default)]
  pub staged: bool,
  #[serde(default)]
  pub untracked: bool,
}
