use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Output, Stdio};

const OUTPUT_LIMIT: u64 = 32 * 1024 * 1024;

pub fn execute(repo: &Path, args: &[&str]) -> Result<Output, String> {
  execute_with_input(repo, args, None)
}

pub fn execute_with_input(repo: &Path, args: &[&str], input: Option<&[u8]>) -> Result<Output, String> {
  let mut command = Command::new(std::env::var_os("BRANCHLIGHT_GIT").unwrap_or_else(|| "git".into()));
  command
    .current_dir(repo)
    .args(["--no-pager", "--literal-pathspecs", "-c", "color.ui=false"])
    .args(args)
    .env("GIT_TERMINAL_PROMPT", "0")
    .env("GCM_INTERACTIVE", "never")
    .env("GIT_OPTIONAL_LOCKS", "0")
    .stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() })
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
  let stdin = child.stdin.take();
  let (out, err, written) = std::thread::scope(|scope| {
    let out = scope.spawn(|| read_bounded(stdout));
    let err = scope.spawn(|| read_bounded(stderr));
    let written = scope.spawn(move || match (stdin, input) {
      (Some(mut stream), Some(bytes)) => stream.write_all(bytes).map_err(|error| error.to_string()),
      _ => Ok(()),
    });
    (out.join().unwrap(), err.join().unwrap(), written.join().unwrap())
  });
  let status = child.wait().map_err(|error| error.to_string())?;
  if status.success() {
    written?;
  }
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
