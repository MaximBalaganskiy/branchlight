#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  if let Some(code) = gitaur_lib::git::sequence_editor::run() {
    std::process::exit(code);
  }
  gitaur_lib::run();
}
