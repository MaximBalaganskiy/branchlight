const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/drafts-'));
  const repo = path.join(root, 'repo');
  const profile = path.join(root, 'profile');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  for (const [key, value] of [
    ['user.name', 'Draft Test'],
    ['user.email', 'draft@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false']
  ]) {
    await git(repo, ['config', key, value]);
  }
  const file = path.join(repo, 'file.ts');
  await fs.writeFile(file, 'const value = "base";\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Base']);
  await git(repo, ['switch', '-c', 'topic']);
  await fs.writeFile(file, 'const value = "theirs";\n');
  await git(repo, ['commit', '-am', 'Theirs']);
  await git(repo, ['switch', 'main']);
  await fs.writeFile(file, 'const value = "ours";\n');
  await git(repo, ['commit', '-am', 'Ours']);
  await git(repo, ['merge', 'topic']).catch(() => {});
  const original = await fs.readFile(file, 'utf8');
  let app;
  const errors = [];
  async function open() {
    app = await launchTauri(repo, profile);
    app.context.on('page', window => window.on('pageerror', error => errors.push(error.message)));
    const [window] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.getByRole('button', { name: /Commit changes/ }).click()
    ]);
    window.setDefaultTimeout(15000);
    await window.getByRole('button', { name: 'Resolve conflict…', exact: true }).click();
    return window;
  }
  try {
    let window = await open();
    let dialog = window.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Accept theirs', exact: true }).click();
    await dialog.getByText('Draft saved on this device', { exact: true }).waitFor();
    assert.equal(await fs.readFile(file, 'utf8'), original);
    // Terminate the isolated app without closing the editor: autosaved work must survive.
    await app.close();
    app = null;
    window = await open();
    dialog = window.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Restore draft', exact: true }).click();
    await dialog.getByText('All conflicts resolved — review the result', { exact: true }).waitFor();
    assert.ok((await dialog.getByRole('textbox', { name: 'Resolved content', exact: true }).innerText()).includes('"theirs"'));
    await app.close();
    app = null;
    await fs.writeFile(file, original + '// external edit\n');
    window = await open();
    dialog = window.getByRole('dialog');
    const stale = dialog.getByRole('textbox', { name: /Previous draft/ });
    await stale.waitFor();
    assert.ok((await stale.inputValue()).includes('"theirs"'));
    assert.equal(await dialog.getByRole('button', { name: 'Restore draft', exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('textbox', { name: 'Resolved content', exact: true }).count(), 0);
    await window.screenshot({ path: path.resolve('test-results/stale-merge-draft.png') });
    await dialog.getByRole('button', { name: 'Start again', exact: true }).click();
    await dialog.getByText('Conflict 1 of 1 remaining', { exact: true }).waitFor();
    assert.ok((await dialog.getByRole('textbox', { name: 'Resolved content', exact: true }).innerText()).includes('// external edit'));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: automatic drafts survive application restart, preserve decisions, and refuse stale restoration while retaining copyable edits.'
    );
  } finally {
    await app?.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
