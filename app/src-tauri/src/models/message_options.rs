use serde::Serialize;

#[derive(Serialize)]
pub struct MessageOptions {
  pub recent: Vec<String>,
  pub template: String,
  pub suggested: String,
}
