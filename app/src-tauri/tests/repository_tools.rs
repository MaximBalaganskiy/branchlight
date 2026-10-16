use gitaur_lib::{
  git::{process, service::GitService},
  models::mutation::Mutation,
};
use serde_json::{json, Value};
use std::{fs, path::Path};
use tempfile::TempDir;

fn fixture() -> (TempDir, GitService) {
  let directory = tempfile::tempdir().unwrap();
  let git = GitService::default();
  for args in [
    vec!["init", "-b", "main"],
    vec!["config", "user.name", "Test"],
    vec!["config", "user.email", "test@example.invalid"],
    vec!["config", "commit.gpgsign", "false"],
    vec!["config", "tag.gpgsign", "false"],
    vec!["config", "core.autocrlf", "false"],
  ] {
    git.run(directory.path(), &args, false).unwrap();
  }
  (directory, git)
}

fn text(git: &GitService, repo: &Path, args: &[&str]) -> String {
  String::from_utf8(git.run(repo, args, false).unwrap().stdout)
    .unwrap()
    .trim()
    .into()
}

fn action(git: &GitService, repo: &Path, action: &str, payload: Value) -> Result<bool, String> {
  git.mutate(repo, action, &serde_json::from_value::<Mutation>(payload).unwrap())
}

fn commit(git: &GitService, repo: &Path, contents: &[u8]) -> String {
  fs::write(repo.join("file"), contents).unwrap();
  git.run(repo, &["add", "--", "file"], false).unwrap();
  git.run(repo, &["commit", "-m", "Change"], false).unwrap();
  text(git, repo, &["rev-parse", "HEAD"])
}

#[test]
fn recover_lost_commit_without_switching_or_touching_work() {
  let (temp, git) = fixture();
  let repo = temp.path();
  let base = commit(&git, repo, b"base");
  let lost = commit(&git, repo, b"lost");
  git.run(repo, &["reset", "--hard", &base], false).unwrap();
  fs::write(repo.join("file"), b"uncommitted").unwrap();
  assert!(git.reflog(repo).unwrap().iter().any(|entry| entry.hash == lost));
  action(
    &git,
    repo,
    "reflog-recover",
    json!({"name":"recovered", "reference":lost}),
  )
  .unwrap();
  assert_eq!(text(&git, repo, &["rev-parse", "recovered"]), lost);
  assert_eq!(text(&git, repo, &["rev-parse", "HEAD"]), base);
  assert_eq!(fs::read(repo.join("file")).unwrap(), b"uncommitted");
  assert!(action(
    &git,
    repo,
    "reflog-recover",
    json!({"name":"recovered", "reference":base})
  )
  .is_err());
}

#[test]
fn tags_create_push_and_delete_check_identity() {
  let (temp, git) = fixture();
  let repo = temp.path();
  let head = commit(&git, repo, b"base");
  action(
    &git,
    repo,
    "tag-create",
    json!({"name":"v1", "reference":head, "message":"Release one"}),
  )
  .unwrap();
  let tag = git.tags(repo).unwrap().remove(0);
  assert!(tag.annotated);
  assert_eq!(tag.target, head);
  assert!(action(&git, repo, "tag-create", json!({"name":"v1"})).is_err());
  assert!(action(&git, repo, "tag-delete", json!({"name":"v1", "reference":head})).is_err());
  let remote = tempfile::tempdir().unwrap();
  git.run(remote.path(), &["init", "--bare"], false).unwrap();
  git
    .run(
      repo,
      &["remote", "add", "origin", remote.path().to_str().unwrap()],
      false,
    )
    .unwrap();
  action(
    &git,
    repo,
    "tag-push",
    json!({"name":"v1", "reference":tag.object,"url":"origin"}),
  )
  .unwrap();
  assert_eq!(text(&git, remote.path(), &["rev-parse", "refs/tags/v1"]), tag.object);
  git
    .run(remote.path(), &["update-ref", "refs/tags/v1", &head], false)
    .unwrap();
  assert!(action(
    &git,
    repo,
    "tag-delete-remote",
    json!({"name":"v1", "reference":tag.object,"url":"origin"})
  )
  .is_err());
  assert_eq!(text(&git, remote.path(), &["rev-parse", "refs/tags/v1"]), head);
  git
    .run(remote.path(), &["update-ref", "refs/tags/v1", &tag.object], false)
    .unwrap();
  action(
    &git,
    repo,
    "tag-delete-remote",
    json!({"name":"v1", "reference":tag.object,"url":"origin"}),
  )
  .unwrap();
  assert!(git.run(remote.path(), &["rev-parse", "refs/tags/v1"], false).is_err());
  action(
    &git,
    repo,
    "tag-push",
    json!({"name":"v1", "reference":tag.object,"url":"origin"}),
  )
  .unwrap();
  action(&git, repo, "tag-delete", json!({"name":"v1", "reference":tag.object})).unwrap();
  assert!(git.tags(repo).unwrap().is_empty());
  assert!(git.run(remote.path(), &["rev-parse", "refs/tags/v1"], false).is_ok());
  action(&git, repo, "tag-create", json!({"name":"light", "reference":head})).unwrap();
  assert!(!git.tags(repo).unwrap()[0].annotated);
}

