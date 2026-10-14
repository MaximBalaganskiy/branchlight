use super::service::GitService;
use crate::models::repository_request::RepositoryRequest;
use std::{fs, path::Path};

impl GitService {
  pub fn create_repository(&self, request: &RepositoryRequest) -> Result<String, String> {
    let destination = Path::new(&request.directory);
    if !destination.is_absolute() || destination.file_name().is_none() {
      return Err("Choose an absolute destination folder.".into());
    }
    let parent = destination.parent().ok_or("Choose a destination folder.")?;
    if !parent.is_dir() {
      return Err("The parent folder must already exist.".into());
    }
    if destination.exists() && !destination.is_dir() {
      return Err("The destination is not a folder.".into());
    }
    let probe = if destination.exists() { destination } else { parent };
    if self
      .run(probe, &["rev-parse", "--absolute-git-dir"], true)?
      .status
      .success()
    {
      return Err("Choose a folder outside an existing Git repository.".into());
    }
    if let Some(url) = &request.url {
      if url.trim().is_empty() || url.contains(['\0', '\n', '\r']) || url.starts_with('-') {
        return Err("Enter a repository URL or local path.".into());
      }
      if destination.exists()
        && fs::read_dir(destination)
          .map_err(|error| error.to_string())?
          .next()
          .is_some()
      {
        return Err("Clone into a new or empty folder.".into());
      }
      self.run(
        parent,
        &[
          "-c",
          "protocol.ext.allow=never",
          "clone",
          "--",
          url.trim(),
          &request.directory,
        ],
        false,
      )?;
    } else {
      let branch = request.branch.as_deref().unwrap_or("main");
      self.validate_branch(parent, branch)?;
      self.run(
        parent,
        &["init", "--initial-branch", branch, "--", &request.directory],
        false,
      )?;
    }
    Ok(self.open(destination)?.to_string_lossy().into_owned())
  }
}
