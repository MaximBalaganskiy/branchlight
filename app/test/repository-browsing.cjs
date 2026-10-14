const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/browsing-'));
  const repo = path.join(root, 'first', 'project');
  const other = path.join(root, 'second', 'project');
  for (const directory of [repo, other]) {
    await fs.mkdir(path.join(directory, 'src'), { recursive: true });
    await git(directory, ['init', '-b', 'main']);
    await git(directory, ['config', 'user.name', 'Browser Test']);
    await git(directory, ['config', 'user.email', 'test@example.invalid']);
    await git(directory, ['config', 'commit.gpgsign', 'false']);
    await git(directory, ['config', 'core.autocrlf', 'false']);
    await fs.writeFile(path.join(directory, 'src', 'sample.ts'), 'export const version = 1;\n');
    await fs.writeFile(path.join(directory, 'removed.txt'), 'Only in the old commit.\n');
    await fs.writeFile(path.join(directory, 'empty.txt'), '');
    await fs.writeFile(path.join(directory, 'binary.bin'), Buffer.from([0, 1, 2]));
    await git(directory, ['add', '--all']);
    await git(directory, ['commit', '-m', directory === repo ? 'Original snapshot' : 'Other repository']);
  }
  await fs.writeFile(path.join(repo, 'src', 'sample.ts'), 'export const version = 2;\n');
  await git(repo, ['rm', 'removed.txt']);
  await git(repo, ['add', '--all']);
  await git(repo, ['commit', '-m', 'Updated snapshot']);
  await fs.writeFile(path.join(repo, 'src', 'sample.ts'), 'Working copy must not appear in commit preview.\n');
  await git(repo, ['remote', 'add', 'origin', other]);
  await git(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const beforeHead = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();
  const profile = path.join(root, 'profile');
  const missing = path.join(root, 'missing');
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'repositories.json'), JSON.stringify([repo, other, missing]));
  const app = await launchTauri(repo, profile);
  const errors = [];
  const page = app.page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.locator('.commit-row').first().waitFor();
    await page.getByRole('tab', { name: 'Files', exact: true }).click();
    const files = page.getByRole('tree', { name: 'Commit files', exact: true });
    const source = files.getByRole('treeitem').filter({ has: page.locator('[title="src/"]') });
    await source.click();
    await source.press('Enter');
    await page.getByText('Select a file to view its contents at this commit.', { exact: true }).waitFor();
    await source.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.file-content').getByText('export const version = 2;', { exact: true }).waitFor();
    assert.ok(await page.locator('.file-content .hljs-keyword').count());
    assert.equal(await files.locator('[title="removed.txt"]').count(), 0);
    await page.screenshot({ path: path.resolve('test-results/commit-files.png') });
    await page.getByRole('button', { name: 'Original snapshot', exact: true }).click();
    await files.locator('[title="removed.txt"]').waitFor();
    assert.equal(await page.locator('.file-content').count(), 0);
    await source.click();
    await files.locator('[title="src/sample.ts"]').click();
    await page.locator('.file-content').getByText('export const version = 1;', { exact: true }).waitFor();
    await files.locator('[title="empty.txt"]').click();
    await page.getByText('Empty file.', { exact: true }).waitFor();
    await files.locator('[title="binary.bin"]').click();
    await page.getByText('Binary or non-UTF-8 file — no text preview available.', { exact: true }).waitFor();

    const dropdown = page.getByRole('button', { name: 'Repository menu', exact: true });
    assert.equal(
      await page
        .locator('.topbar')
        .getByRole('button', { name: /^Open repository/ })
        .count(),
      0
    );
    await dropdown.click();
    await page.getByRole('option').filter({ hasText: 'Open repository…' }).waitFor();
    await page.screenshot({ path: path.resolve('test-results/repository-menu.png') });
    await page.getByText(other, { exact: true }).click();
    await page.getByRole('button', { name: 'Other repository', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Updated snapshot', exact: true }).count(), 0);
    await dropdown.click();
    await page.getByText(missing, { exact: true }).click();
    await page.getByRole('region', { name: 'Notifications' }).waitFor();
    assert.equal((await dropdown.getAttribute('title')).replaceAll('\\', '/'), other.replaceAll('\\', '/'));
    await dropdown.click();
    await page.getByText(repo, { exact: true }).click();
    await page.getByRole('button', { name: 'Updated snapshot', exact: true }).waitFor();
    await dropdown.focus();
    await dropdown.press('ArrowDown');
    await page.getByRole('option').filter({ hasText: 'Open repository…' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dropdown.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByRole('button', { name: 'Updated snapshot', exact: true }).count(), 1);

    await page.getByRole('button', { name: 'Remotes', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Remove remote', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await git(repo, ['remote'])).stdout.trim(), 'origin');
    await dialog.getByRole('button', { name: 'Remove remote', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove origin', exact: true }).click();
    await dialog.getByText('Add a remote to fetch, pull, and push.', { exact: true }).waitFor();
    assert.equal((await git(repo, ['remote'])).stdout.trim(), '');
    assert.equal((await git(repo, ['rev-parse', 'HEAD'])).stdout.trim(), beforeHead);
    assert.equal(await fs.readFile(path.join(repo, 'src', 'sample.ts'), 'utf8'), 'Working copy must not appear in commit preview.\n');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: historical file tree, highlighted contents, empty/binary previews, recent repository switching, missing repository recovery, and confirmed remote removal.'
    );
  } catch (error) {
    console.log('Renderer errors:', errors);
    console.log((await page.locator('body').innerText()).slice(-5000));
    await page.screenshot({ path: path.resolve('test-results/browsing-failure.png') });
    throw error;
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
