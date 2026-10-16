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
    await git(directory, ['branch', 'feat/auth/login']);
    await git(directory, ['tag', 'release/v1']);
  }
  await fs.writeFile(path.join(repo, 'src', 'sample.ts'), 'export const version = 2;\n');
  await fs.writeFile(path.join(repo, 'src', 'typography-gypq.ts'), 'export const typography = true;\n');
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
  let app = await launchTauri(repo, profile);
  const errors = [];
  let page = app.page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const branchRow = id =>
    page
      .getByRole('tree', { name: 'Repository references', exact: true })
      .getByRole('treeitem')
      .filter({ has: page.locator(`[data-reference-id="${id}"]`) });
  try {
    await page.locator('.commit-row').first().waitFor();
    const changesSearch = page.getByRole('textbox', { name: 'Find changed files', exact: true });
    const changes = page.locator('.file-list');
    await changes.locator('.file-item').nth(2).waitFor();
    for (const density of ['normal', 'compact']) {
      if (density === 'compact') await page.getByRole('button', { name: 'Toggle density', exact: true }).click();
      await page.waitForFunction(value => document.documentElement.dataset.density === value, density);
      for (const selected of [false, true]) {
        if (selected) await changes.locator('[title="src/typography-gypq.ts"]').click();
        const clipped = await changes.locator('.file-item > span:last-child').evaluateAll(labels =>
          labels
            .filter(label => {
              const range = document.createRange();
              range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              const bounds = label.getBoundingClientRect();
              return text.top < bounds.top - 0.5 || text.bottom > bounds.bottom + 0.5;
            })
            .map(label => label.textContent)
        );
        assert.deepEqual(clipped, [], `Filename glyphs must fit vertically at ${density} density, selected=${selected}`);
      }
      await changes.screenshot({ path: path.resolve(`test-results/changed-files-${density}.png`) });
      await changes.locator('[title="src/sample.ts"]').click();
    }
    await page.getByRole('button', { name: 'Toggle density', exact: true }).click();
    await changesSearch.fill('  TYPOGRAPHY  ');
    await page.waitForFunction(() => document.querySelectorAll('.file-list .file-item').length === 1);
    await changesSearch.press('Enter');
    await changes.locator('.file-item.selected[title="src/typography-gypq.ts"]').waitFor();
    await page.locator('.diff-line').filter({ hasText: 'export const typography = true;' }).waitFor();
    await changesSearch.fill('no-such-file');
    await changes.getByText('No matching changed files.', { exact: true }).waitFor();
    await changesSearch.press('Enter');
    assert.equal(await changes.locator('.file-item').count(), 0);
    await changesSearch.fill('src/');
    await page.waitForFunction(() => document.querySelectorAll('.file-list .file-item').length === 2);
    await page.getByRole('button', { name: 'Original snapshot', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.file-list .file-item').length === 1);
    await page.getByRole('button', { name: 'Updated snapshot', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.file-list .file-item').length === 2);
    await changesSearch.fill('');
    await changes.locator('.file-item').nth(2).waitFor();
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

    const authFolder = branchRow('folder:local:feat/auth/');
    await authFolder.focus();
    await authFolder.press('ArrowLeft');
    assert.equal(await authFolder.getAttribute('aria-expanded'), 'false');
    await branchRow('section:tag').click();
    await branchRow('section:remote').click();
    const search = page.getByRole('textbox', { name: 'Find a branch', exact: true });
    await search.fill('feat/auth/login');
    assert.equal(await authFolder.getAttribute('aria-expanded'), 'true');
    await authFolder.click();
    await search.fill('');
    assert.equal(await authFolder.getAttribute('aria-expanded'), 'false');
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
    assert.equal(await authFolder.getAttribute('aria-expanded'), 'true', 'Repositories with the same basename have independent state');
    assert.equal(await branchRow('section:tag').getAttribute('aria-expanded'), 'false');
    await branchRow('section:local').click();
    assert.equal(await page.getByRole('button', { name: 'Updated snapshot', exact: true }).count(), 0);
    await dropdown.click();
    await page.getByText(missing, { exact: true }).click();
    await page.getByRole('region', { name: 'Notifications' }).waitFor();
    assert.equal((await dropdown.getAttribute('title')).replaceAll('\\', '/'), other.replaceAll('\\', '/'));
    await dropdown.click();
    await page.getByText(repo, { exact: true }).click();
    await page.getByRole('button', { name: 'Updated snapshot', exact: true }).waitFor();
    assert.equal(await authFolder.getAttribute('aria-expanded'), 'false');
    assert.equal(await branchRow('section:tag').getAttribute('aria-expanded'), 'true');
    assert.equal(await branchRow('section:remote').getAttribute('aria-expanded'), 'false');
    await branchRow('section:remote').click();
    await dropdown.focus();
    await dropdown.press('ArrowDown');
    await page.getByRole('option').filter({ hasText: 'Open repository…' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dropdown.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByRole('button', { name: 'Updated snapshot', exact: true }).count(), 1);

    assert.equal(await page.getByRole('button', { name: 'Remotes', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Manage remotes', exact: true }).count(), 0);
    const remoteNode = page.locator('[data-reference-id="folder:remote:origin/"]');
    await remoteNode.getByRole('button', { name: 'Actions for remote origin', exact: true }).waitFor();
    await remoteNode.click({ button: 'right' });
    await page.getByRole('option', { name: 'Remove remote…', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await git(repo, ['remote'])).stdout.trim(), 'origin');
    await remoteNode.click({ button: 'right' });
    await page.getByRole('option', { name: 'Remove remote…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove origin', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await remoteNode.waitFor({ state: 'hidden' });
    assert.equal((await git(repo, ['remote'])).stdout.trim(), '');
    assert.equal((await git(repo, ['rev-parse', 'HEAD'])).stdout.trim(), beforeHead);
    assert.equal(await fs.readFile(path.join(repo, 'src', 'sample.ts'), 'utf8'), 'Working copy must not appear in commit preview.\n');
    await page.getByRole('button', { name: 'Add remote', exact: true }).focus();
    await page.keyboard.press('Enter');
    await dialog.getByRole('textbox', { name: 'Remote name', exact: true }).fill('bad name');
    await dialog.getByRole('textbox', { name: 'Remote URL', exact: true }).fill(other);
    await dialog.getByRole('button', { name: 'Create remote', exact: true }).click();
    await dialog.locator('.ui-input__error').filter({ hasText: 'must not contain spaces' }).waitFor();
    await dialog.getByRole('textbox', { name: 'Remote name', exact: true }).fill('upstream');
    await dialog.getByRole('textbox', { name: 'Remote URL', exact: true }).press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    const upstream = page.locator('[data-reference-id="folder:remote:upstream/"]');
    await upstream.waitFor();
    assert.equal((await git(repo, ['for-each-ref', '--format=%(refname)', 'refs/remotes/upstream'])).stdout.trim(), '');
    await page.getByRole('textbox', { name: 'Find a branch', exact: true }).fill('upstream');
    await upstream.waitFor();
    await page.getByRole('textbox', { name: 'Find a branch', exact: true }).fill('');
    await page.getByRole('button', { name: 'Actions for remote upstream', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Edit remote…', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox', { name: 'Remote name', exact: true }).inputValue(), 'upstream');
    await dialog.getByRole('textbox', { name: 'Push URL (optional)', exact: true }).fill(repo);
    await dialog.getByRole('button', { name: 'Save remote', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      (await git(repo, ['remote', 'get-url', '--push', 'upstream'])).stdout.trim().replaceAll('\\', '/'),
      repo.replaceAll('\\', '/')
    );
    await upstream.click({ button: 'right' });
    await page.getByRole('option', { name: 'Fetch remote', exact: true }).click();
    await page.locator('[data-reference-id="refs/remotes/upstream/main"]').waitFor();
    await page.screenshot({ path: path.resolve('test-results/remotes-tree.png') });
    await app.close();
    app = await launchTauri(repo, profile);
    page = app.page;
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.commit-row').first().waitFor();
    assert.equal(await branchRow('folder:local:feat/auth/').getAttribute('aria-expanded'), 'false');
    assert.equal(await branchRow('section:tag').getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: 'Repository menu', exact: true }).click();
    await page.getByText(other, { exact: true }).click();
    await page.waitForFunction(
      directory =>
        document.querySelector('repository-switcher button')?.getAttribute('title')?.replaceAll('\\', '/') ===
        directory.replaceAll('\\', '/'),
      other
    );
    await page.getByRole('button', { name: 'Other repository', exact: true }).waitFor();
    assert.equal(await branchRow('section:local').getAttribute('aria-expanded'), 'false');
    await page.evaluate(directory => {
      localStorage.setItem(`branchlight:branch-tree:${directory.replaceAll('\\', '/').toLowerCase()}`, '{invalid');
    }, other);
    await page.reload();
    await page.locator('.commit-row').first().waitFor();
    assert.equal(await branchRow('section:local').getAttribute('aria-expanded'), 'true', 'Unreadable preferences fall back to defaults');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: file browsing, repository switching, remote CRUD, and per-repository tree state across search, switching, restart, and invalid preferences.'
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
