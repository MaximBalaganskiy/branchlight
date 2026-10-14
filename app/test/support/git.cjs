const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

async function git(repo, args) {
  return execute('git', ['--no-pager', '--literal-pathspecs', ...args], {
    cwd: repo,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  });
}

module.exports = { git };
