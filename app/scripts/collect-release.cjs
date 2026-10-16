const fs = require('node:fs');
const path = require('node:path');

const windows = process.platform === 'win32';
const platform = windows ? 'windows' : process.platform;
const filename = windows ? 'Gitaur.exe' : 'gitaur';
const source = path.resolve('src-tauri/target/release', windows ? 'gitaur.exe' : 'gitaur');
const directory = path.resolve('release', platform);
const { productName, version } = JSON.parse(fs.readFileSync(path.resolve('src-tauri/tauri.conf.json'), 'utf8'));
const bundlePrefix = `${productName}_${version}_`.toLowerCase();
fs.mkdirSync(directory, { recursive: true });
const destination = path.join(directory, filename);
fs.copyFileSync(source, destination);
console.log(`App: ${destination} (${(fs.statSync(destination).size / 1024 ** 2).toFixed(2)} MiB)`);
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
  fs.copyFileSync(path.resolve('..', name), path.join(directory, name));
  fs.copyFileSync(path.resolve('..', name), path.resolve('release', name));
}

const bundle = path.resolve('src-tauri/target/release/bundle');
const kinds = windows ? ['nsis'] : ['deb', 'appimage'];
for (const kind of process.argv.includes('--bundles') ? kinds : []) {
  const folder = path.join(bundle, kind);
  if (!fs.existsSync(folder)) {
    continue;
  }

  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().startsWith(bundlePrefix) || !/\.(exe|deb|AppImage)$/.test(entry.name)) {
      continue;
    }

    const target = path.resolve('release', entry.name);
    fs.copyFileSync(path.join(folder, entry.name), target);
    console.log(`Installer: ${target} (${(fs.statSync(target).size / 1024 ** 2).toFixed(2)} MiB)`);
  }
}
