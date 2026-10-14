use serde::Serialize;

#[derive(Serialize)]
pub struct FilePreview {
  pub text: String,
  pub message: String,
}
