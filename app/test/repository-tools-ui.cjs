const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/tools-'));
  const repo = path.join(root, 'repo');
  const child = path.join(root, 'child');
  const remote = path.join(root, 'remote');
  for (const directory of [repo, child]) {
    await fs.mkdir(directory);
    await git(directory, ['init', '-b', 'main']);
    for (const [key, value] of [
      ['user.name', 'Tools Test'],
      ['user.email', 'test@example.invalid'],
      ['commit.gpgsign', 'false'],
      ['tag.gpgsign', 'false'],
      ['core.autocrlf', 'false']
    ]) {
      await git(directory, ['config', key, value]);
    }
  }
  async function makeCommit(directory, file, content, message) {
    await fs.writeFile(path.join(directory, file), content);
    await git(directory, ['add', '--', file]);
    await git(directory, ['commit', '-m', message]);
    return (await git(directory, ['rev-parse', 'HEAD'])).stdout.trim();
  }
  await makeCommit(child, 'child.txt', 'child\n', 'Child');
  const base = await makeCommit(repo, 'base.txt', 'base\n', 'Base');
  await makeCommit(repo, 'one.txt', 'one\n', 'One');
  await makeCommit(repo, 'two.txt', 'two\n', 'Two');
  await git(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', child, 'module']);
  await git(repo, ['commit', '-am', 'Add module']);
  const original = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();
  const lost = await makeCommit(repo, 'lost.txt', 'lost\n', 'Lost commit');
  await git(repo, ['reset', '--hard', original]);
  await fs.mkdir(remote);
  await git(remote, ['init', '--bare']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const page = app.page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  app.context.on('page', window => window.on('pageerror', error => errors.push(error.message)));
  page.setDefaultTimeout(15000);
  const dialog = page.getByRole('dialog');
  async function tool(label) {
    await page.getByRole('button', { name: 'Repository tools', exact: true }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await dialog.waitFor();
  }
  async function close() {
    await assertContained();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  async function assertContained() {
    const escaped = await dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('button, input, textarea, ui-list')]
        .filter(control => {
          const box = control.getBoundingClientRect();
          return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1);
        })
        .map(control => control.getAttribute('aria-label') || control.textContent || control.tagName);
    });
    assert.deepEqual(escaped, [], 'Dialog controls must remain inside the modal');
  }
  try {
    await tool('Reflog recovery…');
    await dialog.getByRole('textbox', { name: 'Search reflog', exact: true }).fill('Lost commit');
    await dialog
      .getByRole('option', { name: /commit: Lost commit/ })
      .first()
      .click();
    await dialog
      .getByRole('option', { name: /commit: Lost commit/ })
      .first()
      .press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(
      await dialog
        .getByRole('option', { name: /commit: Lost commit/ })
        .nth(1)
        .getAttribute('aria-selected'),
      'true'
    );
    const recovery = dialog.getByRole('textbox', { name: 'Recovery branch name', exact: true });
    await recovery.fill('bad name');
    await recovery.press('Enter');
    await dialog.getByRole('alert').waitFor();
    await recovery.fill('recovered');
    await recovery.press('Enter');
    await dialog.getByText('Completed', { exact: true }).waitFor();
    assert.equal((await git(repo, ['rev-parse', 'recovered'])).stdout.trim(), lost);
    assert.equal((await git(repo, ['rev-parse', 'HEAD'])).stdout.trim(), original);
    await page.screenshot({ path: path.resolve('test-results/reflog-recovery.png') });
    await close();

    await tool('Tags…');
    await dialog.getByRole('textbox', { name: 'Tag name', exact: true }).fill('v-test');
    await dialog.getByRole('textbox', { name: /Annotation/ }).fill('Desktop release');
    await dialog.getByRole('button', { name: 'Create tag', exact: true }).click();
    await dialog.getByRole('button', { name: 'Push selected tag', exact: true }).click();
    await dialog.getByText('Completed', { exact: true }).waitFor();
    assert.equal((await git(remote, ['rev-parse', 'v-test^{commit}'])).stdout.trim(), original);
    await dialog.getByRole('button', { name: 'Delete remote tag…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete v-test from origin', exact: true }).click();
    await dialog.getByText('Completed', { exact: true }).waitFor();
    assert.equal((await git(remote, ['tag', '--list'])).stdout.trim(), '');
    await page.screenshot({ path: path.resolve('test-results/tags.png') });
    await dialog.getByRole('button', { name: 'Delete local tag…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete v-test', exact: true }).click();
    await dialog.getByText('No tags found.', { exact: true }).waitFor();
    await close();

    await tool('Submodules…');
    await dialog.getByText('module', { exact: true }).waitFor();
    await fs.writeFile(path.join(repo, 'module', 'child.txt'), 'dirty\n');
    await dialog.getByRole('button', { name: 'Update checkout', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await fs.readFile(path.join(repo, 'module', 'child.txt'), 'utf8'), 'dirty\n');
    await git(path.join(repo, 'module'), ['restore', '--', 'child.txt']);
    await dialog.getByRole('button', { name: 'Refresh submodules', exact: true }).click();
    await dialog.getByRole('button', { name: 'Update checkout', exact: true }).click();
    await dialog.getByText('Completed', { exact: true }).waitFor();
    await page.screenshot({ path: path.resolve('test-results/submodules.png') });
    await close();

    await tool('Git LFS…');
    await dialog.getByRole('button', { name: 'Enable LFS for this repository', exact: true }).click();
    await dialog.getByText('Completed', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'LFS file pattern', exact: true }).fill('*.asset');
    await dialog.getByRole('button', { name: 'Track pattern', exact: true }).click();
    await dialog.locator('pre').filter({ hasText: '*.asset' }).waitFor();
    await page.screenshot({ path: path.resolve('test-results/lfs.png') });
    await dialog.getByRole('button', { name: 'Untrack pattern', exact: true }).click();
    await dialog.locator('pre').filter({ hasText: '*.asset' }).waitFor({ state: 'hidden' });
    await close();
    await fs.unlink(path.join(repo, '.gitattributes'));

    await page.getByRole('button', { name: 'Base', exact: true }).first().click({ button: 'right' });
    await page.getByRole('option', { name: 'Edit rebase plan from here…', exact: true }).click();
    const one = (await git(repo, ['rev-list', '--reverse', `${base}..HEAD`])).stdout.trim().split('\n')[0].trim();
    await dialog.getByRole('button', { name: `Action for ${one.slice(0, 8)}`, exact: true }).click();
    await dialog.getByRole('option', { name: 'reword', exact: true }).click();
    const [commit] = await Promise.all([
      app.context.waitForEvent('page'),
      dialog.getByRole('button', { name: 'Apply rebase plan', exact: true }).click()
    ]);
    commit.setDefaultTimeout(15000);
    await commit.getByRole('button', { name: 'Edit paused commit…', exact: true }).click();
    const edit = commit.getByRole('dialog');
    await edit.getByRole('textbox', { name: 'Paused commit message', exact: true }).fill('Reworded in desktop\n\nFull message');
    await edit.getByRole('button', { name: 'Amend paused commit', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    await Promise.all([commit.waitForEvent('close'), commit.getByRole('button', { name: 'Continue rebase', exact: true }).click()]);
    assert.ok((await git(repo, ['log', '--format=%B'])).stdout.includes('Reworded in desktop\n\nFull message'));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: native reflog recovery, tag create/push/delete, dirty-submodule protection, LFS tracking, and paused reword/continue.'
    );
  } catch (error) {
    for (const [index, window] of app.context.pages().entries()) {
      await window.screenshot({ path: path.resolve(`test-results/repository-tools-failure-${index}.png`) }).catch(() => {});
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
