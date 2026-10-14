const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/commit-window-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Commit Window Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await git(repo, ['config', 'core.autocrlf', 'false']);
  const original = Array.from({ length: 80 }, (_, index) => `original ${index}\n`).join('');
  const changed = original.replaceAll('original', 'changed');
  await fs.writeFile(path.join(repo, 'file.txt'), original);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Initial files']);
  await fs.writeFile(path.join(repo, 'file.txt'), changed);
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const errors = [];
  app.context.on('page', window => window.on('pageerror', error => errors.push(error.message)));
  await app.context.addInitScript(() => {
    window.welcomeSeen = false;
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('welcome') || node.querySelector('welcome'))) {
            window.welcomeSeen = true;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  let commit;
  async function openCommit() {
    [commit] = await Promise.all([app.context.waitForEvent('page'), app.page.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.setDefaultTimeout(15000);
    await commit.locator('.diff-line.added').first().waitFor();
    assert.equal(await commit.evaluate(() => window.welcomeSeen), false, 'Commit startup must never mount the welcome page');
  }
  try {
    await openCommit();
    assert.equal(await commit.locator('#commit-message').evaluate(element => getComputedStyle(element).resize), 'none');
    const files = commit.getByRole('separator', { name: 'Resize unstaged and staged files', exact: true });
    const message = commit.getByRole('separator', { name: 'Resize diff and commit message', exact: true });
    const beforeFiles = await commit.locator('.unstaged-section').boundingBox();
    await files.focus();
    await commit.keyboard.press('Shift+ArrowDown');
    assert.equal(Math.round((await commit.locator('.unstaged-section').boundingBox()).height - beforeFiles.height), 50);
    const beforeMessage = await commit.locator('.message-composer').boundingBox();
    const divider = await message.boundingBox();
    await commit.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await commit.mouse.down();
    await commit.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2 - 60, { steps: 8 });
    await commit.mouse.up();
    assert.equal(Math.round((await commit.locator('.message-composer').boundingBox()).height - beforeMessage.height), 60);
    await message.focus();
    await commit.keyboard.press('ArrowDown');
    const saved = {
      files: await files.getAttribute('aria-valuenow'),
      message: await message.getAttribute('aria-valuenow')
    };

    await commit.locator('.diff-line.added').first().getByRole('button').click();
    await commit.evaluate(() => {
      window.initialDiff = document.querySelector('.diff-code');
      window.loadingFlashes = 0;
      new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.textContent === 'Loading diff…') {
              window.loadingFlashes++;
            }
          }
        }
      }).observe(document.querySelector('diff-view'), { childList: true, subtree: true });
      document.querySelector('diff-view').scrollTop = 300;
    });
    await commit.keyboard.press('F5');
    await commit.waitForTimeout(9000);
    assert.equal(await commit.evaluate(() => document.hasFocus()), true, 'Exercise the focused-window refresh timer');
    assert.deepEqual(
      await commit.evaluate(() => ({
        sameNode: window.initialDiff === document.querySelector('.diff-code'),
        loadingFlashes: window.loadingFlashes,
        scroll: document.querySelector('diff-view').scrollTop,
        selected: document.querySelectorAll('.diff-line [aria-pressed="true"]').length
      })),
      { sameNode: true, loadingFlashes: 0, scroll: 300, selected: 1 }
    );
    const status = (await git(repo, ['status', '--porcelain'])).stdout;
    await fs.writeFile(path.join(repo, 'file.txt'), changed.replace('changed 0', 'external edit'));
    assert.equal((await git(repo, ['status', '--porcelain'])).stdout, status);
    await commit.locator('.diff-line.added').filter({ hasText: '+external edit' }).waitFor();
    assert.equal(await commit.evaluate(() => window.loadingFlashes), 0, 'Content updates must not hide the preview');
    await commit.screenshot({ path: path.resolve('test-results/commit-splitters.png') });
    await Promise.all([
      commit.waitForEvent('close'),
      commit.evaluate(() => {
        void window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: window.__TAURI_INTERNALS__.metadata.currentWindow.label });
      })
    ]);
    await openCommit();
    assert.equal(
      await commit.getByRole('separator', { name: 'Resize unstaged and staged files', exact: true }).getAttribute('aria-valuenow'),
      saved.files
    );
    assert.equal(
      await commit.getByRole('separator', { name: 'Resize diff and commit message', exact: true }).getAttribute('aria-valuenow'),
      saved.message
    );
    await commit.setViewportSize({ width: 900, height: 640 });
    for (const name of ['Resize unstaged and staged files', 'Resize diff and commit message']) {
      await commit.getByRole('separator', { name, exact: true }).press('End');
    }
    assert.ok(
      await commit.evaluate(() =>
        [...document.querySelectorAll('.stage-section, .diff-panel, .message-composer')].every(element => {
          const rect = element.getBoundingClientRect();
          return rect.height >= 80 && rect.bottom <= innerHeight;
        })
      ),
      'Both panes must remain usable when splitters reach the limit in a small window'
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: no welcome flash; background diff refresh preserves DOM, scroll and selection; external edits refresh; splitters drag, keyboard resize, persist and fit small windows.'
    );
  } catch (error) {
    if (commit && !commit.isClosed()) {
      await commit.screenshot({ path: path.resolve('test-results/commit-window-failure.png') });
    }
    console.log('Renderer errors:', errors);
    throw error;
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
