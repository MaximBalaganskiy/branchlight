use crate::models::{changed_file::ChangedFile, commit::Commit};

pub fn status(output: &str) -> Vec<ChangedFile> {
  let mut records = output.split('\0');
  let mut files = Vec::new();
  while let Some(line) = records.next() {
    if line.len() < 3 {
      continue;
    }
    let index = line.as_bytes()[0] as char;
    let worktree = line.as_bytes()[1] as char;
    let original_path = if ['R', 'C'].contains(&index) || ['R', 'C'].contains(&worktree) {
      records.next().map(str::to_owned)
    } else {
      None
    };
    files.push(ChangedFile {
      path: line[3..].to_owned(),
      original_path,
      index: index.to_string(),
      worktree: worktree.to_string(),
      staged: index != ' ' && index != '?',
      unstaged: worktree != ' ' || index == '?',
      conflict: ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(&&line[..2]),
    });
  }
  files
}

pub fn log(output: &str) -> Vec<Commit> {
  output
    .split('\0')
    .collect::<Vec<_>>()
    .as_chunks::<6>()
    .0
    .iter()
    .filter(|fields| !fields[0].is_empty())
    .map(|fields| Commit {
      hash: fields[0].to_owned(),
      parents: fields[1].split_whitespace().map(str::to_owned).collect(),
      author: fields[2].to_owned(),
      date: fields[3].to_owned(),
      subject: fields[4].to_owned(),
      refs: fields[5]
        .split(", ")
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect(),
    })
    .collect()
}
