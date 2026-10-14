const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const localTools = path.resolve('../.toolchains');
const cargoBin = path.join(localTools, 'cargo', 'bin');
if (fs.existsSync(cargoBin)) {
  process.env.CARGO_HOME = path.join(localTools, 'cargo');
  process.env.RUSTUP_HOME = path.join(localTools, 'rustup');
  process.env.PATH = cargoBin + path.delimiter + process.env.PATH;
}

const localLibraries = path.join(localTools, 'msvc-libs');
if (process.platform === 'win32' && fs.existsSync(localLibraries)) {
  process.env.LIB = [localLibraries, process.env.LIB].filter(Boolean).join(path.delimiter);
  const localHeaders = path.join(localTools, 'crt-headers/Contents/VC/Tools/MSVC/14.44.35207/include');
  process.env.INCLUDE = [localHeaders, process.env.INCLUDE].filter(Boolean).join(path.delimiter);
}

const [command, ...args] = process.argv.slice(2);
const executable = command === 'tauri' ? process.execPath : process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const commandArgs = command === 'tauri' ? [require.resolve('@tauri-apps/cli/tauri.js'), ...args] : args;
const result = spawnSync(executable, commandArgs, { stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(result.error.message);
}
process.exitCode = result.status ?? 1;
