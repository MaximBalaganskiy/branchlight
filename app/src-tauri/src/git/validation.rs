use std::path::Path;

pub fn path(value: &str) -> Result<(), String> {
  if value.is_empty()
    || value.contains('\0')
    || Path::new(value).is_absolute()
    || value.starts_with(['/', '\\'])
    || value.as_bytes().get(1) == Some(&b':')
    || value.split(['/', '\\']).any(|part| part == "..")
  {
    return Err("Invalid repository-relative path.".into());
  }
  Ok(())
}

pub fn hash(value: &str) -> Result<(), String> {
  if ![40, 64].contains(&value.len()) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
    return Err("Invalid commit identifier.".into());
  }
  Ok(())
}
