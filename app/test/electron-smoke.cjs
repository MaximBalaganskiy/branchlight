const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { GitService } = require('../electron/git-service.cjs');
(async () => {
  const output = path.resolve('test-results');
  await fs.mkdir(output, { recursive: true });
  const root = path.resolve('../.test-repos');
  await fs.mkdir(root, { recursive: true });
  const repo = await fs.mkdtemp(path.join(root, 'ui-test-'));
  const git = new GitService();
  await git.run(repo, ['init', '-b', 'main']);
  await git.run(repo, ['config', 'user.name', 'Branchlight Test']);
  await git.run(repo, ['config', 'user.email', 'test@example.invalid']);
  await git.run(repo, ['config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(repo, 'README.md'), '# A clear history\n\nStart here.\n');
  await git.mutate(repo, 'stage', { paths: ['README.md'] });
  await git.mutate(repo, 'commit', { message: 'Start the workspace' });
  await git.mutate(repo, 'branch', { name: 'feature/graph' });
  await fs.writeFile(path.join(repo, 'graph.ts'), 'export const lanes = 3;\n');
  await git.mutate(repo, 'stage', { paths: ['graph.ts'] });
  await git.mutate(repo, 'commit', { message: 'Draw branch lanes in the history view' });
  await git.mutate(repo, 'checkout', { name: 'main' });
  await fs.writeFile(path.join(repo, 'theme.css'), ':root { color-scheme: dark; }\n');
  await git.mutate(repo, 'stage', { paths: ['theme.css'] });
  await git.mutate(repo, 'commit', { message: 'Add the workspace theme' });
  await git.run(repo, ['merge', '--no-ff', 'feature/graph', '-m', 'Merge the graph workspace']);
  await fs.writeFile(path.join(repo, 'README.md'), '# A clear history\n\nStage only what matters.\n');
  await fs.writeFile(path.join(repo, 'notes.txt'), 'Keep this change for later.\n');
  const env = { ...process.env, BRANCHLIGHT_REPO: repo, BRANCHLIGHT_USER_DATA: path.join(repo, '.electron-data') };
  delete env.ELECTRON_RUN_AS_NODE;
  // Keep Electron's profile out of Git status while exercising a realistic working tree.
  await fs.writeFile(path.join(repo, '.git/info/exclude'), '.electron-data/\n');
  let app;
  const errors = [];
  try {
    const packaged = process.argv.includes('--packaged');
    const started = performance.now();
    app = await electron.launch({
      ...(packaged ? { executablePath: path.resolve('release/win-unpacked/Branchlight.exe'), args: [] } : { args: ['.'] }),
      env
    });
    const page = await app.firstWindow();
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
    const [commit] = await Promise.all([app.waitForEvent('window'), page.getByRole('button', { name: /Commit changes/ }).click()]);
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
    const state = await git.snapshot(repo);
    assert.equal(state.commits[0].subject, 'Refine the getting started guide');
    assert.deepEqual(
      state.files.map(f => f.path),
      ['notes.txt']
    );
    await commit.close();
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'history-light.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Electron renders real history and graph, opens a separate commit window, stages one file, commits, preserves unselected files, refreshes main window, and switches theme.'
    );
    console.log('Screenshots:', output);
  } catch (error) {
    console.log('Renderer errors:', errors);
    if (app)
      for (const [index, page] of app.windows().entries()) {
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
