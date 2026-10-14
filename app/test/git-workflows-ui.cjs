const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/workflows-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Workflow Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await git(repo, ['config', 'core.autocrlf', 'false']);
  await fs.writeFile(path.join(repo, 'src', 'conflict.ts'), 'export const choice = "base";\n');
  await git(repo, ['add', '--all']);
  await git(repo, ['commit', '-m', 'Base snapshot']);
  await git(repo, ['switch', '-c', 'feature/merge']);
  await fs.writeFile(path.join(repo, 'src', 'conflict.ts'), 'export const choice = "theirs";\n');
  await git(repo, ['commit', '-am', 'Incoming change']);
  await git(repo, ['switch', 'main']);
  await fs.writeFile(path.join(repo, 'src', 'conflict.ts'), 'export const choice = "ours";\n');
  await git(repo, ['commit', '-am', 'Main change']);
  const template = path.join(root, 'template.txt');
  await fs.writeFile(template, 'Summary\n\nDetails\n');
  await git(repo, ['config', 'commit.template', template]);
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const page = app.page;
  page.setDefaultTimeout(15000);
  const errors = [];
  app.context.on('page', window => window.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  let commit;
  try {
    await page.getByRole('button', { name: 'Main change', exact: true }).waitFor();
    assert.equal(await page.locator('.history-search .ui-input__leading svg').count(), 1);
    await page.getByRole('button', { name: 'Main change', exact: true }).click({ button: 'right' });
    await page.getByRole('option', { name: 'Browse files at this commit', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main change', exact: true }).focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('option', { name: 'Browse files at this commit', exact: true }).click();
    const fileSearch = page.getByRole('textbox', { name: 'Find a file', exact: true });
    await fileSearch.fill('conflict.ts');
    await page.getByRole('tree', { name: 'Commit files', exact: true }).locator('[title="src/conflict.ts"]').click();
    await page.locator('.file-content').getByText('export const choice = "ours";', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Find in file', exact: true }).fill('choice');
    await page.getByRole('button', { name: 'Next matching line', exact: true }).click();
    assert.ok(await page.locator('.file-content [data-line="0"]').evaluate(element => element.classList.contains('bg-warning-bg')));
    await fileSearch.fill('not-present');
    await page.getByText('No matching files.', { exact: true }).waitFor();
    await fileSearch.fill('');

    await page.locator('repository-sidebar .branch-item[title="feature/merge"]').click({ button: 'right' });
    await page.getByRole('option', { name: 'Merge into current branch…', exact: true }).click();
    const merge = page.getByRole('dialog');
    [commit] = await Promise.all([
      app.context.waitForEvent('page'),
      merge.getByRole('button', { name: 'Start merge', exact: true }).click()
    ]);
    commit.setDefaultTimeout(15000);
    await commit.getByRole('button', { name: 'Resolve conflict…', exact: true }).waitFor();
    await commit.getByRole('button', { name: 'Resolve conflict…', exact: true }).click();
    const resolver = commit.getByRole('dialog');
    assert.ok((await resolver.getByRole('textbox', { name: 'Ours', exact: true }).inputValue()).includes('ours'));
    assert.ok((await resolver.getByRole('textbox', { name: 'Theirs', exact: true }).inputValue()).includes('theirs'));
    assert.ok(
      await resolver.evaluate(dialog => {
        const bounds = dialog.getBoundingClientRect();
        return [...dialog.querySelectorAll('textarea, button')].every(element => {
          const rect = element.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right && rect.right <= innerWidth;
        });
      }),
      'Conflict controls must fit inside the dialog and viewport'
    );
    await commit.screenshot({ path: path.resolve('test-results/conflict-editor.png') });
    await resolver.getByRole('button', { name: 'Save result and stage', exact: true }).click();
    await resolver.getByRole('alert').getByText('Remove conflict markers before marking the file resolved.', { exact: true }).waitFor();
    await resolver.getByRole('textbox', { name: 'Resolved content', exact: true }).fill('export const choice = "resolved";\n');
    await resolver.getByRole('button', { name: 'Save result and stage', exact: true }).click();
    await resolver.waitFor({ state: 'hidden' });
    for (const close of await commit.locator('.ui-toast-host button').all()) {
      if (await close.isVisible()) {
        await close.click();
      }
    }
    await commit.getByRole('button', { name: 'Previous messages & templates ▾', exact: true }).click();
    await commit.getByRole('option').filter({ hasText: 'Main change' }).waitFor();
    await commit
      .getByRole('listbox')
      .filter({ has: commit.getByRole('option').filter({ hasText: 'Main change' }) })
      .focus();
    await commit.keyboard.press('Home');
    await commit.keyboard.press('ArrowDown');
    await commit.keyboard.press('ArrowDown');
    await commit.keyboard.press('Enter');
    await commit.getByRole('option').filter({ hasText: 'Main change' }).waitFor({ state: 'hidden' });
    assert.equal(await commit.locator('#commit-message').inputValue(), 'Main change');
    await commit.getByRole('button', { name: 'Previous messages & templates ▾', exact: true }).click();
    await commit.getByRole('option').filter({ hasText: 'Git commit template' }).click();
    assert.equal(await commit.locator('#commit-message').inputValue(), 'Summary\n\nDetails\n');
    await commit.locator('#commit-message').fill('Resolved feature\n\nReviewed both sides.');
    await commit.getByRole('button', { name: 'Save as template', exact: true }).click();
    await commit.getByRole('textbox', { name: 'Template name', exact: true }).fill('Reviewed merge');
    await commit.getByRole('button', { name: 'Save template', exact: true }).click();
    await commit.locator('#commit-message').fill('Temporary');
    await commit.getByRole('button', { name: 'Previous messages & templates ▾', exact: true }).click();
    await commit.getByRole('option').filter({ hasText: 'Reviewed merge' }).click();
    assert.equal(await commit.locator('#commit-message').inputValue(), 'Resolved feature\n\nReviewed both sides.');
    await commit.getByRole('button', { name: 'Show file tree', exact: true }).click();
    await commit.getByRole('tree', { name: 'Staged files', exact: true }).locator('[title="src/conflict.ts"]').waitFor();
    await commit.screenshot({ path: path.resolve('test-results/commit-workflows.png') });
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    await fs.writeFile(hook, '#!/bin/sh\necho "Merge hook rejected commit" >&2\nexit 1\n');
    await commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click();
    await commit.getByText('Merge hook rejected commit', { exact: false }).waitFor();
    assert.equal(commit.isClosed(), false, 'A failed merge commit must keep its window and draft');
    assert.equal(await commit.locator('#commit-message').inputValue(), 'Resolved feature\n\nReviewed both sides.');
    await fs.access(path.join(repo, '.git', 'MERGE_HEAD'));
    await fs.unlink(hook);
    await Promise.all([commit.waitForEvent('close'), commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click()]);
    await page.getByRole('button', { name: 'Resolved feature', exact: true }).waitFor();
    assert.equal((await git(repo, ['rev-list', '--parents', '-1', 'HEAD'])).stdout.trim().split(' ').length, 3);

    await fs.writeFile(path.join(repo, 'src', 'build [1].log'), 'ignore this');
    [commit] = await Promise.all([app.context.waitForEvent('page'), page.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.setDefaultTimeout(15000);
    const changedSearch = commit.getByRole('textbox', { name: 'Find changed files', exact: true });
    await changedSearch.fill('build');
    await commit
      .getByRole('tree', { name: 'Unstaged files', exact: true })
      .locator('[title="src/build [1].log"]')
      .click({ button: 'right' });
    await commit.getByRole('option', { name: 'Add file to .gitignore', exact: true }).click();
    await commit.getByText('No matching files.', { exact: true }).waitFor();
    assert.ok((await fs.readFile(path.join(repo, '.gitignore'), 'utf8')).includes('/src/build \\[1\\].log'.replace(' ', '\\ ')));
    assert.equal(
      (await git(repo, ['--no-literal-pathspecs', 'check-ignore', '--', 'src/build [1].log'])).stdout.trim(),
      'src/build [1].log'
    );
    await changedSearch.fill('');
    await commit.getByRole('button', { name: 'Show flat file list', exact: true }).click();
    await commit.getByRole('button', { name: 'Stage .gitignore', exact: true }).click();
    await commit.locator('#commit-message').fill('Ignore build log');
    await commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click();
    await page.getByRole('button', { name: 'Ignore build log', exact: true }).waitFor();
    await commit.close();
    commit = undefined;

    await page.getByRole('button', { name: 'Worktrees', exact: true }).click();
    let worktrees = page.getByRole('dialog');
    const directory = path.join(root, 'linked');
    await worktrees.getByRole('textbox', { name: 'New branch', exact: true }).fill('feature/linked');
    await worktrees.getByRole('textbox', { name: 'Worktree folder (absolute path)', exact: true }).fill(directory);
    await worktrees.getByRole('button', { name: 'Create worktree', exact: true }).click();
    await worktrees.getByRole('button', { name: 'Remove worktree feature/linked', exact: true }).waitFor();
    await page.screenshot({ path: path.resolve('test-results/worktrees.png') });
    await worktrees
      .locator('div')
      .filter({ has: page.locator('strong', { hasText: /^feature\/linked$/ }) })
      .filter({ has: page.getByRole('button', { name: 'Open', exact: true }) })
      .last()
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await worktrees.waitFor({ state: 'hidden' });
    await page
      .locator('.branch-pill')
      .filter({ hasText: /^feature\/linked$/ })
      .waitFor();
    await page.getByRole('button', { name: 'Worktrees', exact: true }).click();
    await page
      .getByRole('dialog')
      .locator('div')
      .filter({ has: page.locator('strong', { hasText: /^main$/ }) })
      .filter({ has: page.getByRole('button', { name: 'Open', exact: true }) })
      .last()
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await page
      .locator('.branch-pill')
      .filter({ hasText: /^main$/ })
      .waitFor();
    await page.getByRole('button', { name: 'Worktrees', exact: true }).click();
    worktrees = page.getByRole('dialog');
    await worktrees.getByRole('button', { name: 'Remove worktree feature/linked', exact: true }).click();
    await worktrees.getByRole('button', { name: 'Remove worktree', exact: true }).click();
    await worktrees.getByRole('button', { name: 'Remove worktree feature/linked', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await fs.stat(directory).catch(() => null), null);
    await worktrees.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: prefix search, filename/content search, commit/branch context menus, merge conflict editor, message history/templates, tree/flat staging, ignore, and worktree create/open/remove.'
    );
  } catch (error) {
    console.log('Renderer errors:', errors);
    for (const [index, window] of app.context.pages().entries()) {
      console.log('Window', index, (await window.locator('body').innerText()).slice(-4500));
      await window.screenshot({ path: path.resolve(`test-results/workflows-failure-${index}.png`) });
    }
    throw error;
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
