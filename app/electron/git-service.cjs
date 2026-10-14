const { exec } = require('dugite');
const fs = require('node:fs/promises');
const path = require('node:path');

function parseStatus(output) {
  const records = output.split('\0');
  const files = [];
  for (let i = 0; i < records.length; i++) {
    const line = records[i];
    if (!line) continue;
    const x = line[0],
      y = line[1],
      filePath = line.slice(3);
    const originalPath = x === 'R' || x === 'C' || y === 'R' || y === 'C' ? records[++i] : undefined;
    files.push({
      path: filePath,
      originalPath,
      index: x,
      worktree: y,
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' ' || x === '?',
      conflict: ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(x + y)
    });
  }
  return files;
}
function parseLog(output) {
  const fields = output.split('\0'),
    commits = [];
  for (let i = 0; i + 5 < fields.length; i += 6) {
    if (!fields[i]) continue;
    commits.push({
      hash: fields[i],
      parents: fields[i + 1].split(' ').filter(Boolean),
      author: fields[i + 2],
      date: fields[i + 3],
      subject: fields[i + 4],
      refs: fields[i + 5].split(', ').filter(Boolean)
    });
  }
  return commits;
}
function validPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value) || value.split(/[\\/]/).includes('..'))
    throw new Error('Invalid repository-relative path.');
  return value;
}
function validHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/.test(value)) throw new Error('Invalid commit identifier.');
  return value;
}
class GitService {
  constructor() {
    this.logs = [];
    this.locks = new Map();
  }
  async run(repo, args, options = {}) {
    const started = Date.now();
    const result = await exec(['--no-pager', '--literal-pathspecs', '-c', 'color.ui=false', ...args], repo, {
      maxBuffer: 32 * 1024 * 1024,
      ...options,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...options.env }
    });
    this.logs.unshift({
      command: 'git ' + args.map((a, i) => (args[i - 1] === '-m' ? '[commit message]' : a)).join(' '),
      time: new Date().toISOString(),
      duration: Date.now() - started,
      exitCode: result.exitCode,
      error: result.exitCode ? result.stderr.slice(0, 3000) : ''
    });
    this.logs.length = Math.min(this.logs.length, 100);
    if (result.exitCode !== 0 && !options.allowFailure)
      throw new Error(result.stderr.trim() || result.stdout.trim() || `Git exited with code ${result.exitCode}.`);
    return result;
  }
  async open(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Choose an absolute repository path.');
    const { stdout } = await this.run(directory, ['rev-parse', '--show-toplevel']);
    return fs.realpath(stdout.trim());
  }
  async snapshot(repo, limit = 300) {
    limit = Math.max(1, Math.min(Number(limit) || 300, 5000));
    const [status, refs, head, symbolic] = await Promise.all([
      this.run(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { env: { GIT_OPTIONAL_LOCKS: '0' } }),
      this.run(repo, [
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(upstream:track)%00%(*objectname)',
        'refs/heads',
        'refs/remotes',
        'refs/tags'
      ]),
      this.run(repo, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true }),
      this.run(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true })
    ]);
    const branches = refs.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [fullName, hash, upstream, tracking, peeled] = line.replace(/\r$/, '').split('\0');
        return {
          fullName,
          name: fullName.replace(/^refs\/(heads|remotes|tags)\//, ''),
          hash: peeled || hash,
          upstream,
          tracking,
          kind: fullName.startsWith('refs/heads/') ? 'local' : fullName.startsWith('refs/remotes/') ? 'remote' : 'tag'
        };
      });
    const hasRefs = branches.length > 0 || head.exitCode === 0;
    const history = hasRefs
      ? await this.run(repo, [
          'log',
          '--all',
          ...(head.exitCode === 0 ? ['HEAD'] : []),
          '--date-order',
          '--topo-order',
          `--max-count=${limit + 1}`,
          '-z',
          '--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D'
        ])
      : { stdout: '' };
    const commits = parseLog(history.stdout);
    const gitDir = (await this.run(repo, ['rev-parse', '--absolute-git-dir'])).stdout.trim();
    let operation = '';
    for (const [file, name] of [
      ['MERGE_HEAD', 'Merge'],
      ['CHERRY_PICK_HEAD', 'Cherry-pick'],
      ['REVERT_HEAD', 'Revert'],
      ['rebase-merge', 'Rebase'],
      ['rebase-apply', 'Rebase']
    ]) {
      if (await fs.stat(path.join(gitDir, file)).catch(() => null)) operation = name;
    }
    return {
      path: repo,
      name: path.basename(repo),
      branch: symbolic.exitCode === 0 ? symbolic.stdout.trim() : 'Detached HEAD',
      head: head.exitCode === 0 ? head.stdout.trim() : '',
      files: parseStatus(status.stdout),
      branches,
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit,
      operation
    };
  }
  async detail(repo, hash) {
    validHash(hash);
    const [message, names] = await Promise.all([
      this.run(repo, ['show', '-s', '--format=%B', hash]),
      this.run(repo, [
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-status',
        '-r',
        '-z',
        '--no-renames',
        ...((await this.parents(repo, hash)).length ? [hash + '^', hash] : [hash])
      ])
    ]);
    const fields = names.stdout.split('\0'),
      files = [];
    for (let i = 0; i + 1 < fields.length; i += 2) if (fields[i]) files.push({ status: fields[i], path: fields[i + 1] });
    return { message: message.stdout.trimEnd(), files };
  }
  async parents(repo, hash) {
    return (await this.run(repo, ['show', '-s', '--format=%P', hash])).stdout.trim().split(' ').filter(Boolean);
  }
  async diff(repo, request) {
    const file = validPath(request.path);
    if (request.hash) {
      validHash(request.hash);
      const parents = await this.parents(repo, request.hash);
      const args = parents.length ? ['diff', parents[0], request.hash] : ['show', '--format=', request.hash];
      return (await this.run(repo, [...args, '--no-ext-diff', '--no-textconv', '--no-renames', '--', file])).stdout;
    }
    if (request.untracked) {
      const full = await fs.realpath(path.join(repo, file));
      const relative = path.relative(repo, full);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File points outside the repository.');
      const stat = await fs.stat(full);
      if (!stat.isFile()) return 'This entry is not a regular file.';
      if (stat.size > 1024 * 1024) return 'This file exceeds the 1 MB preview limit.';
      const data = await fs.readFile(full);
      if (data.includes(0)) return 'Binary file — no text preview.';
      const content = data.toString('utf8');
      const lines = content.split('\n');
      if (lines.at(-1) === '') lines.pop();
      return `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => '+' + line).join('\n');
    }
    return (
      await this.run(repo, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', ...(request.staged ? ['--cached'] : []), '--', file])
    ).stdout;
  }
  async mutate(repo, action, payload = {}) {
    if (this.locks.has(repo)) throw new Error('Another Git operation is running for this repository.');
    this.locks.set(repo, true);
    try {
      if (action === 'stage' || action === 'unstage') {
        if (!Array.isArray(payload.paths) || !payload.paths.length) throw new Error('Select files first.');
        const paths = payload.paths.map(validPath);
        if (action === 'stage') await this.run(repo, ['add', '--', ...paths]);
        else {
          const head = await this.run(repo, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
          await this.run(repo, head.exitCode === 0 ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-f', '--', ...paths]);
        }
      } else if (action === 'commit') {
        if (typeof payload.message !== 'string' || !payload.message.trim()) throw new Error('Enter a commit message.');
        const staged = await this.run(repo, ['diff', '--cached', '--quiet'], { allowFailure: true });
        if (staged.exitCode === 0) throw new Error('Stage changes before committing.');
        if (staged.exitCode !== 1) throw new Error(staged.stderr || 'Could not inspect staged changes.');
        await this.run(repo, ['commit', '-m', payload.message]);
      } else if (action === 'checkout' || action === 'branch') {
        if (typeof payload.name !== 'string' || payload.name.startsWith('-')) throw new Error('Invalid branch name.');
        await this.run(repo, ['check-ref-format', '--branch', payload.name]);
        const dirty = parseStatus((await this.run(repo, ['status', '--porcelain=v1', '-z'])).stdout);
        if (dirty.length) throw new Error('Commit or stash your changes before switching branches.');
        await this.run(repo, ['switch', ...(action === 'branch' ? ['-c'] : []), payload.name]);
      } else if (action === 'fetch') await this.run(repo, ['fetch', '--all']);
      else if (action === 'pull') await this.run(repo, ['pull', '--ff-only']);
      else if (action === 'push') await this.run(repo, ['push']);
      else throw new Error('Unsupported Git operation.');
      return true;
    } finally {
      this.locks.delete(repo);
    }
  }
}
module.exports = { GitService, parseStatus, parseLog, validPath };
