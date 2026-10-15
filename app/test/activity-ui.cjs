const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/activity-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  await fs.mkdir(repo);
  await fs.mkdir(remote);
  await git(repo, ['init', '-b', 'main']);
  await git(remote, ['init', '--bare']);
  await git(repo, ['config', 'user.name', 'Activity Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(repo, 'file.txt'), 'Initial\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Initial']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  await git(repo, ['push', '-u', 'origin', 'main']);
  await fs.writeFile(path.join(repo, 'file.txt'), 'Updated\n');
  await git(repo, ['commit', '-am', 'Updated']);
  const hook = path.join(repo, '.git', 'hooks', 'pre-push');
  const gate = path.join(repo, '.git', 'activity-release');
  const waitForGate = '#!/bin/sh\nwhile [ ! -f .git/activity-release ]; do sleep 0.1; done\n';
  await fs.writeFile(hook, waitForGate + 'echo "Push rejected by test hook" >&2\nexit 1\n');
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const page = app.page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.getByRole('button', { name: 'Updated', exact: true }).waitFor();
    const progress = page.getByRole('progressbar', { name: 'Task in progress', exact: true });
    await progress.waitFor({ state: 'hidden' });
    const historyBounds = await page.locator('history').boundingBox();
    const themeBounds = await page.getByRole('button', { name: 'Toggle theme', exact: true }).boundingBox();
    await page.getByRole('button', { name: '↑ Push', exact: true }).click();
    await progress.waitFor();
    assert.equal(await progress.getAttribute('aria-valuenow'), null);
    assert.equal(await progress.getAttribute('data-indeterminate'), '');
    assert.equal(await page.getByRole('button', { name: '↑ Push', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.locator('history').boundingBox(), historyBounds);
    assert.deepEqual(await page.getByRole('button', { name: 'Toggle theme', exact: true }).boundingBox(), themeBounds);
    await page.getByRole('button', { name: 'Initial', exact: true }).click();
    await page.locator('.diff-code').getByText('+Initial', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await progress.isVisible(), true, 'A second request must not hide a still-running push');
    await page.screenshot({ path: path.resolve('test-results/activity.png') });
    await fs.writeFile(gate, 'release');
    await page.getByText('Push rejected by test hook', { exact: false }).waitFor();
    await progress.waitFor({ state: 'hidden' });
    await fs.unlink(gate);
    await fs.writeFile(hook, waitForGate + 'exit 0\n');
    await page.getByRole('button', { name: '↑ Push', exact: true }).click();
    await progress.waitFor();
    await fs.writeFile(gate, 'release');
    await page.getByText('Push complete', { exact: true }).waitFor();
    await progress.waitFor({ state: 'hidden' });
    assert.equal((await git(remote, ['rev-parse', 'main'])).stdout, (await git(repo, ['rev-parse', 'HEAD'])).stdout);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: visible headless progress, stable layout, concurrent diff loading, keyboard access, failure cleanup, and successful retry.'
    );
  } catch (error) {
    console.log('Renderer errors:', errors);
    console.log((await page.locator('body').innerText()).slice(-5000));
    await page.screenshot({ path: path.resolve('test-results/activity-failure.png') });
    throw error;
  } finally {
    await fs.writeFile(gate, 'release');
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
