use super::service::GitService;
use std::{fs, path::Path};

impl GitService {
  pub(super) fn conflict_preview(&self, repo: &Path, base: &str, ours: &str, theirs: &str) -> Option<String> {
    let directory = tempfile::tempdir().ok()?;
    let files = [
      directory.path().join("ours"),
      directory.path().join("base"),
      directory.path().join("theirs"),
    ];
    for (path, text) in files.iter().zip([ours, base, theirs]) {
      fs::write(path, text).ok()?;
    }
    let output = self
      .run(
        repo,
        &[
          "merge-file",
          "--stdout",
          "--diff3",
          "-L",
          "Ours",
          "-L",
          "Base",
          "-L",
          "Theirs",
          files[0].to_str()?,
          files[1].to_str()?,
          files[2].to_str()?,
        ],
        true,
      )
      .ok()?;
    // A positive exit status reports the number of conflicts; errors also write stderr.
    if !output.stderr.is_empty() {
      return None;
    }
    String::from_utf8(output.stdout).ok()
  }
}
