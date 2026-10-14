import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph';
const commit = (hash: string, parents: string[]) => ({ hash, parents, subject: hash, author: '', date: '', refs: [] });
test('linear history stays in one lane', () => {
  const graph = buildGraph([commit('a', ['b']), commit('b', ['c']), commit('c', [])]);
  assert.deepEqual(
    graph.map(r => r.x),
    [18, 18, 18]
  );
  assert.equal(graph[2].edges.length, 1);
});
test('merge branches diverge and reconnect without negative or missing coordinates', () => {
  const graph = buildGraph([commit('merge', ['main', 'topic']), commit('topic', ['base']), commit('main', ['base']), commit('base', [])]);
  assert.equal(graph[0].edges.length, 2);
  assert.notEqual(graph[1].x, graph[2].x);
  assert.equal(graph[3].x, 18);
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
});
