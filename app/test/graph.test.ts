import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/services/graph-layout';
const commit = (hash: string, parents: string[]) => ({ hash, parents, subject: hash, author: '', date: '', refs: [] });
test('linear history stays in one lane', () => {
  const graph = buildGraph([commit('a', ['b']), commit('b', ['c']), commit('c', [])]);
  assert.deepEqual(
    graph.map(r => r.x),
    [14, 14, 14]
  );
  assert.equal(graph[2].edges.length, 1);
});
test('merge branches diverge and reconnect without negative or missing coordinates', () => {
  const graph = buildGraph([commit('merge', ['main', 'topic']), commit('topic', ['base']), commit('main', ['base']), commit('base', [])]);
  assert.equal(graph[0].edges.length, 2);
  assert.notEqual(graph[1].x, graph[2].x);
  assert.equal(graph[3].x, 14);
  for (const row of graph) for (const edge of row.edges) assert.doesNotMatch(edge.d, /NaN|undefined| -/);
});
test('adding a page preserves existing graph geometry', () => {
  const commits = [commit('a', ['b', 'c']), commit('b', ['d']), commit('c', ['d']), commit('d', [])];
  const partial = buildGraph(commits.slice(0, 2));
  const full = buildGraph(commits);
  assert.deepEqual(
    partial.map(r => r.edges),
    full.slice(0, 2).map(r => r.edges)
  );
  assert.deepEqual(
    partial.map(row => row.width),
    full.slice(0, 2).map(row => row.width)
  );
});

test('a distant wide merge does not widen earlier commits and closed lanes collapse', () => {
  const graph = buildGraph([
    commit('tip', ['merge']),
    commit('merge', ['a', 'b', 'c', 'd', 'e']),
    ...['a', 'b', 'c', 'd', 'e'].map(hash => commit(hash, ['base'])),
    commit('base', ['root']),
    commit('root', [])
  ]);
  assert.equal(graph[0].width, 40);
  assert.ok(graph[1].width > 40);
  assert.equal(graph.at(-1)?.width, 40);
});
