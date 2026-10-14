const { launchTauri } = require('./support/launch-tauri.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { git } = require('./support/git.cjs');
(async () => {
  const output = path.resolve('test-results');
  await fs.mkdir(output, { recursive: true });
  const root = path.resolve('../.test-repos');
  await fs.mkdir(root, { recursive: true });
  const repo = await fs.mkdtemp(path.join(root, 'ui-test-'));
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Branchlight Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(repo, 'README.md'), '# A clear history\n\nStart here.\n');
  await git(repo, ['add', '--', 'README.md']);
  await git(repo, ['commit', '-m', 'Start the workspace']);
  await git(repo, ['switch', '-c', 'feature/graph']);
  await fs.writeFile(path.join(repo, 'graph.ts'), 'export const lanes = 3;\n');
  await git(repo, ['add', '--', 'graph.ts']);
  await git(repo, ['commit', '-m', 'Draw branch lanes in the history view']);
  await git(repo, ['switch', 'main']);
  await fs.writeFile(path.join(repo, 'theme.css'), ':root { color-scheme: dark; }\n');
  await git(repo, ['add', '--', 'theme.css']);
  await git(repo, ['commit', '-m', 'Add the workspace theme']);
  await git(repo, ['merge', '--no-ff', 'feature/graph', '-m', 'Merge the graph workspace']);
  await fs.writeFile(path.join(repo, 'README.md'), '# A clear history\n\nStage only what matters.\n');
  await fs.writeFile(path.join(repo, 'notes.txt'), 'Keep this change for later.\n');
  const profile = await fs.mkdtemp(path.join(root, 'tauri-profile-'));
  let app;
  const errors = [];
  try {
    const started = performance.now();
    app = await launchTauri(repo, profile);
    const page = app.page;
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') console.log('Renderer:', m.text());
    });
    await page.locator('.commit-row').first().waitFor({ timeout: 30000 });
    console.log(`Launch to rendered history: ${Math.round(performance.now() - started)} ms`);
    assert.equal(await page.locator('.commit-row').count(), 4);
    assert.equal(await page.locator('.graph circle').count(), 4);
    await page.getByRole('button', { name: 'Draw branch lanes in the history view', exact: true }).click();
    await page.locator('.diff-code').getByText('+export const lanes = 3;', { exact: true }).waitFor();
    assert.ok(await page.locator('.diff-code .hljs-keyword').count());
    assert.equal(await page.locator('.ui-input').count(), 2);
    assert.equal(await page.getByRole('textbox', { name: 'Search commits' }).count(), 1);
    const sidebarWidth = (await page.locator('repository-sidebar').boundingBox()).width;
    await page.getByRole('separator', { name: 'Resize branches sidebar' }).press('ArrowRight');
    assert.ok((await page.locator('repository-sidebar').boundingBox()).width > sidebarWidth);
    await page.getByRole('button', { name: '⑂ New branch', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Branch name' }).fill('invalid branch name');
    await dialog.getByRole('button', { name: 'Create branch', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('region', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click();
    await page.getByRole('tab', { name: 'Commit details', exact: true }).click();
    await page.getByRole('tab', { name: 'Commit details', exact: true }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Command log', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: /^Changes/ }).click();
    await page.getByRole('button', { name: 'Merge the graph workspace', exact: true }).click();
    await page.locator('.diff-code').getByText('+export const lanes = 3;', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'history.png'), animations: 'disabled' });
    const [commit] = await Promise.all([app.context.waitForEvent('page'), page.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.setDefaultTimeout(10000);
    commit.on('pageerror', e => errors.push(e.message));
    await commit.getByRole('button', { name: 'Stage README.md', exact: true }).waitFor();
    const layoutBeforeToast = await commit.locator('.commit-workspace').boundingBox();
    await commit.getByRole('button', { name: 'Stage README.md', exact: true }).click();
    await commit.getByRole('button', { name: 'Unstage README.md', exact: true }).waitFor();
    await commit.getByRole('region', { name: 'Notifications' }).waitFor();
    assert.deepEqual(await commit.locator('.commit-workspace').boundingBox(), layoutBeforeToast);
    assert.equal(await commit.locator('.ui-input[data-textarea]').count(), 1);
    await commit.locator('#commit-message').fill('Refine the getting started guide');
    await commit.screenshot({ path: path.join(output, 'commit.png'), animations: 'disabled' });
    await commit.getByRole('button', { name: '✓ Commit to main', exact: true }).click();
    await commit.getByRole('status').getByText('Commit created', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refine the getting started guide', exact: true }).waitFor();
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).stdout.trim(), 'Refine the getting started guide');
    assert.equal((await git(repo, ['status', '--porcelain'])).stdout.trim(), '?? notes.txt');
    await commit.close();
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'history-light.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    await page.evaluate(async directory => {
      await window.__TAURI_INTERNALS__.invoke('open_repository', { directory });
      await window.__TAURI_INTERNALS__.invoke('open_repository', { directory });
    }, repo);
    await app.close();
    app = undefined;
    app = await launchTauri('', profile);
    await app.page.getByRole('heading', { name: 'Open a repository', exact: true }).waitFor();
    await app.page
      .locator('.recent button')
      .filter({ hasText: path.basename(repo) })
      .click();
    await app.page.getByRole('button', { name: 'Refine the getting started guide', exact: true }).waitFor();
    assert.equal(await app.page.locator('.commit-row').count(), 5);
    console.log(
      'PASS: Tauri renders real history and graph, opens a separate commit window, stages one file, commits, preserves unselected files, refreshes main window, switches theme, and reopens a recent repository after restart.'
    );
    console.log('Screenshots:', output);
  } catch (error) {
    console.log('Renderer errors:', errors);
    if (app)
      for (const [index, page] of app.context.pages().entries()) {
        console.log('Window', index, (await page.locator('body').innerText()).slice(-8000));
        await page.screenshot({ path: path.join(output, `failure-${index}.png`) });
      }
    throw error;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
