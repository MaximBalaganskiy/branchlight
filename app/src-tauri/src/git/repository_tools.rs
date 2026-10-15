use super::{service::GitService, validation};
use crate::models::{
  lfs_status::LfsStatus, mutation::Mutation, reflog_entry::ReflogEntry, submodule::Submodule, tag::Tag,
};
use std::path::Path;

impl GitService {
  pub fn reflog(&self, repo: &Path) -> Result<Vec<ReflogEntry>, String> {
    let output = self.text(
      repo,
      &[
        "reflog",
        "show",
        "--all",
        "-1000",
        "--format=%H%x00%gD%x00%gs",
        "--date=iso-strict",
        "-z",
      ],
    )?;
    Ok(
      output
        .split_terminator('\0')
        .collect::<Vec<_>>()
        .as_chunks::<3>()
        .0
        .iter()
        .map(|fields| ReflogEntry {
          hash: fields[0].into(),
          reference: fields[1].into(),
          message: fields[2].into(),
          date: fields[1]
            .split_once("@{")
            .map(|(_, date)| date.trim_end_matches('}'))
            .unwrap_or("")
            .into(),
        })
        .collect(),
    )
  }

  pub fn tags(&self, repo: &Path) -> Result<Vec<Tag>, String> {
    let output = self.text(
      repo,
      &[
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname:strip=2)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(contents:subject)",
        "refs/tags/",
      ],
    )?;
    Ok(
      output
        .lines()
        .filter_map(|line| {
          let fields: Vec<_> = line.splitn(5, '\0').collect();
          (fields.len() == 5).then(|| Tag {
            name: fields[0].into(),
            object: fields[1].into(),
            target: if fields[2].is_empty() { fields[1] } else { fields[2] }.into(),
            annotated: fields[3] == "tag",
            message: fields[4].into(),
          })
        })
        .collect(),
    )
  }

  pub fn submodules(&self, repo: &Path) -> Result<Vec<Submodule>, String> {
    let output = self.text(repo, &["ls-files", "--stage", "-z"])?;
    let mut modules = Vec::new();
    for record in output.split_terminator('\0') {
      let Some((metadata, path)) = record.split_once('\t') else {
        continue;
      };
      let fields: Vec<_> = metadata.split_whitespace().collect();
      if fields.len() != 3 || fields[0] != "160000" || fields[2] != "0" {
        continue;
      }
      let directory = self.submodule_path(repo, path)?;
      let initialized = directory.join(".git").exists();
      let head = if initialized {
        self.resolve_reference(&directory, "HEAD").unwrap_or_default()
      } else {
        String::new()
      };
      let dirty = initialized && !self.text(&directory, &["status", "--porcelain=v1", "-z"])?.is_empty();
      modules.push(Submodule {
        path: path.into(),
        target: fields[1].into(),
        head,
        dirty,
      });
    }
    Ok(modules)
  }

  fn submodule_path(&self, repo: &Path, path: &str) -> Result<std::path::PathBuf, String> {
    validation::path(path)?;
    let directory = repo.join(path);
    if directory.exists()
      && !dunce::canonicalize(&directory)
        .map_err(|error| error.to_string())?
        .starts_with(dunce::canonicalize(repo).map_err(|error| error.to_string())?)
    {
      return Err("Submodule path escapes the working tree.".into());
    }
    Ok(directory)
  }

  pub fn lfs_status(&self, repo: &Path) -> Result<LfsStatus, String> {
    let version = self.run(repo, &["lfs", "version"], true)?;
    let installed = version.status.success();
    Ok(LfsStatus {
      installed,
      version: String::from_utf8_lossy(&version.stdout).trim().into(),
      tracking: if installed {
        self.text(repo, &["lfs", "track"])?
      } else {
        String::new()
      },
      files: if installed {
        self.text(repo, &["lfs", "ls-files"])?
      } else {
        String::new()
      },
      status: if installed {
        self.text(repo, &["lfs", "status"])?
      } else {
        String::new()
      },
    })
  }

  pub(super) fn repository_tool_action(&self, repo: &Path, action: &str, payload: &Mutation) -> Result<(), String> {
    self.require_idle(repo)?;
    let name = payload.name.as_deref().unwrap_or("");
    match action {
      "reflog-recover" => {
        self.validate_branch(repo, name)?;
        let hash = self.resolve_reference(repo, payload.reference.as_deref().ok_or("Select a reflog entry.")?)?;
        if !self.reflog(repo)?.iter().any(|entry| entry.hash == hash) {
          return Err("This reflog entry is no longer available.".into());
        }
        self.run(repo, &["branch", "--", name, &hash], false)?;
      }
      "tag-create" | "tag-delete" | "tag-push" | "tag-delete-remote" => {
        if name.is_empty() || name.starts_with('-') {
          return Err("Enter a tag name.".into());
        }
        let reference = format!("refs/tags/{name}");
        self.run(repo, &["check-ref-format", &reference], false)?;
        if action == "tag-create" {
          let target = self.resolve_reference(repo, payload.reference.as_deref().unwrap_or("HEAD"))?;
          if let Some(message) = payload.message.as_deref().filter(|message| !message.trim().is_empty()) {
            self.run(repo, &["tag", "-a", name, &target, "-m", message], false)?;
          } else {
            self.run(repo, &["-c", "tag.gpgsign=false", "tag", "--", name, &target], false)?;
          }
        } else {
          let tag = self
            .tags(repo)?
            .into_iter()
            .find(|tag| tag.name == name)
            .ok_or("Tag no longer exists.")?;
          if payload.reference.as_deref() != Some(&tag.object) {
            return Err("The tag changed. Reload before continuing.".into());
          }
          if action == "tag-delete" {
            self.run(repo, &["update-ref", "-d", &reference, &tag.object], false)?;
          } else {
            let remote = payload.url.as_deref().ok_or("Choose a remote.")?;
            if !self.remotes(repo)?.iter().any(|item| item.name == remote) {
              return Err("Choose an existing remote.".into());
            }
            if action == "tag-delete-remote" {
              self.run(
                repo,
                &[
                  "push",
                  &format!("--force-with-lease={reference}:{}", tag.object),
                  "--",
                  remote,
                  &format!(":{reference}"),
                ],
                false,
              )?;
            } else {
              self.run(
                repo,
                &["push", "--", remote, &format!("{reference}:{reference}")],
                false,
              )?;
            }
          }
        }
      }
      "submodule-add" => {
        validation::path(name)?;
        if name.starts_with('-')
          || name
            .split(['/', '\\'])
            .any(|part| part.eq_ignore_ascii_case(".git") || part.is_empty() || part == ".")
        {
          return Err("Choose an unused submodule path.".into());
        }
        let url = payload
          .url
          .as_deref()
          .filter(|url| !url.is_empty() && !url.starts_with('-') && !url.contains(['\0', '\r', '\n']))
          .ok_or("Enter the submodule URL.")?;
        self.run(repo, &["submodule", "add", "--", url, name], false)?;
      }
      "submodule-update" | "submodule-sync" | "submodule-remove" => {
        let module = self
          .submodules(repo)?
          .into_iter()
          .find(|module| module.path == name)
          .ok_or("Select a submodule.")?;
        if action == "submodule-update" {
          if module.dirty {
            return Err("Commit or stash changes inside the submodule first.".into());
          }
          self.run(
            repo,
            &["submodule", "update", "--init", "--recursive", "--", name],
            false,
          )?;
        } else if action == "submodule-sync" {
          self.run(repo, &["submodule", "sync", "--recursive", "--", name], false)?;
        } else {
          if module.dirty {
            return Err("Commit or stash changes inside the submodule before removing it.".into());
          }
          self.run(repo, &["rm", "--", name], false)?;
        }
      }
      "lfs-install" => {
        self.run(repo, &["lfs", "install", "--local"], false)?;
      }
      "lfs-track" | "lfs-untrack" => {
        if name.is_empty() || name.starts_with('-') || name.contains(['\0', '\n', '\r']) {
          return Err("Enter a file pattern, for example *.psd.".into());
        }
        self.run(
          repo,
          &[
            "lfs",
            if action == "lfs-track" { "track" } else { "untrack" },
            "--",
            name,
          ],
          false,
        )?;
      }
      "lfs-pull" | "lfs-fetch" | "lfs-push" => {
        if !self.remotes(repo)?.iter().any(|remote| remote.name == name) {
          return Err("Choose a remote.".into());
        }
        self.run(repo, &["lfs", action.trim_start_matches("lfs-"), name], false)?;
      }
      _ => return Err("Unknown repository tool.".into()),
    }
    Ok(())
  }
}
