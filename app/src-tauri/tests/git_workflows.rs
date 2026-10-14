use branchlight_lib::{
  git::{parsers, service::GitService, validation},
  models::{diff_request::DiffRequest, mutation::Mutation},
};
use std::{fs, path::Path};
use tempfile::TempDir;

fn repository() -> (TempDir, GitService) {
  let temp = tempfile::tempdir().unwrap();
  let service = GitService::default();
  for args in [
    vec!["init", "-b", "main"],
    vec!["config", "user.name", "Branchlight Test"],
    vec!["config", "user.email", "test@example.invalid"],
    vec!["config", "commit.gpgsign", "false"],
    vec!["config", "core.autocrlf", "false"],
  ] {
    service.run(temp.path(), &args, false).unwrap();
  }
  (temp, service)
}

fn mutate(service: &GitService, repo: &Path, action: &str, payload: serde_json::Value) {
  service
    .mutate(repo, action, &serde_json::from_value(payload).unwrap())
    .unwrap();
}

fn commit(service: &GitService, repo: &Path, file: &str, content: &str, message: &str) {
  fs::write(repo.join(file), content).unwrap();
  mutate(service, repo, "stage", serde_json::json!({ "paths": [file] }));
  mutate(service, repo, "commit", serde_json::json!({ "message": message }));
}

#[test]
fn unborn_unstage_and_partial_commit_preserve_working_content() {
  let (temp, service) = repository();
  let repo = temp.path();
  assert!(service.snapshot(repo, 300).unwrap().commits.is_empty());
  fs::write(repo.join("file with spaces.txt"), "first\n").unwrap();
  mutate(
    &service,
    repo,
    "stage",
    serde_json::json!({ "paths": ["file with spaces.txt"] }),
  );
  fs::write(repo.join("file with spaces.txt"), "edited\n").unwrap();
  mutate(
    &service,
    repo,
    "unstage",
    serde_json::json!({ "paths": ["file with spaces.txt"] }),
  );
  assert_eq!(
    fs::read_to_string(repo.join("file with spaces.txt")).unwrap(),
    "edited\n"
  );
  assert_eq!(service.snapshot(repo, 300).unwrap().files[0].index, "?");
  commit(
    &service,
    repo,
    "file with spaces.txt",
    "first\n",
    "Initial commit\n\nBody",
  );
  let initial = service.snapshot(repo, 300).unwrap();
  assert_eq!(
    service.detail(repo, &initial.head).unwrap().files[0].path,
    "file with spaces.txt"
  );
  assert!(service
    .diff(
      repo,
      &DiffRequest {
        path: "file with spaces.txt".into(),
        hash: Some(initial.head),
        ..Default::default()
      }
    )
    .unwrap()
    .contains("+first"));
  fs::write(repo.join("file with spaces.txt"), "staged\n").unwrap();
  mutate(
    &service,
    repo,
    "stage",
    serde_json::json!({ "paths": ["file with spaces.txt"] }),
  );
  fs::write(repo.join("file with spaces.txt"), "unstaged\n").unwrap();
  let mixed = service.snapshot(repo, 300).unwrap();
  assert_eq!(format!("{}{}", mixed.files[0].index, mixed.files[0].worktree), "MM");
  mutate(&service, repo, "commit", serde_json::json!({ "message": "Index only" }));
  assert_eq!(
    fs::read_to_string(repo.join("file with spaces.txt")).unwrap(),
    "unstaged\n"
  );
  assert_eq!(
    service
      .run(repo, &["show", "HEAD:file with spaces.txt"], false)
      .unwrap()
      .stdout,
    b"staged\n"
  );
  assert!(service
    .mutate(
      repo,
      "checkout",
      &Mutation {
        name: Some("main".into()),
        ..Default::default()
      }
    )
    .unwrap_err()
    .contains("Commit or stash"));
}

#[test]
fn merge_history_tags_and_first_parent_diff() {
  let (temp, service) = repository();
  let repo = temp.path();
  commit(&service, repo, "base.txt", "base\n", "Root");
  mutate(&service, repo, "branch", serde_json::json!({ "name": "feature/graph" }));
  commit(&service, repo, "feature.txt", "feature\n", "Feature");
  mutate(&service, repo, "checkout", serde_json::json!({ "name": "main" }));
  commit(&service, repo, "main.txt", "main\n", "Main");
  service
    .run(
      repo,
      &["merge", "--no-ff", "feature/graph", "-m", "Merge feature"],
      false,
    )
    .unwrap();
  service.run(repo, &["tag", "-a", "v1", "-m", "Release"], false).unwrap();
  let snapshot = service.snapshot(repo, 2).unwrap();
  assert!(snapshot.has_more);
  assert_eq!(snapshot.commits.len(), 2);
  assert_eq!(snapshot.commits[0].parents.len(), 2);
  assert_eq!(
    snapshot
      .branches
      .iter()
      .find(|branch| branch.kind == "tag")
      .unwrap()
      .hash,
    snapshot.head
  );
  let detail = service.detail(repo, &snapshot.head).unwrap();
  assert_eq!(detail.files.len(), 1);
  assert_eq!(detail.files[0].path, "feature.txt");
  assert!(service
    .diff(
      repo,
      &DiffRequest {
        path: "feature.txt".into(),
        hash: Some(snapshot.head),
        ..Default::default()
      }
    )
    .unwrap()
    .contains("+feature"));
}

