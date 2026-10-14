const { launchTauri } = require('./support/launch-tauri.cjs');
const { git } = require('./support/git.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

(async () => {
  const root = await fs.mkdtemp(path.resolve('../.test-repos/window-state-'));
  const repo = path.join(root, 'repo');
  const profile = path.join(root, 'profile');
  const settings = path.join(profile, 'window-state.json');
  await fs.mkdir(repo);
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Window Test']);
  await git(repo, ['config', 'user.email', 'test@example.invalid']);
  await git(repo, ['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Initial commit']);
  let app;
  const errors = [];
  async function launch() {
    app = await launchTauri(repo, profile);
    app.page.on('pageerror', error => errors.push(error.message));
    app.context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    app.page.setDefaultTimeout(15000);
    await app.page.getByRole('button', { name: /Commit changes/ }).waitFor();
  }
  async function windowAction(window, action = 'inspect', geometry = []) {
    const result = await execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.resolve('test/support/native-window.ps1'),
        '-AppProcessId',
        String(app.processId),
        '-Window',
        window,
        '-Action',
        action,
        ...geometry
      ],
      { windowsHide: true }
    );
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }
  async function openCommit() {
    const [commit] = await Promise.all([
      app.context.waitForEvent('page'),
      app.page.getByRole('button', { name: /Commit changes/ }).click()
    ]);
    await commit.locator('#commit-message').waitFor();
    return commit;
  }
  async function closeWindow(window, page) {
    await Promise.all([page.waitForEvent('close'), page.getByRole('button', { name: 'Close window', exact: true }).click()]);
  }
  async function shutdown() {
    await closeWindow('main', app.page);
    await app.waitForExit();
    await app.close();
    app = null;
  }
  try {
    await launch();
    await windowAction('main', 'resize', ['-X', '90', '-Y', '100', '-Width', '1700', '-Height', '1150']);
    const beforeDrag = await windowAction('main');
    assert.ok(beforeDrag.frameTop < 10, 'The OS title bar must be absent');
    const dragRegion = app.page.locator('.topbar .spacer');
    const dragBounds = await dragRegion.boundingBox();
    const scale = await app.page.evaluate(() => devicePixelRatio);
    const afterDrag = await windowAction('main', 'gesture', [
      '-StartX',
      String(Math.round((dragBounds.x + dragBounds.width / 2) * scale)),
      '-StartY',
      String(Math.round((dragBounds.y + dragBounds.height / 2) * scale)),
      '-DeltaX',
      '70',
      '-DeltaY',
      '45'
    ]);
    assert.ok(afterDrag.x >= beforeDrag.x + 50 && afterDrag.y >= beforeDrag.y + 30, 'Dragging the header must move the native window');
    const afterResize = await windowAction('main', 'gesture', [
      '-StartX',
      String(afterDrag.width + 2),
      '-StartY',
      String(Math.round(afterDrag.height / 2)),
      '-DeltaX',
      '80',
      '-DeltaY',
      '0'
    ]);
    assert.ok(afterResize.width >= afterDrag.width + 60, 'Native edge resizing must work without decorations');
    await dragRegion.dblclick();
    await app.page.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
    assert.equal((await windowAction('main')).maximized, true);
    await app.page.getByRole('button', { name: 'Restore window', exact: true }).focus();
    await app.page.keyboard.press('Enter');
    await app.page.getByRole('button', { name: 'Maximize window', exact: true }).waitFor();
    assert.equal((await windowAction('main')).maximized, false);
    await app.page.getByRole('button', { name: 'Minimize window', exact: true }).click();
    assert.equal((await windowAction('main')).minimized, true);
    await windowAction('main', 'restore');
    const beforeMenu = await windowAction('main');
    await app.page.getByRole('button', { name: 'Repository menu', exact: true }).click();
    await app.page.getByRole('option', { name: 'Open repository…', exact: false }).waitFor();
    await app.page.keyboard.press('Escape');
    assert.deepEqual(await windowAction('main'), beforeMenu, 'Repository controls must not drag or maximize the window');
    await windowAction('main', 'snap-left');
    const snapped = await windowAction('main');
    assert.ok(snapped.x !== beforeMenu.x || snapped.width !== beforeMenu.width, 'Windows keyboard snapping must remain available');
    await app.page.screenshot({ path: path.resolve('test-results/window-controls.png') });
    const main = await windowAction('main', 'resize', ['-X', '90', '-Y', '100', '-Width', '1700', '-Height', '1150']);
    let commit = await openCommit();
    const commitBounds = await windowAction('commit', 'resize', ['-X', '180', '-Y', '140', '-Width', '1500', '-Height', '1050']);
    assert.ok(commitBounds.frameTop < 10, 'The commit window must also hide the OS title bar');
    await commit.screenshot({ path: path.resolve('test-results/commit-window-controls.png') });
    await closeWindow('commit', commit);
    commit = await openCommit();
    assert.deepEqual(await windowAction('commit'), commitBounds, 'New commit window labels must share the saved commit layout');
    await commit.getByRole('button', { name: 'Maximize window', exact: true }).click();
    await commit.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
    await closeWindow('commit', commit);
    await app.page.getByRole('button', { name: 'Maximize window', exact: true }).click();
    await app.page.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
    await shutdown();
    const saved = JSON.parse(await fs.readFile(settings, 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['commit', 'main']);
    assert.equal(saved.main.maximized, true);
    assert.equal(saved.commit.maximized, true);

    await launch();
    assert.equal((await windowAction('main')).maximized, true);
    assert.deepEqual(await windowAction('main', 'restore'), main, 'Unmaximizing must recover the normal main window bounds');
    commit = await openCommit();
    assert.equal((await windowAction('commit')).maximized, true);
    assert.deepEqual(await windowAction('commit', 'restore'), commitBounds, 'Unmaximizing must recover the normal commit window bounds');
    await windowAction('commit', 'minimize');
    await Promise.all([commit.waitForEvent('close'), windowAction('commit', 'close')]);
    await shutdown();

    await launch();
    assert.deepEqual(await windowAction('main'), main, 'Normal bounds must survive a complete restart');
    commit = await openCommit();
    assert.deepEqual(await windowAction('commit'), commitBounds, 'A minimized window must reopen visible with its normal bounds');
    await closeWindow('commit', commit);
    await shutdown();

    const offscreen = JSON.parse(await fs.readFile(settings, 'utf8'));
    offscreen.main.x = -100000;
    offscreen.main.y = -100000;
    await fs.writeFile(settings, JSON.stringify(offscreen));
    await launch();
    assert.ok(
      await app.page.evaluate(
        () =>
          window.screenX < screen.availLeft + screen.availWidth &&
          window.screenY < screen.availTop + screen.availHeight &&
          window.screenX + outerWidth > screen.availLeft &&
          window.screenY + outerHeight > screen.availTop
      ),
      'A missing monitor must not leave the window offscreen'
    );
    await shutdown();

    await fs.writeFile(settings, '{invalid json');
    await launch();
    assert.equal((await windowAction('main')).maximized, false, 'Invalid saved state must fall back to a usable default window');
    await shutdown();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: frameless main/commit controls, native dragging/resizing, double-click maximize, keyboard restore and snapping, minimize/close, separate saved bounds, maximized restoration, missing monitor and corrupt state fallback.'
    );
  } catch (error) {
    console.log('Renderer errors:', errors);
    if (app) {
      for (const [index, page] of app.context.pages().entries()) {
        console.log((await page.locator('body').innerText()).slice(-2000));
        await page.screenshot({ path: path.resolve(`test-results/window-controls-failure-${index}.png`) });
      }
    }
    throw error;
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
