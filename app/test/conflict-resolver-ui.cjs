const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/resolver-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  for (const [key, value] of [
    ['user.name', 'Merge Test'],
    ['user.email', 'merge@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false']
  ]) {
    await git(repo, ['config', key, value]);
  }
  const file = path.join(repo, 'sample.ts');
  const separator = Array.from({ length: 12 }, (_, index) => `// context ${index}\r\n`).join('');
  const base = `const first = "base";\r\n${separator}const last = "base";\r\n${separator}// tail\r\n`;
  await fs.writeFile(file, base);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Base']);
  await git(repo, ['switch', '-c', 'feature']);
  const theirs = base.replaceAll('"base"', '"theirs"').replace('// tail', '// automatic merge');
  await fs.writeFile(file, theirs);
  await git(repo, ['commit', '-am', 'Theirs']);
  await git(repo, ['switch', 'main']);
  const ours = base.replaceAll('"base"', '"ours"');
  await fs.writeFile(file, ours);
  await git(repo, ['commit', '-am', 'Ours']);
  await git(repo, ['merge', 'feature']).catch(() => {});
  const conflicted = await fs.readFile(file, 'utf8');
  assert.ok(conflicted.includes('<<<<<<<'));
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const errors = [];
  app.context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    const [commit] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.getByRole('button', { name: /Commit changes/ }).click()
    ]);
    commit.setDefaultTimeout(15000);
    await commit.getByRole('button', { name: 'Resolve conflict…', exact: true }).click();
    const dialog = commit.getByRole('dialog');
    const result = dialog.getByRole('textbox', { name: 'Resolved content', exact: true });
    await result.waitFor();
    await dialog.getByText('Conflict 1 of 2 remaining', { exact: true }).waitFor();
    assert.equal(
      await dialog
        .locator('.cm-gutters')
        .first()
        .evaluate(element => getComputedStyle(element).backgroundColor),
      'rgb(30, 30, 30)'
    );
    await commit.screenshot({ path: path.resolve('test-results/internal-resolver-conflicts.png') });
    await app.page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await commit.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(
      await dialog
        .locator('.cm-gutters')
        .first()
        .evaluate(element => getComputedStyle(element).backgroundColor),
      'rgb(255, 255, 255)'
    );
    await commit.screenshot({ path: path.resolve('test-results/internal-resolver-light.png') });
    await app.page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await commit.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.ok((await dialog.getByRole('textbox', { name: 'Common ancestor', exact: true }).innerText()).includes('"base"'));
    assert.ok(await result.locator('span').count(), 'Result should have syntax tokens');
    await result.focus();
    await commit.keyboard.press('F7');
    await dialog.getByText('Conflict 2 of 2 remaining', { exact: true }).waitFor();
    await commit.keyboard.press('Shift+F7');
    await dialog.getByText('Conflict 1 of 2 remaining', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Accept ours', exact: true }).click();
    await dialog.getByText('Conflict 1 of 1 remaining', { exact: true }).waitFor();
    assert.equal(await fs.readFile(file, 'utf8'), conflicted, 'Choices must not write the working file');
    await commit.keyboard.press('Control+z');
    await dialog.getByText('Conflict 1 of 2 remaining', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await dialog.getByText('Conflict 1 of 1 remaining', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Both: theirs first', exact: true }).click();
    await dialog.getByText('No conflict markers remaining — review the result', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await dialog.getByText('Conflict 1 of 1 remaining', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Both: ours first', exact: true }).click();
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await dialog.getByRole('button', { name: 'Accept theirs', exact: true }).click();
    await dialog.getByText('No conflict markers remaining — review the result', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await result.press('Escape');
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await result.focus();
    await commit.keyboard.press('Control+End');
    await commit.keyboard.insertText('// reviewed\n');
    await commit.screenshot({ path: path.resolve('test-results/internal-resolver.png') });
    // Stale working files must not be overwritten, including a partially resolved draft.
    await fs.writeFile(file, 'External edit\r\n');
    await dialog.getByRole('button', { name: 'Save result and stage', exact: true }).click();
    await dialog
      .getByRole('alert')
      .getByText(/file changed outside this editor/)
      .waitFor();
    assert.equal(await fs.readFile(file, 'utf8'), 'External edit\r\n');
    await fs.writeFile(file, conflicted);
    await dialog.getByRole('button', { name: 'Save result and stage', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const expected = theirs.replace('const first = "theirs";', 'const first = "ours";') + '// reviewed\r\n';
    assert.equal(await fs.readFile(file, 'utf8'), expected);
    assert.equal((await git(repo, ['show', ':sample.ts'])).stdout, expected);
    assert.equal((await git(repo, ['ls-files', '-u'])).stdout, '');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: multiple conflicts, ancestor chunks, per-conflict choices, undo/redo, keyboard navigation, draft protection, stale-file rejection and CRLF preservation.'
    );
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
