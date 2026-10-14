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
fn repeated_release_merges_interleave_with_development_history() {
  let (temp, service) = repository();
  let repo = temp.path();
  let tree = String::from_utf8(service.run(repo, &["mktree"], false).unwrap().stdout).unwrap();
  let create = |tick: u64, parents: &[&str], subject: &str| {
    let date = format!("{} +0000", 1_600_000_000 + tick * 60);
    let mut command = std::process::Command::new("git");
    command
      .current_dir(repo)
      .args(["commit-tree", tree.trim(), "-m", subject])
      .env("GIT_AUTHOR_DATE", &date)
      .env("GIT_COMMITTER_DATE", &date);
    for parent in parents {
      command.args(["-p", parent]);
    }
    let output = command.output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8(output.stdout).unwrap().trim().to_owned()
  };
  let root = create(0, &[], "Root");
  let mut main = root.clone();
  let mut dev = root.clone();
  let mut expected = vec![root];
  for release in 1..=20 {
    dev = create(release * 2, &[&dev], &format!("Development {release}"));
    main = create(release * 2 + 1, &[&main, &dev], &format!("Release {release}"));
    expected.extend([dev.clone(), main.clone()]);
  }
  dev = create(50, &[&dev], "Unreleased development");
  expected.push(dev.clone());
  dev = create(51, &[&dev, &main], "Merge releases back into development");
  expected.push(dev.clone());
  service
    .run(repo, &["update-ref", "refs/heads/main", &main], false)
    .unwrap();
  service
    .run(repo, &["update-ref", "refs/heads/dev", &dev], false)
    .unwrap();
  expected.reverse();
  let snapshot = service.snapshot(repo, 100).unwrap();
  assert_eq!(
    snapshot.commits.iter().map(|commit| &commit.hash).collect::<Vec<_>>(),
    expected.iter().collect::<Vec<_>>()
  );
  let page = service.snapshot(repo, 15).unwrap();
  assert_eq!(
    page.commits.iter().map(|commit| &commit.hash).collect::<Vec<_>>(),
    expected[..15].iter().collect::<Vec<_>>()
  );
  assert!(page.has_more);
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
fn add_and_edit_remote_urls_preserve_other_settings() {
  let (temp, service) = repository();
  let repo = temp.path();
  assert!(service.remotes(repo).unwrap().is_empty());
  mutate(
    &service,
    repo,
    "remote-add",
    serde_json::json!({ "name": "origin", "url": "https://example.invalid/first.git" }),
  );
  service
    .run(
      repo,
      &["config", "remote.origin.pushurl", "ssh://example.invalid/push.git"],
      false,
    )
    .unwrap();
  mutate(
    &service,
    repo,
    "remote-edit",
    serde_json::json!({ "name": "origin", "url": "https://example.invalid/second.git" }),
  );
  let remotes = service.remotes(repo).unwrap();
  assert_eq!(remotes.len(), 1);
  assert_eq!(remotes[0].name, "origin");
  assert_eq!(remotes[0].url, "https://example.invalid/second.git");
  assert_eq!(
    service
      .run(repo, &["remote", "get-url", "--push", "origin"], false)
      .unwrap()
      .stdout,
    b"ssh://example.invalid/push.git\n"
  );
  assert!(service
    .mutate(
      repo,
      "remote-add",
      &Mutation {
        name: Some("bad name".into()),
        url: Some("https://example.invalid/repo.git".into()),
        ..Default::default()
      }
    )
    .is_err());
  assert_eq!(service.remotes(repo).unwrap().len(), 1);
  commit(&service, repo, "keep.txt", "keep\n", "Local commit");
  let head = service.snapshot(repo, 300).unwrap().head;
  service
    .run(repo, &["update-ref", "refs/remotes/origin/main", &head], false)
    .unwrap();
  mutate(&service, repo, "remote-remove", serde_json::json!({ "name": "origin" }));
  assert!(service.remotes(repo).unwrap().is_empty());
  assert_eq!(service.snapshot(repo, 300).unwrap().head, head);
  assert_eq!(fs::read_to_string(repo.join("keep.txt")).unwrap(), "keep\n");
  assert!(!service
    .run(repo, &["show-ref", "--verify", "refs/remotes/origin/main"], true)
    .unwrap()
    .status
    .success());
}

#[test]
fn commit_file_tree_reads_historical_blobs_and_handles_non_text_entries() {
  let (temp, service) = repository();
  let repo = temp.path();
  fs::create_dir(repo.join("src")).unwrap();
  commit(
    &service,
    repo,
    "src/file with spaces.ts",
    "export const version = 1;\n",
    "Initial files",
  );
  let first = service.snapshot(repo, 300).unwrap().head;
  fs::write(repo.join("empty.txt"), "").unwrap();
  fs::write(repo.join("binary.bin"), [0, 1, 2]).unwrap();
  fs::write(repo.join("large.txt"), vec![b'x'; 2 * 1024 * 1024 + 1]).unwrap();
  service.run(repo, &["add", "--all"], false).unwrap();
  service
    .run(
      repo,
      &[
        "update-index",
        "--add",
        "--cacheinfo",
        &format!("160000,{first},dependency"),
      ],
      false,
    )
    .unwrap();
  commit(
    &service,
    repo,
    "src/file with spaces.ts",
    "export const version = 2;\n",
    "Update files",
  );
  let second = service.snapshot(repo, 300).unwrap().head;
  fs::write(repo.join("src/file with spaces.ts"), "working copy\n").unwrap();
  assert_eq!(service.commit_tree(repo, &first).unwrap().len(), 1);
  assert_eq!(service.commit_tree(repo, &second).unwrap().len(), 5);
  assert_eq!(
    service
      .commit_file(repo, &first, "src/file with spaces.ts")
      .unwrap()
      .text,
    "export const version = 1;\n"
  );
  assert_eq!(
    service
      .commit_file(repo, &second, "src/file with spaces.ts")
      .unwrap()
      .text,
    "export const version = 2;\n"
  );
  assert!(service.commit_file(repo, &second, "empty.txt").unwrap().text.is_empty());
  assert!(service
    .commit_file(repo, &second, "binary.bin")
    .unwrap()
    .message
    .contains("Binary"));
  assert!(service
    .commit_file(repo, &second, "large.txt")
    .unwrap()
    .message
    .contains("2 MiB"));
  assert!(service
    .commit_file(repo, &second, "dependency")
    .unwrap()
    .message
    .contains(&first));
  assert!(service.commit_file(repo, &first, "missing.txt").is_err());
  assert!(service.commit_file(repo, &first, "../outside").is_err());
  assert!(service.commit_tree(repo, "--all").is_err());
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
