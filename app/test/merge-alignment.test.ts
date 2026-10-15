import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorState, type Text } from '@codemirror/state';
import { mergeAlignment } from '../src/elements/merge-editor/merge-alignment';
import type { MergeSpacer } from '../src/interfaces/merge-spacer';

function rows(doc: Text, spacers: MergeSpacer[]) {
  const result: (string | null)[] = [];
  const byLine = new Map(spacers.map(spacer => [spacer.line, spacer.rows]));
  for (let line = 0; line <= doc.lines; line++) {
    result.push(...Array<string | null>(byLine.get(line) ?? 0).fill(null));
    if (line < doc.lines) {
      result.push(doc.line(line + 1).text);
    }
  }
  return result;
}

function align(contents: string[]) {
  const docs = contents.map(doc => EditorState.create({ doc }).doc);
  const { plans, precise } = mergeAlignment(docs[0], docs.slice(1));
  assert.equal(precise, true);
  const aligned = docs.map((doc, index) => rows(doc, plans[index]));
  assert.ok(
    aligned.every(lines => lines.length === aligned[0].length),
    'Every pane must occupy the same number of rows'
  );
  docs.forEach((doc, index) => {
    assert.deepEqual(
      aligned[index].filter(line => line !== null),
      doc.toString().split('\n'),
      'Spacers must not alter code'
    );
  });
  return aligned;
}

test('aligns context on both sides of independent insertions and deletions in four panes', () => {
  const aligned = align([
    'start\nalpha\nbeta\ngamma\ntail',
    'start\nours extra\nalpha\nbeta\ngamma\ntail',
    'start\nalpha\ngamma\ntheir extra\ntail',
    'start\nalpha\nbase extra\nbeta\ngamma\ntail'
  ]);
  for (const line of ['start', 'alpha', 'gamma', 'tail']) {
    assert.ok(
      aligned.every(lines => lines.indexOf(line) === aligned[0].indexOf(line)),
      `${line} must align`
    );
  }
  assert.equal(aligned[0].indexOf('beta'), aligned[1].indexOf('beta'));
  assert.equal(aligned[0].indexOf('beta'), aligned[3].indexOf('beta'));
});

test('aligns beginning, end, empty files and final-newline differences', () => {
  const aligned = align(['anchor\n', 'prefix\nanchor\nextra\n', 'anchor', '']);
  assert.equal(aligned[0].indexOf('anchor'), aligned[1].indexOf('anchor'));
  assert.equal(aligned[0].indexOf('anchor'), aligned[2].indexOf('anchor'));
  assert.deepEqual(align(['', '', '', '']), [[''], [''], [''], ['']]);
});

test('overlapping replacements of different lengths do not shift later context', () => {
  const aligned = align([
    'head\na\nb\nc\nd\nunchanged tail\n',
    'head\nours one\nours two\nours three\nd\nunchanged tail\n',
    'head\na\ntheirs\nunchanged tail\n',
    'head\na\nb\nbase extra\nc\nd\nunchanged tail\n'
  ]);
  assert.ok(aligned.every(lines => lines.indexOf('unchanged tail') === aligned[0].indexOf('unchanged tail')));
});
