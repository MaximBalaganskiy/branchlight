use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEntry {
  pub command: String,
  pub time: String,
  pub duration: u128,
  pub exit_code: i32,
  pub error: String,
}
