import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictChoice, hasConflictMarkers, mergeConflicts } from '../src/services/merge-conflicts';

test('resolve independent conflicts without losing automatic merges or manual edits', () => {
  const text =
    'automatic\n<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> feature\nmanual\n<<<<<<< HEAD\nold\n=======\nnew\n>>>>>>> feature\ntail';
  const blocks = mergeConflicts(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].ours, 'left\n');
  assert.equal(blocks[0].theirs, 'right\n');
  const first = text.slice(0, blocks[0].from) + conflictChoice(blocks[0], 'ours') + text.slice(blocks[0].to);
  const [remaining] = mergeConflicts(first);
  const result = first.slice(0, remaining.from) + conflictChoice(remaining, 'theirs') + first.slice(remaining.to);
  assert.equal(result, 'automatic\nleft\nmanual\nnew\ntail');
});

test('diff3 and custom width markers preserve ancestor and both orderings', () => {
  const [block] = mergeConflicts('<<<<<<<<< Ours\r\nleft\r\n||||||||| Base\r\noriginal\r\n=========\r\nright\r\n>>>>>>>>> Theirs\r\n');
  assert.equal(block.base, 'original\r\n');
  assert.equal(conflictChoice(block, 'both'), 'left\r\nright\r\n');
  assert.equal(conflictChoice(block, 'both-reversed'), 'right\r\nleft\r\n');
});

test('empty sides, adjacent conflicts and missing final newline', () => {
  const text = '<<<<<<< ours\n=======\ninsert\n>>>>>>> theirs\n<<<<<<< ours\nkeep\n=======\n>>>>>>> theirs';
  const blocks = mergeConflicts(text);
  assert.equal(blocks.length, 2);
  assert.equal(conflictChoice(blocks[0], 'ours'), '');
  assert.equal(conflictChoice(blocks[1], 'theirs'), '');
  assert.equal(blocks[1].to, text.length);
});

test('incomplete or mismatched marker blocks cannot be accepted as complete conflicts', () => {
  assert.equal(hasConflictMarkers('<<<<<<< ours\nleft\n=======\nright'), true);
  assert.equal(hasConflictMarkers('||||||||| ancestor\r\n'), true);
  assert.equal(hasConflictMarkers('const comparison = a << b;\n'), false);
  assert.deepEqual(mergeConflicts('<<<<<<< ours\nleft\n=======\nright'), []);
  assert.deepEqual(mergeConflicts('<<<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs\n'), []);
  assert.deepEqual(mergeConflicts('const comparison = a << b;\n'), []);
});
