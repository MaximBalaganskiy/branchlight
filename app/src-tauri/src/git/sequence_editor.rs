use std::path::Path;

// Git appends its todo filename to this helper command. No plan text is evaluated as shell code.
pub fn command(executable: &Path, plan: &Path) -> String {
  format!("{} --apply-rebase-plan {}", quote(executable), quote(plan))
}

fn quote(path: &Path) -> String {
  format!("'{}'", path.to_string_lossy().replace('\\', "/").replace('\'', "'\\''"))
}

pub fn run() -> Option<i32> {
  let args: Vec<_> = std::env::args_os().collect();
  if args.get(1).is_none_or(|arg| arg != "--apply-rebase-plan") {
    return None;
  }
  if args.len() != 4 {
    return Some(1);
  }
  Some(if std::fs::copy(&args[2], &args[3]).is_ok() {
    0
  } else {
    1
  })
}
