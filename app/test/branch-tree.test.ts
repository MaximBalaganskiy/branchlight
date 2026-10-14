import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBranchTree } from '../src/services/branch-tree';
import type { Branch } from '../src/interfaces/branch';

function branch(name: string, kind: Branch['kind'] = 'local'): Branch {
  const namespace = kind === 'local' ? 'heads' : kind === 'remote' ? 'remotes' : 'tags';
  return { name, kind, fullName: `refs/${namespace}/${name}`, hash: name, tracking: '', upstream: '' };
}

test('groups nested references without mixing local, remote, or tag namespaces', () => {
  const login = branch('feat/auth/login');
  const [local, remote, tags] = buildBranchTree([
    branch('main'),
    login,
    branch('feat/search'),
    branch('origin/feat/auth/login', 'remote'),
    branch('release/v2', 'tag')
  ]);
  assert.equal(local.count, 3);
  assert.deepEqual(
    local.children.map(node => node.name),
    ['feat', 'main']
  );
  assert.equal(local.children[0].count, 2);
  assert.equal(local.children[0].children[0].children[0].branch, login);
  assert.equal(remote.children[0].name, 'origin');
  assert.equal(remote.children[0].children[0].name, 'feat');
  assert.equal(tags.children[0].name, 'release');
  assert.equal(tags.expanded, false);
});

test('search reveals matching paths without overwriting collapsed folder state', () => {
  const branches = [branch('feat/auth/login'), branch('feat/search'), branch('main')];
  const expansion = new Map([
    ['folder:local:feat/', false],
    ['section:local', false]
  ]);
  const [filtered] = buildBranchTree(branches, ' AUTH/LOGIN ', expansion);
  assert.equal(filtered.count, 1);
  assert.equal(filtered.expanded, true);
  assert.equal(filtered.children[0].expanded, true);
  assert.equal(filtered.children[0].children[0].expanded, true);
  const [restored] = buildBranchTree(branches, '', expansion);
  assert.equal(restored.expanded, false);
  assert.equal(restored.children[0].expanded, false);
  assert.deepEqual(buildBranchTree(branches, 'missing'), []);
});
