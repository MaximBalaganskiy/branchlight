#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  if let Some(code) = branchlight_lib::git::sequence_editor::run() {
    std::process::exit(code);
  }
  branchlight_lib::run();
}
