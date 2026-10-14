const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/daily-ui-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  await fs.mkdir(repo);
  await fs.mkdir(remote);
  await git(repo, ['init', '-b', 'main']);
  await git(remote, ['init', '--bare']);
  for (const [key, value] of [
    ['user.name', 'Daily Test'],
    ['user.email', 'test@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false']
  ]) {
    await git(repo, ['config', key, value]);
  }
  const original = Array.from({ length: 24 }, (_, index) => `line ${index + 1}\n`).join('');
  await fs.writeFile(path.join(repo, 'file.txt'), original);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Base']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  const working = original.replace('line 2\n', 'changed 2\n').replace('line 22\n', 'changed 22\n');
  await fs.writeFile(path.join(repo, 'file.txt'), working);
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const page = app.page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  app.context.on('page', window => window.on('pageerror', error => errors.push(error.message)));
  async function dismiss(window) {
    for (const button of await window.locator('.ui-toast-host button').all()) {
      if (await button.isVisible()) {
        await button.click();
      }
    }
  }
  try {
    await page.getByRole('button', { name: '↑ Push', exact: true }).click();
    const publishing = page.getByRole('dialog');
    await publishing.getByRole('button', { name: 'Remote', exact: true }).click();
    await page.getByRole('option', { name: 'origin', exact: true }).click();
    await publishing.getByRole('textbox', { name: 'Remote branch', exact: true }).fill('published-main');
    await publishing.getByRole('button', { name: 'Publish branch', exact: true }).click();
    await publishing.waitFor({ state: 'hidden' });
    assert.equal((await git(repo, ['rev-parse', '--abbrev-ref', '@{upstream}'])).stdout.trim(), 'origin/published-main');
    await dismiss(page);
    const [commit] = await Promise.all([app.context.waitForEvent('page'), page.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.setDefaultTimeout(15000);
    await commit.getByRole('button', { name: 'Stage hunk', exact: true }).first().click();
    await commit.locator('.stage-section').nth(1).locator('.file-item[title="file.txt"]').waitFor();
    assert.equal((await git(repo, ['show', ':file.txt'])).stdout, original.replace('line 2\n', 'changed 2\n'));
    await commit.locator('.stage-section').nth(1).locator('.file-item[title="file.txt"]').click();
    await commit.getByRole('button', { name: 'Unstage hunk', exact: true }).click();
    await commit.locator('.stage-section').nth(1).locator('.file-item[title="file.txt"]').waitFor({ state: 'hidden' });
    assert.equal((await git(repo, ['show', ':file.txt'])).stdout, original);
    await commit.locator('.diff-line.removed').filter({ hasText: '-line 2' }).first().getByRole('button').click();
    await commit.locator('.diff-line.added').filter({ hasText: '+changed 2' }).first().getByRole('button').click();
    await commit.getByRole('button', { name: 'Stage selected lines', exact: true }).click();
    await commit.locator('.stage-section').nth(1).locator('.file-item[title="file.txt"]').waitFor();
    assert.equal((await git(repo, ['show', ':file.txt'])).stdout, original.replace('line 2\n', 'changed 2\n'));
    await commit.screenshot({ path: path.resolve('test-results/partial-staging.png') });
    await commit.getByRole('button', { name: 'Stage all ↓', exact: true }).click();
    await commit.locator('.stage-section').first().locator('.stage-file').waitFor({ state: 'hidden' });
    await commit.locator('#commit-message').fill('Daily changes');
    await commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click();
    await page.getByRole('button', { name: 'Daily changes', exact: true }).waitFor();
    await commit.getByRole('button', { name: 'Amend last commit…', exact: true }).click();
    await commit.getByRole('button', { name: 'Review amend…', exact: true }).waitFor();
    assert.equal(await commit.locator('#commit-message').inputValue(), 'Daily changes');
    await commit.locator('#commit-message').fill('Corrected daily changes');
    await commit.getByRole('button', { name: 'Review amend…', exact: true }).click();
    await commit.getByRole('dialog').getByRole('button', { name: 'Amend commit', exact: true }).click();
    await page.getByRole('button', { name: 'Corrected daily changes', exact: true }).waitFor();
    await commit.getByRole('button', { name: 'Amend last commit…', exact: true }).waitFor();
    await commit.getByRole('button', { name: 'Undo last commit…', exact: true }).click();
    await commit.getByRole('dialog').getByRole('button', { name: 'Undo commit', exact: true }).click();
    await commit.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).stdout.trim(), 'Base');
    assert.equal(await fs.readFile(path.join(repo, 'file.txt'), 'utf8'), working);
    assert.equal((await git(repo, ['show', ':file.txt'])).stdout, working);
    await commit.locator('#commit-message').fill('Restored daily changes');
    await commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click();
    await page.getByRole('button', { name: 'Restored daily changes', exact: true }).waitFor();
    await commit.close();
    await dismiss(page);
    await page.getByRole('button', { name: '↑ Push', exact: true }).click();
    await page.getByText('Push complete', { exact: true }).waitFor();
    assert.equal((await git(remote, ['rev-parse', 'refs/heads/published-main'])).stdout, (await git(repo, ['rev-parse', 'HEAD'])).stdout);
    await fs.writeFile(path.join(repo, 'file.txt'), 'stash this\n');
    await fs.writeFile(path.join(repo, 'extra.txt'), 'untracked\n');
    await page.keyboard.press('F5');
    await dismiss(page);
    await page.getByRole('button', { name: 'Stashes', exact: true }).click();
    const stashes = page.getByRole('dialog');
    await stashes.getByRole('textbox', { name: 'Stash message (optional)', exact: true }).fill('UI stash');
    await stashes.getByRole('checkbox', { name: 'Include untracked files', exact: true }).first().press('Space');
    await stashes.getByRole('button', { name: 'Save stash', exact: true }).click();
    await stashes.getByRole('button', { name: 'Pop', exact: true }).waitFor();
    assert.equal((await git(repo, ['status', '--porcelain'])).stdout, '');
    await stashes.locator('.diff-code').getByText('+untracked', { exact: true }).waitFor();
    await stashes.getByRole('button', { name: 'Saved stash', exact: true }).click();
    await page.getByRole('option').filter({ hasText: 'UI stash' }).click();
    await page.screenshot({ path: path.resolve('test-results/stashes.png') });
    await stashes.getByRole('button', { name: 'Pop', exact: true }).click();
    await stashes.getByText('No saved stashes.', { exact: true }).waitFor();
    assert.equal(await fs.readFile(path.join(repo, 'extra.txt'), 'utf8'), 'untracked\n');
    await stashes.getByRole('textbox', { name: 'Stash message (optional)', exact: true }).fill('Apply and drop');
    await stashes.getByRole('button', { name: 'Save stash', exact: true }).click();
    await stashes.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByText('Stash applied', { exact: true }).waitFor();
    await stashes.getByRole('button', { name: 'Drop…', exact: true }).click();
    await stashes.getByRole('button', { name: 'Cancel deletion', exact: true }).click();
    assert.ok((await git(repo, ['stash', 'list'])).stdout.includes('Apply and drop'));
    await stashes.getByRole('button', { name: 'Drop…', exact: true }).click();
    await stashes.getByRole('button', { name: 'Delete stash', exact: true }).click();
    await stashes.getByText('No saved stashes.', { exact: true }).waitFor();
    assert.equal(await fs.readFile(path.join(repo, 'file.txt'), 'utf8'), 'stash this\n');
    assert.deepEqual(errors, []);
    console.log('PASS: publish/upstream push, hunk and line staging, amend, undo, stash save/pop/apply/drop.');
  } catch (error) {
    console.log('Renderer errors:', errors);
    for (const [index, window] of app.context.pages().entries()) {
      console.log('Window', index, (await window.locator('body').innerText()).slice(-4500));
      await window.screenshot({ path: path.resolve(`test-results/daily-failure-${index}.png`) });
    }
    throw error;
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
