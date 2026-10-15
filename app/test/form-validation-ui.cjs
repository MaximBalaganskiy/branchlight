const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/validation-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Validation Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Initial commit']);
  for (const name of ['short.txt', 'a-long-file-name-that-must-not-push-the-action-column-outside-the-container.txt', 'other.txt']) {
    await fs.writeFile(path.join(repo, name), 'Synthetic fixture.\n');
  }
  const app = await launchTauri(repo, path.join(root, 'profile'));
  const page = app.page;
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.getByRole('button', { name: 'Add remote', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('ui-input:not(ui-form ui-input)').count(), 0);
    assert.equal(await dialog.locator('ui-form button:not(.ui-form > button)').count(), 0);
    const pushUrl = dialog.getByRole('textbox', { name: 'Push URL (optional)', exact: true });
    const helperId = await pushUrl.getAttribute('aria-describedby');
    assert.ok(helperId);
    await dialog.locator(`.ui-input__subscript #${helperId}`).filter({ hasText: 'Leave empty' }).waitFor();
    const submitBefore = await dialog.getByRole('button', { name: 'Create remote', exact: true }).boundingBox();
    await dialog.getByRole('button', { name: 'Create remote', exact: true }).click();
    const name = dialog.getByRole('textbox', { name: 'Remote name', exact: true });
    const url = dialog.getByRole('textbox', { name: 'Remote URL', exact: true });
    await dialog.getByText('Remote name is required.', { exact: true }).waitFor();
    await dialog.getByText('Remote URL is required.', { exact: true }).waitFor();
    assert.equal(await name.getAttribute('aria-invalid'), 'true');
    assert.equal(await url.getAttribute('aria-invalid'), 'true');
    assert.equal((await dialog.getByRole('button', { name: 'Create remote', exact: true }).boundingBox()).y, submitBefore.y);
    const describedBy = await name.getAttribute('aria-describedby');
    assert.ok(await dialog.locator(`#${describedBy}`).isVisible());
    assert.equal((await git(repo, ['remote'])).stdout.trim(), '');
    assert.equal(await dialog.locator('ui-alert').count(), 0, 'Field errors belong to Headless inputs.');
    await name.fill('origin');
    await url.fill('https://example.invalid/demo.git');
    await url.press('Tab');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('ui-input input')].every(input => input.getAttribute('aria-invalid') !== 'true')
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: '⑂ New branch', exact: true }).click();
    const branch = dialog.getByRole('textbox', { name: 'Branch name', exact: true });
    await branch.fill('bad name');
    await branch.press('Enter');
    await dialog.locator('.ui-input__error').filter({ hasText: 'must not contain spaces' }).waitFor();
    assert.equal((await git(repo, ['branch', '--show-current'])).stdout.trim(), 'main');
    await page.screenshot({ path: path.resolve('test-results/field-validation.png') });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const [commit] = await Promise.all([app.context.waitForEvent('page'), page.getByRole('button', { name: /Commit changes/ }).click()]);
    commit.on('pageerror', error => errors.push(error.message));
    await commit.getByRole('button', { name: 'Stage short.txt', exact: true }).waitFor();
    for (const density of ['normal', 'compact']) {
      if (density === 'compact') await commit.getByRole('button', { name: 'Toggle density', exact: true }).click();
      await commit.waitForFunction(value => document.documentElement.dataset.density === value, density);
      await commit.locator('.file-item').filter({ hasText: 'short.txt' }).click();
      const geometry = await commit.locator('.stage-file').evaluateAll(rows =>
        rows.map(row => {
          const bounds = row.getBoundingClientRect();
          const button = row.querySelector('.file-action').getBoundingClientRect();
          const icon = row.querySelector('.file-action svg').getBoundingClientRect();
          return {
            height: bounds.height,
            x: button.x,
            contained: button.right <= bounds.right,
            centered: Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2) < 1
          };
        })
      );
      assert.equal(new Set(geometry.map(row => row.height)).size, 1);
      assert.equal(new Set(geometry.map(row => row.x)).size, 1);
      assert.ok(geometry.every(row => row.contained && row.centered));
      await commit.screenshot({ path: path.resolve(`test-results/file-actions-${density}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Aurelia field validation, Headless messages/ARIA, correction and submission guards; aligned file actions at both densities.'
    );
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
