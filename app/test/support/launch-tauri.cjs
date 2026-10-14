const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

async function launchTauri(repo, profile) {
  if (process.platform !== 'win32') {
    throw new Error('This desktop smoke test uses Windows WebView2. Run Rust and renderer tests on Linux.');
  }
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const executable = path.resolve(process.env.BRANCHLIGHT_EXE || 'src-tauri/target/release/branchlight.exe');
  const child = spawn(executable, [], {
    windowsHide: true,
    env: {
      ...process.env,
      BRANCHLIGHT_REPO: repo,
      BRANCHLIGHT_USER_DATA: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
    },
    stdio: 'pipe'
  });
  let spawnError;
  let diagnostics = '';
  child.once('error', error => {
    spawnError = error;
  });
  child.stderr.on('data', data => {
    diagnostics += data;
  });
  const endpoint = `http://127.0.0.1:${port}`;
  let browser;
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Tauri exited: ${child.exitCode}\n${diagnostics}`);
      const response = await fetch(`${endpoint}/json/version`).catch(() => null);
      if (response?.ok) {
        browser = await chromium.connectOverCDP(endpoint);
        break;
      }
      await delay(100);
    }
    if (!browser) throw new Error(`WebView2 debugging endpoint did not start.\n${diagnostics}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.waitForEvent('page'));
    return {
      context,
      page,
      processId: child.pid,
      async waitForExit() {
        if (child.exitCode === null && child.signalCode === null) {
          await once(child, 'exit', { signal: AbortSignal.timeout(10000) });
        }
      },
      async close() {
        await browser.close();
        if (child.exitCode === null && child.signalCode === null) {
          const closed = once(child, 'exit');
          child.kill();
          await closed;
        }
      }
    };
  } catch (error) {
    if (browser) await browser.close();
    child.kill();
    throw error;
  }
}

module.exports = { launchTauri };
