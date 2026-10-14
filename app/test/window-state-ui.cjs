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
  async function launch() {
    app = await launchTauri(repo, profile);
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
    await Promise.all([page.waitForEvent('close'), windowAction(window, 'close')]);
  }
  async function shutdown() {
    await closeWindow('main', app.page);
    await app.waitForExit();
    await app.close();
    app = null;
  }
  try {
    await launch();
    const main = await windowAction('main', 'resize', ['-X', '90', '-Y', '100', '-Width', '1700', '-Height', '1150']);
    let commit = await openCommit();
    const commitBounds = await windowAction('commit', 'resize', ['-X', '180', '-Y', '140', '-Width', '1500', '-Height', '1050']);
    await closeWindow('commit', commit);
    commit = await openCommit();
    assert.deepEqual(await windowAction('commit'), commitBounds, 'New commit window labels must share the saved commit layout');
    await windowAction('commit', 'maximize');
    await closeWindow('commit', commit);
    await windowAction('main', 'maximize');
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
    await closeWindow('commit', commit);
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
    console.log(
      'PASS: separate window bounds, changed commit labels, maximized restoration, normal bounds after unmaximize, minimized reopening, missing monitor and corrupt state fallback.'
    );
  } finally {
    if (app) await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