#[test]
fn literal_paths_renames_and_invalid_requests() {
  let (temp, service) = repository();
  let repo = temp.path();
  fs::write(repo.join("a.txt"), "other\n").unwrap();
  commit(&service, repo, "[abc].txt", "literal\n", "Literal filename");
  assert!(!service.snapshot(repo, 300).unwrap().files[0].staged);
  fs::rename(repo.join("[abc].txt"), repo.join("renamed.txt")).unwrap();
  mutate(
    &service,
    repo,
    "stage",
    serde_json::json!({ "paths": ["[abc].txt", "renamed.txt"] }),
  );
  let snapshot = service.snapshot(repo, 300).unwrap();
  let renamed = snapshot.files.iter().find(|file| file.index == "R").unwrap();
  assert_eq!(renamed.original_path.as_deref(), Some("[abc].txt"));
  mutate(
    &service,
    repo,
    "unstage",
    serde_json::json!({ "paths": ["[abc].txt", "renamed.txt"] }),
  );
  assert!(!service
    .snapshot(repo, 300)
    .unwrap()
    .files
    .iter()
    .any(|file| file.staged));
  for path in ["../outside", "C:\\outside", "/outside", "\\\\server\\outside"] {
    assert!(validation::path(path).is_err());
  }
  assert!(service
    .mutate(
      repo,
      "commit",
      &Mutation {
        message: Some("Empty".into()),
        ..Default::default()
      }
    )
    .unwrap_err()
    .contains("Stage changes"));
  assert!(service.mutate(repo, "reset", &Mutation::default()).is_err());
}

#[test]
fn nul_status_handles_unicode_and_conflicts() {
  let files = parsers::status("R  new name\0old name\0?? ünicode.txt\0UU conflict.txt\0");
  assert_eq!(files[0].path, "new name");
  assert_eq!(files[0].original_path.as_deref(), Some("old name"));
  assert_eq!(files[1].path, "ünicode.txt");
  assert!(files[2].conflict);
}

#[test]
fn fetch_pull_push_local_remote() {
  let (temp, service) = repository();
  let repo = temp.path();
  let bare = tempfile::tempdir().unwrap();
  service
    .run(bare.path(), &["init", "--bare", "-b", "main"], false)
    .unwrap();
  service
    .run(repo, &["remote", "add", "origin", bare.path().to_str().unwrap()], false)
    .unwrap();
  commit(&service, repo, "readme.txt", "v1\n", "First remote commit");
  service.run(repo, &["push", "-u", "origin", "main"], false).unwrap();
  let clone = tempfile::tempdir().unwrap();
  service
    .run(
      clone.path(),
      &["clone", "-c", "core.autocrlf=false", bare.path().to_str().unwrap(), "."],
      false,
    )
    .unwrap();
  commit(&service, repo, "readme.txt", "v2\n", "Update remote");
  mutate(&service, repo, "push", serde_json::json!({}));
  mutate(&service, clone.path(), "fetch", serde_json::json!({}));
  let snapshot = service.snapshot(clone.path(), 300).unwrap();
  assert!(snapshot
    .branches
    .iter()
    .find(|branch| branch.name == "main")
    .unwrap()
    .tracking
    .contains("behind 1"));
  mutate(&service, clone.path(), "pull", serde_json::json!({}));
  assert_eq!(fs::read_to_string(clone.path().join("readme.txt")).unwrap(), "v2\n");
}

#[test]
fn untracked_preview_limits_and_binary_detection() {
  let (temp, service) = repository();
  let repo = service.open(temp.path()).unwrap();
  fs::write(repo.join("binary.bin"), [0, 1, 2]).unwrap();
  let request = DiffRequest {
    path: "binary.bin".into(),
    untracked: true,
    ..Default::default()
  };
  assert!(service.diff(&repo, &request).unwrap().contains("Binary"));
  fs::write(repo.join("large.txt"), vec![b'x'; 1024 * 1024 + 1]).unwrap();
  assert!(service
    .diff(
      &repo,
      &DiffRequest {
        path: "large.txt".into(),
        untracked: true,
        ..Default::default()
      }
    )
    .unwrap()
    .contains("limit"));
}
