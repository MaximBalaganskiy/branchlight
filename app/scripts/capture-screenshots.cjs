const fs = require('node:fs/promises');
const path = require('node:path');
const { launchTauri } = require('../test/support/launch-tauri.cjs');
const { git } = require('../test/support/git.cjs');

(async () => {
  const parent = path.resolve('../.test-repos');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'documentation-'));
  const repo = path.join(root, 'gitaur-demo');
  const output = path.resolve('../docs/images');
  await fs.mkdir(repo);
  await fs.mkdir(output, { recursive: true });
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Gitaur Demo']);
  await git(repo, ['config', 'user.email', 'demo@example.invalid']);
  await git(repo, ['config', 'commit.gpgsign', 'false']);
  await git(repo, ['config', 'core.autocrlf', 'false']);
  await fs.writeFile(path.join(repo, 'README.md'), '# Gitaur demo\n\nA synthetic repository for screenshots.\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'Start the workspace']);
  for (const [branch, title, content] of [
    [
      'feature/search',
      'Search files without leaving the graph',
      'export function matches(path: string, query: string): boolean {\n  return path.toLowerCase().includes(query.toLowerCase());\n}\n'
    ],
    [
      'feature/merge-editor',
      'Review conflicts in a three-way editor',
      'export const panes = [\n  { name: "Ours", editable: false },\n  { name: "Result", editable: true },\n  { name: "Theirs", editable: false }\n];\n'
    ],
    [
      'feature/worktrees',
      'Switch between worktrees in the sidebar',
      'export interface Workspace {\n  name: string;\n  path: string;\n  branch: string;\n}\n'
    ]
  ]) {
    await git(repo, ['switch', '-c', branch]);
    await fs.writeFile(path.join(repo, `${branch.split('/')[1]}.ts`), content);
    await git(repo, ['add', '.']);
    await git(repo, ['commit', '-m', title]);
    await git(repo, ['switch', 'main']);
    await git(repo, ['merge', '--no-ff', branch, '-m', `Merge ${branch}`]);
  }
  await git(repo, ['tag', 'v0.4.0-preview']);
  await fs.writeFile(
    path.join(repo, 'README.md'),
    '# Gitaur demo\n\nA synthetic repository for screenshots.\n\nReview changes, then commit only what is ready.\n'
  );
  await fs.writeFile(path.join(repo, 'notes.md'), '# Next steps\n\nTry the merge editor.\n');
  const app = await launchTauri(repo, path.join(root, 'profile'));
  try {
    const page = app.page;
    page.setDefaultTimeout(15000);
    await page.locator('.commit-row').first().waitFor();
    await page.getByRole('button', { name: 'Review conflicts in a three-way editor', exact: true }).click();
    await page.locator('.diff-code .hljs-keyword').first().waitFor();
    await page.screenshot({ path: path.join(output, 'history.png'), animations: 'disabled' });
    const [commit] = await Promise.all([app.context.waitForEvent('page'), page.getByRole('button', { name: /Commit changes/ }).click()]);
    await commit.getByRole('button', { name: 'Stage README.md', exact: true }).click();
    await commit.getByRole('button', { name: 'Unstage README.md', exact: true }).waitFor();
    await commit.locator('#commit-message').fill('Clarify the getting started guide');
    await commit.getByRole('region', { name: 'Notifications' }).waitFor({ state: 'hidden', timeout: 15000 });
    await commit.screenshot({ path: path.join(output, 'commit.png'), animations: 'disabled' });
    console.log('Captured documentation screenshots from a synthetic repository.');
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
