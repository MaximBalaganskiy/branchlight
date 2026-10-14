use std::io::Read;
use std::path::Path;
use std::process::{Command, Output, Stdio};

const OUTPUT_LIMIT: u64 = 32 * 1024 * 1024;

pub fn execute(repo: &Path, args: &[&str]) -> Result<Output, String> {
  let mut command = Command::new(std::env::var_os("BRANCHLIGHT_GIT").unwrap_or_else(|| "git".into()));
  command
    .current_dir(repo)
    .args(["--no-pager", "--literal-pathspecs", "-c", "color.ui=false"])
    .args(args)
    .env("GIT_TERMINAL_PROMPT", "0")
    .env("GCM_INTERACTIVE", "never")
    .env("GIT_OPTIONAL_LOCKS", "0")
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
  }
  let mut child = command.spawn().map_err(|error| {
    if error.kind() == std::io::ErrorKind::NotFound {
      "Git was not found. Install Git and ensure it is on PATH.".to_owned()
    } else {
      error.to_string()
    }
  })?;
  let stdout = child.stdout.take().ok_or("Cannot capture Git output.")?;
  let stderr = child.stderr.take().ok_or("Cannot capture Git errors.")?;
  let (out, err) = std::thread::scope(|scope| {
    let out = scope.spawn(|| read_bounded(stdout));
    let err = scope.spawn(|| read_bounded(stderr));
    (out.join().unwrap(), err.join().unwrap())
  });
  let status = child.wait().map_err(|error| error.to_string())?;
  Ok(Output {
    status,
    stdout: out?,
    stderr: err?,
  })
}

fn read_bounded(stream: impl Read) -> Result<Vec<u8>, String> {
  let mut data = Vec::new();
  stream
    .take(OUTPUT_LIMIT + 1)
    .read_to_end(&mut data)
    .map_err(|error| error.to_string())?;
  if data.len() as u64 > OUTPUT_LIMIT {
    return Err("Git output exceeds the 32 MB limit. Narrow the requested operation.".into());
  }
  Ok(data)
}
