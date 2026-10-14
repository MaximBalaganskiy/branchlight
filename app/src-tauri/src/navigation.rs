use tauri::Url;

pub fn allowed(url: &Url, development: bool) -> bool {
  if !url.username().is_empty() || url.password().is_some() {
    return false;
  }

  let local_app = url.port().is_none()
    && match url.scheme() {
      "tauri" => url.host_str() == Some("localhost"),
      "http" | "https" => url.host_str() == Some("tauri.localhost"),
      _ => false,
    };
  let dev_server = development
    && url.scheme() == "http"
    && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
    && url.port() == Some(5173);

  local_app || dev_server
}

#[cfg(test)]
mod tests {
  use super::allowed;
  use tauri::Url;

  #[test]
  fn accepts_packaged_urls_on_linux_and_windows() {
    for address in [
      "tauri://localhost/",
      "tauri://localhost/index.html?mode=commit",
      "http://tauri.localhost/",
      "https://tauri.localhost/index.html",
    ] {
      assert!(allowed(&Url::parse(address).unwrap(), false), "{address}");
    }
  }

  #[test]
  fn only_allows_the_dev_server_in_development() {
    for address in ["http://localhost:5173/", "http://127.0.0.1:5173/"] {
      let url = Url::parse(address).unwrap();
      assert!(allowed(&url, true));
      assert!(!allowed(&url, false));
    }
  }

  #[test]
  fn rejects_external_and_lookalike_urls() {
    for address in [
      "https://example.com/",
      "tauri://example.com/",
      "tauri://localhost.example.com/",
      "https://tauri.localhost.example.com/",
      "http://localhost/",
      "http://localhost:5174/",
      "https://localhost:5173/",
      "http://tauri.localhost:5173/",
      "tauri://localhost:5173/",
      "http://user@tauri.localhost/",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ] {
      let url = Url::parse(address).unwrap();
      assert!(!allowed(&url, false), "{address}");
      assert!(!allowed(&url, true), "{address}");
    }
  }
}
