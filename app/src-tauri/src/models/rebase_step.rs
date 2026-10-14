use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
pub struct RebaseStep {
  pub hash: String,
  pub subject: String,
  pub action: String,
}
