use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
  pub full_name: String,
  pub name: String,
  pub hash: String,
  pub upstream: String,
  pub tracking: String,
  pub kind: String,
}
