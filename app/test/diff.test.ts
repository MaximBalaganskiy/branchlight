import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../src/services/parse-diff';

test('TypeScript diffs have syntax tokens while preserving line numbers', () => {
  const lines = parseDiff('@@ -1,1 +1,1 @@\n-const value = 1;\n+const value = "new";\n', 'src/example.ts');
  assert.equal(lines[1].old, '1');
  assert.equal(lines[2].next, '1');
  assert.match(lines[2].html, /hljs-keyword/);
  assert.match(lines[2].html, /hljs-string/);
});

test('multiline comments retain highlighting across changed lines', () => {
  const lines = parseDiff('@@ -0,0 +1,3 @@\n+/* comment\n+ * second line\n+ */\n', 'example.ts');
  assert.match(lines[2].html, /hljs-comment/);
});

test('file contents are escaped and unknown extensions remain plain text', () => {
  const lines = parseDiff('@@ -0,0 +1,1 @@\n+<img src=x onerror=alert(1)>\n', 'example.unknown');
  assert.equal(lines[1].html, '&lt;img src=x onerror=alert(1)&gt;');
  assert.doesNotMatch(lines[1].html, /<img/);
});
