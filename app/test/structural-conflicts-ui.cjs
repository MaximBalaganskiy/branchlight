const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/structural-'));
  const repo = path.join(root, 'repo');
  const child = path.join(root, 'child');
  for (const directory of [repo, child]) {
    await fs.mkdir(directory);
    await git(directory, ['init', '-b', 'main']);
    for (const [key, value] of [
      ['user.name', 'Conflict Test'],
      ['user.email', 'test@example.invalid'],
      ['commit.gpgsign', 'false'],
      ['core.autocrlf', 'false']
    ]) {
      await git(directory, ['config', key, value]);
    }
  }
  await fs.writeFile(path.join(child, 'child.txt'), 'first\n');
  await git(child, ['add', '.']);
  await git(child, ['commit', '-m', 'First']);
  const first = (await git(child, ['rev-parse', 'HEAD'])).stdout.trim();
  await fs.writeFile(path.join(child, 'child.txt'), 'second\n');
  await git(child, ['commit', '-am', 'Second']);
  const second = (await git(child, ['rev-parse', 'HEAD'])).stdout.trim();
  await fs.writeFile(path.join(repo, 'binary.dat'), 'base\0');
  await fs.writeFile(path.join(repo, 'deleted.txt'), 'base\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Base']);
  await git(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', child, 'module']);
  await git(repo, ['commit', '-am', 'Submodule']);
  await git(repo, ['switch', '-c', 'topic']);
  await fs.writeFile(path.join(repo, 'binary.dat'), 'theirs\0');
  await git(repo, ['rm', 'deleted.txt']);
  await git(repo, ['commit', '-am', 'Theirs']);
  await git(repo, ['switch', 'main']);
  await fs.writeFile(path.join(repo, 'binary.dat'), 'ours\0');
  await fs.writeFile(path.join(repo, 'deleted.txt'), 'keep me\n');
  await git(repo, ['commit', '-am', 'Ours']);
  await git(repo, ['merge', 'topic']).catch(() => {});
  await git(repo, ['update-index', '--force-remove', '--', 'module']);
  execFileSync('git', ['update-index', '--index-info'], {
    cwd: repo,
    input: `160000 ${first} 2\tmodule\n160000 ${second} 3\tmodule\n`,
    windowsHide: true
  });
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const errors = [];
  app.context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    const [commit] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.getByRole('button', { name: /Commit changes/ }).click()
    ]);
    commit.setDefaultTimeout(15000);
    const dialog = commit.getByRole('dialog');
    async function open(file) {
      await commit.locator('change-list').first().locator(`[title="${file}"]`).click();
      await commit.getByRole('button', { name: 'Resolve conflict…', exact: true }).click();
    }
    await open('binary.dat');
    await dialog.getByText('Binary or large file conflict', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Use theirs and stage', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await fs.readFile(path.join(repo, 'binary.dat'), 'utf8'), 'theirs\0');
    await open('deleted.txt');
    await dialog.getByText('File deletion or rename conflict', { exact: true }).waitFor();
    await dialog.getByText('Theirs: deleted / absent', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'Resolved file path', exact: true }).fill('binary.dat');
    await dialog.getByRole('button', { name: 'Use ours and stage', exact: true }).click();
    await dialog
      .getByRole('alert')
      .getByText(/destination already exists/)
      .waitFor();
    await dialog.getByRole('textbox', { name: 'Resolved file path', exact: true }).fill('kept.txt');
    await commit.screenshot({ path: path.resolve('test-results/rename-conflict.png') });
    await dialog.getByRole('button', { name: 'Use ours and stage', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await fs.readFile(path.join(repo, 'kept.txt'), 'utf8'), 'keep me\n');
    await open('module');
    await dialog.getByText('Submodule commit conflict', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'Resolved submodule commit', exact: true }).fill('missing-commit');
    await dialog.getByRole('button', { name: 'Stage submodule commit', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    await commit.screenshot({ path: path.resolve('test-results/submodule-conflict.png') });
    await dialog.getByRole('button', { name: 'Use ours and stage', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await git(repo, ['rev-parse', ':module'])).stdout.trim(), first);
    assert.equal((await git(path.join(repo, 'module'), ['rev-parse', 'HEAD'])).stdout.trim(), second);
    assert.equal((await git(repo, ['ls-files', '-u'])).stdout, '');
    assert.deepEqual(errors, []);
    console.log('PASS: binary sides, delete/rename destination validation, and submodule commit resolution in the desktop UI.');
  } catch (error) {
    for (const [index, page] of app.context.pages().entries()) {
      await page.screenshot({ path: path.resolve(`test-results/structural-failure-${index}.png`) }).catch(() => {});
    }
    console.error('Desktop page errors:', errors);
    throw error;
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
