const fs = require('node:fs');
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tauriVersion = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const cargoVersion = fs.readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
  throw new Error('Keep package.json, tauri.conf.json and Cargo.toml versions in sync before building.');
}

if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${packageVersion}`) {
  throw new Error(`Release tag must be v${packageVersion}; received ${process.env.GITHUB_REF_NAME}.`);
}

console.log(`Release version: ${packageVersion}`);