#[test]
fn submodules_preserve_dirty_files_and_resolve_gitlink_conflicts() {
  let (temp, git) = fixture();
  let repo = temp.path();
  commit(&git, repo, b"base");
  let (child, _) = fixture();
  let first = commit(&git, child.path(), b"one");
  let second = commit(&git, child.path(), b"two");
  git
    .run(
      repo,
      &[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        child.path().to_str().unwrap(),
        "module",
      ],
      false,
    )
    .unwrap();
  git.run(repo, &["commit", "-am", "Add module"], false).unwrap();
  let module = repo.join("module");
  fs::write(module.join("file"), "valuable edits").unwrap();
  assert!(git.submodules(repo).unwrap()[0].dirty);
  assert!(action(&git, repo, "submodule-update", json!({"name":"module"})).is_err());
  assert!(action(&git, repo, "submodule-remove", json!({"name":"module"})).is_err());
  assert_eq!(fs::read_to_string(module.join("file")).unwrap(), "valuable edits");
  git.run(&module, &["restore", "--", "file"], false).unwrap();
  action(&git, repo, "submodule-update", json!({"name":"module"})).unwrap();
  git
    .run(repo, &["update-index", "--force-remove", "--", "module"], false)
    .unwrap();
  let index = format!("160000 {first} 2\tmodule\n160000 {second} 3\tmodule\n");
  assert!(
    process::execute_with_input(repo, &["update-index", "--index-info"], Some(index.as_bytes()))
      .unwrap()
      .status
      .success()
  );
  assert_eq!(git.conflict_content(repo, "module").unwrap().kind, "submodule");
  fs::rename(module.join(".git"), module.join(".git.saved")).unwrap();
  assert!(action(
    &git,
    repo,
    "resolve",
    json!({"paths":["module"],"choice":"submodule","reference":"HEAD"})
  )
  .unwrap_err()
  .contains("Initialize the submodule"));
  fs::rename(module.join(".git.saved"), module.join(".git")).unwrap();
  action(&git, repo, "resolve", json!({"paths":["module"],"choice":"ours"})).unwrap();
  assert_eq!(text(&git, repo, &["rev-parse", ":module"]), first);
  assert_eq!(text(&git, &module, &["rev-parse", "HEAD"]), second);
}

#[test]
fn binary_and_deleted_sides_are_explicit_and_rename_keeps_content() {
  let (temp, git) = fixture();
  let repo = temp.path();
  commit(&git, repo, b"base\0");
  git.run(repo, &["switch", "-c", "topic"], false).unwrap();
  commit(&git, repo, b"theirs\0");
  git.run(repo, &["switch", "main"], false).unwrap();
  commit(&git, repo, b"ours\0");
  git.run(repo, &["merge", "topic"], true).unwrap();
  assert_eq!(git.conflict_content(repo, "file").unwrap().kind, "binary/large");
  action(&git, repo, "resolve", json!({"paths":["file"],"choice":"theirs"})).unwrap();
  assert_eq!(fs::read(repo.join("file")).unwrap(), b"theirs\0");
  git.run(repo, &["merge", "--abort"], false).unwrap();
  git.run(repo, &["switch", "topic"], false).unwrap();
  git.run(repo, &["rm", "file"], false).unwrap();
  git.run(repo, &["commit", "-m", "Delete file"], false).unwrap();
  git.run(repo, &["switch", "main"], false).unwrap();
  git.run(repo, &["merge", "topic"], true).unwrap();
  let content = git.conflict_content(repo, "file").unwrap();
  assert_eq!(content.kind, "delete/rename");
  assert!(content.stages.iter().all(|stage| stage.stage != 3));
  fs::write(repo.join("existing"), "keep").unwrap();
  assert!(action(
    &git,
    repo,
    "resolve",
    json!({"paths":["file"],"choice":"ours","directory":".git/resolution"})
  )
  .is_err());
  assert!(!repo.join(".git/resolution").exists());
  assert!(action(
    &git,
    repo,
    "resolve",
    json!({"paths":["file"],"choice":"ours","directory":"existing"})
  )
  .is_err());
  action(
    &git,
    repo,
    "resolve",
    json!({"paths":["file"],"choice":"ours","directory":"renamed"}),
  )
  .unwrap();
  assert!(!repo.join("file").exists());
  assert_eq!(fs::read(repo.join("renamed")).unwrap(), b"ours\0");
  assert!(text(&git, repo, &["ls-files", "-u"]).is_empty());
}

#[test]
fn lfs_patterns_are_literal_arguments_and_produce_real_pointers() {
  let (temp, git) = fixture();
  let repo = temp.path();
  commit(&git, repo, b"base");
  if !git.lfs_status(repo).unwrap().installed {
    return;
  }
  action(&git, repo, "lfs-install", json!({})).unwrap();
  action(&git, repo, "lfs-track", json!({"name":"*.asset"})).unwrap();
  assert!(git.lfs_status(repo).unwrap().tracking.contains("*.asset"));
  fs::write(repo.join("sample.asset"), "asset content").unwrap();
  git.run(repo, &["add", "sample.asset"], false).unwrap();
  assert!(text(&git, repo, &["show", ":sample.asset"]).starts_with("version https://git-lfs.github.com/spec/v1"));
  action(&git, repo, "lfs-untrack", json!({"name":"*.asset"})).unwrap();
  assert!(!git.lfs_status(repo).unwrap().tracking.contains("*.asset"));
  assert!(action(&git, repo, "lfs-track", json!({"name":"--help"})).is_err());
}
