use serde::Deserialize;

#[derive(Default, Deserialize)]
pub struct Mutation {
  pub paths: Option<Vec<String>>,
  pub message: Option<String>,
  pub name: Option<String>,
  pub url: Option<String>,
  pub reference: Option<String>,
  pub directory: Option<String>,
  pub choice: Option<String>,
  pub text: Option<String>,
  pub original: Option<String>,
  pub lines: Option<Vec<usize>>,
  pub staged: Option<bool>,
  pub include_untracked: Option<bool>,
}
