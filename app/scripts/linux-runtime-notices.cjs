const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'linux') throw new Error('Collect Linux runtime notices on the packaging host.');
const bundle = path.resolve('src-tauri/target/release/bundle/appimage');
const appDirs = fs.readdirSync(bundle).filter(name => name.endsWith('.AppDir'));
if (appDirs.length !== 1) throw new Error('Expected one AppDir to inspect.');
const files = fs.readdirSync(path.join(bundle, appDirs[0]), { recursive: true, withFileTypes: true });
const packages = new Set();
const unknown = new Set();
for (const entry of files) {
  if (!entry.isFile() && !entry.isSymbolicLink()) continue;
  if (!/\.so($|\.)/.test(entry.name)) continue;
  let owners;
  try {
    owners = execFileSync('dpkg-query', ['-S', `*/${entry.name}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    unknown.add(entry.name);
    continue;
  }
  for (const line of owners.trim().split('\n')) {
    const separator = line.indexOf(': /');
    if (separator > 0) packages.add(line.slice(0, separator));
  }
}
const sections = [];
for (const name of [...packages].sort()) {
  const data = execFileSync('dpkg-query', ['-W', '-f=${Package}\t${Version}\t${source:Package}\t${source:Version}', name], {
    encoding: 'utf8'
  });
  const [pkg, version, source, sourceVersion] = data.split('\t');
  const copyright = `/usr/share/doc/${pkg}/copyright`;
  if (!fs.existsSync(copyright)) throw new Error(`Missing runtime copyright: ${pkg}`);
  let notice = fs.readFileSync(copyright, 'utf8');
  // Debian copyright files sometimes reference common licenses instead of reproducing them.
  for (const match of notice.matchAll(/\/usr\/share\/common-licenses\/([A-Za-z0-9.+-]+)/g)) {
    const license = `/usr/share/common-licenses/${match[1].replace(/\.$/, '')}`;
    if (fs.existsSync(license)) notice += `\n\n${license}\n${fs.readFileSync(license, 'utf8')}`;
  }
  sections.push(
    `${pkg} ${version}\nUbuntu source package: ${source || pkg} ${sourceVersion || version}\nSource: https://launchpad.net/ubuntu/+source/${source || pkg}/${encodeURIComponent(sourceVersion || version)}\n\n${notice}`
  );
}
if (unknown.size) throw new Error(`Review bundled libraries without Ubuntu provenance: ${[...unknown].join(', ')}`);
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync(
  'release/LINUX_RUNTIME_NOTICES.txt',
  `Branchlight Linux AppImage runtime notices\n\nThese unmodified shared libraries are bundled by Tauri/linuxdeploy from the\nUbuntu build host. Their copyright notices and source-package download links\nfollow. The Debian package instead uses system-provided runtime libraries.\n\nFor LGPL libraries, the AppImage can be extracted with --appimage-extract;\nits shared libraries can be replaced with compatible modified builds.\nBranchlight's MIT license does not restrict modification or reverse engineering\nfor debugging changes to these libraries.\n\n${sections.join('\n' + '='.repeat(78) + '\n')}`
);
console.log(`Collected runtime notices for ${packages.size} Ubuntu packages.`);
