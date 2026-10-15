const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/diff-copy-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Copy Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await git(repo, ['config', 'core.autocrlf', 'false']);
  const original = 'const untouched = 1;\n  const value = "old";\n\nconst tail = true;\n';
  const updated = 'const untouched = 1;\n  const value = "new";\n  ++counter;\n\t--counter;\n\nconst tail = true;\n';
  await fs.writeFile(path.join(repo, 'sample.ts'), original);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Initial code']);
  await fs.writeFile(path.join(repo, 'sample.ts'), updated);
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const errors = [];
  app.page.on('pageerror', error => errors.push(error.message));
  app.context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  async function observeCopy(page) {
    await page.evaluate(() => {
      document.addEventListener('copy', event => {
        window.copiedCode = event.clipboardData.getData('text/plain');
        window.copyHandled = event.defaultPrevented;
      });
    });
  }
  async function copy(page) {
    await page.evaluate(() => {
      window.copiedCode = null;
    });
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => window.copiedCode !== null);
    assert.equal(await page.evaluate(() => window.copyHandled), true);
    return page.evaluate(() => window.copiedCode);
  }
  try {
    const history = app.page;
    history.setDefaultTimeout(15000);
    await history.locator('.diff-line.added').first().waitFor();
    await observeCopy(history);
    await history.locator('.diff-code').click();
    await history.keyboard.press('Control+a');
    assert.equal(await copy(history), original.trimEnd());
    assert.equal(
      await history.evaluate(() =>
        document.querySelector('.diff-code').contains(window.getSelection().getRangeAt(0).commonAncestorContainer)
      ),
      true
    );

    const [commit] = await Promise.all([app.context.waitForEvent('page'), history.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.setDefaultTimeout(15000);
    await commit.locator('.diff-line.added').first().waitFor();
    await observeCopy(commit);
    await commit.locator('.diff-code').focus();
    await commit.keyboard.press('Control+a');
    const expected =
      'const untouched = 1;\n  const value = "old";\n  const value = "new";\n  ++counter;\n\t--counter;\n\nconst tail = true;';
    assert.equal(await copy(commit), expected);
    await commit
      .locator('.diff-line.added .diff-content')
      .first()
      .evaluate(element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const positions = [];
        let offset = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          positions.push({ node, start: offset, end: offset + node.textContent.length });
          offset += node.textContent.length;
        }
        const start = positions.find(position => position.end > 2);
        const end = positions.find(position => position.end >= 13);
        const range = document.createRange();
        range.setStart(start.node, 2 - start.start);
        range.setEnd(end.node, 13 - end.start);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
    assert.equal(await copy(commit), 'const value');
    const message = commit.locator('#commit-message');
    await message.fill('Keep the normal input selection');
    await message.press('Control+a');
    assert.deepEqual(await message.evaluate(element => [element.selectionStart, element.selectionEnd]), [0, 31]);
    await commit.getByRole('button', { name: 'Stage sample.ts', exact: true }).click();
    await commit.getByRole('button', { name: 'Unstage sample.ts', exact: true }).waitFor();
    await commit.locator('.diff-code').focus();
    await commit.keyboard.press('Control+a');
    assert.equal(await copy(commit), expected);
    await commit.screenshot({ path: path.resolve('test-results/diff-copy.png') });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: scoped Ctrl+A, code-only clipboard text, partial highlighted selection, operators, indentation, blank lines, staged diffs, and normal input selection.'
    );
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
