const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/assets/gitaur.svg');
const output = path.join(root, 'test-results/generated-icons');
const result = spawnSync(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'icon', source, '--output', output], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true
});
if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
const icons = path.join(root, 'src-tauri/icons');
for (const name of ['32x32.png', '64x64.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico', 'icon.icns']) {
  fs.copyFileSync(path.join(output, name), path.join(icons, name));
}
fs.copyFileSync(source, path.join(icons, 'app-icon.svg'));
fs.copyFileSync(path.join(icons, 'icon.ico'), path.join(root, 'favicon.ico'));
