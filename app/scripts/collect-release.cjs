const fs = require('node:fs');
const path = require('node:path');

const windows = process.platform === 'win32';
const platform = windows ? 'windows' : process.platform;
const filename = windows ? 'Branchlight.exe' : 'branchlight';
const source = path.resolve('src-tauri/target/release', windows ? 'branchlight.exe' : 'branchlight');
const directory = path.resolve('release', platform);
fs.mkdirSync(directory, { recursive: true });
const destination = path.join(directory, filename);
fs.copyFileSync(source, destination);
console.log(`App: ${destination} (${(fs.statSync(destination).size / 1024 ** 2).toFixed(2)} MiB)`);

const bundle = path.resolve('src-tauri/target/release/bundle');
const kinds = windows ? ['nsis'] : ['deb', 'appimage'];
for (const kind of process.argv.includes('--bundles') ? kinds : []) {
  const folder = path.join(bundle, kind);
  if (!fs.existsSync(folder)) {
    continue;
  }

  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(exe|deb|AppImage)$/.test(entry.name)) {
      continue;
    }

    const target = path.resolve('release', entry.name);
    fs.copyFileSync(path.join(folder, entry.name), target);
    console.log(`Installer: ${target} (${(fs.statSync(target).size / 1024 ** 2).toFixed(2)} MiB)`);
  }
}
