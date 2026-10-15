const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { git } = require('./support/git.cjs');

(async () => {
  assert.equal(process.platform, 'linux');
  assert.ok(['x11', 'wayland'].includes(process.env.GDK_BACKEND), 'Select the display backend explicitly.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'branchlight-desktop-'));
  const repo = path.join(root, 'demo');
  await fs.mkdir(repo);
  await fs.mkdir('test-results', { recursive: true });
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Branchlight Demo']);
  await git(repo, ['config', 'user.email', 'demo@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(repo, 'sample.ts'), 'export const message = "Hello";\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Create the demo']);
  await git(repo, ['branch', 'feature/search']);
  await fs.writeFile(path.join(repo, 'sample.ts'), 'export const message = "Hello Linux";\n');
  const driver = spawn('tauri-driver', ['--port', '4444', '--native-port', '4445'], {
    env: { ...process.env, BRANCHLIGHT_REPO: repo, BRANCHLIGHT_USER_DATA: path.join(root, 'profile') },
    stdio: ['ignore', 'inherit', 'inherit']
  });
  let session;
  let driverError;
  driver.on('error', error => {
    driverError = error;
  });
  async function request(method, route, body) {
    const response = await fetch(`http://127.0.0.1:4444${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    });
    const data = await response.json();
    if (!response.ok || data.value?.error) throw new Error(JSON.stringify(data));
    return data.value;
  }
  async function execute(script, args = []) {
    return request('POST', `/session/${session}/execute/sync`, { script, args });
  }
  async function waitFor(test, label) {
    const deadline = Date.now() + 30000;
    do {
      if (driverError) throw driverError;
      if (await test()) return;
      await delay(150);
    } while (Date.now() < deadline);
    throw new Error(`Timed out: ${label}`);
  }
  async function element(selector) {
    const result = await request('POST', `/session/${session}/element`, { using: 'css selector', value: selector });
    return result['element-6066-11e4-a52e-4f735466cecf'];
  }
  async function click(selector) {
    await request('POST', `/session/${session}/element/${await element(selector)}/click`, {});
  }
  async function type(selector, text) {
    await request('POST', `/session/${session}/element/${await element(selector)}/value`, { text });
  }
  async function screenshot(name) {
    const data = await request('GET', `/session/${session}/screenshot`);
    await fs.writeFile(`test-results/linux-${process.env.GDK_BACKEND}-${name}.png`, Buffer.from(data, 'base64'));
  }
  try {
    await waitFor(async () => {
      try {
        await request('GET', '/status');
        return true;
      } catch {
        return false;
      }
    }, 'driver');
    const created = await request('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          'tauri:options': { application: path.resolve(process.env.BRANCHLIGHT_EXE || 'src-tauri/target/release/branchlight') }
        }
      }
    });
    session = created.sessionId;
    await waitFor(() => execute('return document.querySelectorAll(".commit-row").length === 1'), 'history');
    assert.equal(await execute('return document.documentElement.dataset.density'), 'normal');
    await type('repository-sidebar input', 'feature/search');
    await waitFor(() => execute('return !!document.querySelector(arguments[0])', ['[title="feature/search"]']), 'branch search');
    await screenshot('history');
    await click('button[title="Open commit window · Ctrl+K"]');
    let commitHandle;
    await waitFor(async () => {
      const handles = await request('GET', `/session/${session}/window/handles`);
      for (const handle of handles) {
        await request('POST', `/session/${session}/window`, { handle });
        if (await execute('return !!document.querySelector(".commit-workspace")')) {
          commitHandle = handle;
          return true;
        }
      }
      return false;
    }, 'separate commit window');
    assert.ok(commitHandle);
    await click('button[aria-label="Stage sample.ts"]');
    await waitFor(() => execute('return !!document.querySelector(arguments[0])', ['button[aria-label="Unstage sample.ts"]']), 'staging');
    await type('#commit-message', 'Validate Linux desktop');
    await screenshot('commit');
    // Real WebDriver keyboard events exercise the Ctrl+Enter commit shortcut.
    await request('POST', `/session/${session}/actions`, {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: '\uE009' },
            { type: 'keyDown', value: '\uE007' },
            { type: 'keyUp', value: '\uE007' },
            { type: 'keyUp', value: '\uE009' }
          ]
        }
      ]
    });
    await waitFor(async () => (await git(repo, ['log', '-1', '--format=%s'])).stdout.trim() === 'Validate Linux desktop', 'commit');
    assert.equal((await git(repo, ['status', '--porcelain'])).stdout.trim(), '');
    await waitFor(
      async () => !(await request('GET', `/session/${session}/window/handles`)).includes(commitHandle),
      'successful commit closes its window'
    );
    console.log(
      `PASS: Linux ${process.env.GDK_BACKEND}: native history, branch search, separate window, staging, keyboard commit, window closure.`
    );
  } catch (error) {
    if (session) {
      await screenshot('failure').catch(() => {});
      const body = await execute('return document.body.innerText').catch(() => 'Window unavailable');
      await fs.writeFile(`test-results/linux-${process.env.GDK_BACKEND}-failure.txt`, `${error.stack}\n\n${body}`);
    }
    throw error;
  } finally {
    if (session) await request('DELETE', `/session/${session}`).catch(() => {});
    driver.kill();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
