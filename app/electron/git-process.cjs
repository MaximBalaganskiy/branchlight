const { execFile } = require('node:child_process');

function executeGit(args, directory, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.env.BRANCHLIGHT_GIT || 'git',
      args,
      {
        cwd: directory,
        env: options.env,
        maxBuffer: options.maxBuffer,
        windowsHide: true,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(new Error(error.code === 'ENOENT' ? 'Git was not found. Install Git and ensure it is on PATH.' : error.message));
          return;
        }

        resolve({ exitCode: error?.code ?? 0, stdout, stderr });
      }
    );
  });
}

module.exports = { executeGit };
