import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, isolateHistory, redo, undo } from '@codemirror/commands';
import { Chunk } from '@codemirror/merge';
import { mergeDocument, prepareMerge, setMergeRegions } from '../src/elements/merge-editor/merge-document';
import { mapMergePosition } from '../src/elements/merge-editor/merge-differences';

test('clean result preserves automatic merges and tracks empty and diff3 conflicts', () => {
  const working =
    'automatic\n<<<<<<< ours\n||||||| base\nold\n=======\nadded\n>>>>>>> theirs\ncontext\n<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs\ntail';
  const prepared = prepareMerge(working);
  assert.equal(prepared.text, 'automatic\ncontext\nleft\ntail');
  assert.equal(prepared.regions.length, 2);
  assert.equal(prepared.regions[0].from, prepared.regions[0].to);
  assert.equal(prepared.regions[0].base, 'old\n');
  assert.equal(prepared.text.slice(prepared.regions[1].from, prepared.regions[1].to), 'left\n');
  assert.ok(prepared.regions.every(region => !region.resolved));
});

test('undo and redo restore resolution state and exact ranges after edits', () => {
  const prepared = prepareMerge('before\n<<<<<<< ours\nleft\n=======\nlong right\n>>>>>>> theirs\nafter\n');
  const document = mergeDocument(prepared.regions);
  let state = EditorState.create({ doc: prepared.text, extensions: [history(), document.field, document.history] });
  const dispatch = (transaction: Transaction) => {
    state = transaction.state;
  };
  const region = prepared.regions[0];
  dispatch(
    state.update({
      changes: { from: region.from, to: region.to, insert: region.theirs },
      effects: setMergeRegions.of([{ ...region, to: region.from + region.theirs.length, resolved: true }]),
      annotations: isolateHistory.of('full')
    })
  );
  assert.equal(state.field(document.field)[0].resolved, true);
  assert.equal(state.doc.toString(), 'before\nlong right\nafter\n');
  assert.ok(undo({ state, dispatch }));
  assert.equal(state.doc.toString(), prepared.text);
  assert.deepEqual(state.field(document.field), prepared.regions);
  assert.ok(redo({ state, dispatch }));
  assert.equal(state.field(document.field)[0].resolved, true);
  const accepted = state.field(document.field);
  dispatch(state.update({ changes: { from: 0, insert: '// comment\n' }, annotations: isolateHistory.of('full') }));
  assert.equal(state.field(document.field)[0].from, region.from + 11);
  assert.ok(undo({ state, dispatch }));
  assert.deepEqual(state.field(document.field), accepted);
  assert.ok(undo({ state, dispatch }));
  assert.deepEqual(state.field(document.field), prepared.regions);
});

test('manual confirmation with no text change has its own undo step', () => {
  const prepared = prepareMerge('<<<<<<< ours\nsame\n=======\nother\n>>>>>>> theirs\n');
  const document = mergeDocument(prepared.regions);
  let state = EditorState.create({ doc: prepared.text, extensions: [history(), document.field, document.history] });
  const dispatch = (transaction: Transaction) => {
    state = transaction.state;
  };
  dispatch(
    state.update({
      effects: setMergeRegions.of(prepared.regions.map(region => ({ ...region, resolved: true }))),
      annotations: isolateHistory.of('full')
    })
  );
  assert.equal(state.field(document.field)[0].resolved, true);
  assert.ok(undo({ state, dispatch }));
  assert.equal(state.field(document.field)[0].resolved, false);
  assert.ok(redo({ state, dispatch }));
  assert.equal(state.field(document.field)[0].resolved, true);
});

test('diff anchors follow unchanged context across unequal insertions and repeated lines', () => {
  const a = EditorState.create({ doc: 'head\nrepeat\none\nrepeat\nunique tail\nend\n' }).doc;
  const b = EditorState.create({ doc: 'head\nrepeat\ntwo\ninserted\nmore\nrepeat\nunique tail\nend\n' }).doc;
  const chunks = Chunk.build(a, b);
  const source = a.toString().indexOf('unique tail');
  const target = b.toString().indexOf('unique tail');
  assert.equal(mapMergePosition(chunks, source), target);
  assert.equal(mapMergePosition(chunks, target, true), source);
  assert.equal(mapMergePosition(chunks, a.length), b.length);
});

test('revisiting a resolved region preserves later decisions and edits at its boundary', () => {
  const prepared = prepareMerge(
    '<<<<<<< ours\none\n=======\nother one\n>>>>>>> theirs\ncontext\n<<<<<<< ours\ntwo\n=======\nother two\n>>>>>>> theirs\ntail\n'
  );
  const document = mergeDocument(prepared.regions);
  let state = EditorState.create({ doc: prepared.text, extensions: [history(), document.field, document.history] });
  const dispatch = (transaction: Transaction) => {
    state = transaction.state;
  };
  dispatch(state.update({ effects: setMergeRegions.of(prepared.regions.map(region => ({ ...region, resolved: true }))) }));
  const first = state.field(document.field)[0];
  dispatch(state.update({ changes: { from: first.to, insert: '// keep this edit\n' }, annotations: isolateHistory.of('full') }));
  const before = state.doc.toString();
  const regions = state.field(document.field);
  assert.equal(regions[0].to, first.to, 'An edit after a conflict must not become part of the conflict');
  dispatch(
    state.update({
      effects: setMergeRegions.of(regions.map(region => (region.id === 0 ? { ...region, resolved: false } : region))),
      annotations: isolateHistory.of('full')
    })
  );
  assert.equal(state.doc.toString(), before, 'Reopening keeps the edited result');
  assert.equal(state.field(document.field)[1].resolved, true, 'Later decisions stay resolved');
  const current = state.field(document.field)[0];
  dispatch(
    state.update({ changes: { from: current.from, to: current.to, insert: current.theirs }, annotations: isolateHistory.of('full') })
  );
  assert.equal(state.doc.toString(), 'other one\n// keep this edit\ncontext\ntwo\ntail\n');
  assert.ok(undo({ state, dispatch }));
  assert.equal(state.doc.toString(), before);
  assert.ok(undo({ state, dispatch }));
  assert.ok(state.field(document.field).every(region => region.resolved));
});
