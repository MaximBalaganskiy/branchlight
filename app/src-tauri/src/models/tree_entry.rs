use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
  pub path: String,
  pub kind: String,
  pub object_id: String,
  pub size: Option<u64>,
}
