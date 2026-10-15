import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autosquashPlan } from '../src/services/autosquash-plan';
import type { RebaseStep } from '../src/interfaces/rebase-step';

test('autosquash groups matching commits without mutating the reviewed plan', () => {
  const plan: RebaseStep[] = ['Feature', 'Other', 'fixup! Feature', 'squash! Feature', 'fixup! missing'].map((subject, index) => ({
    hash: String(index).repeat(40),
    subject,
    action: 'pick'
  }));
  const arranged = autosquashPlan(plan);
  assert.deepEqual(
    arranged.map(step => [step.subject, step.action]),
    [
      ['Feature', 'pick'],
      ['fixup! Feature', 'fixup'],
      ['squash! Feature', 'squash'],
      ['Other', 'pick'],
      ['fixup! missing', 'pick']
    ]
  );
  assert.ok(plan.every(step => step.action === 'pick'));
});

test('autosquash leaves ambiguous subjects alone and accepts a unique hash prefix', () => {
  const plan: RebaseStep[] = [
    { hash: 'abcdef'.padEnd(40, '0'), subject: 'Same', action: 'pick' },
    { hash: '012345'.padEnd(40, '0'), subject: 'Same', action: 'pick' },
    { hash: '112345'.padEnd(40, '0'), subject: 'fixup! Same', action: 'pick' },
    { hash: '212345'.padEnd(40, '0'), subject: 'fixup! abcdef', action: 'pick' }
  ];
  assert.deepEqual(
    autosquashPlan(plan).map(step => step.action),
    ['pick', 'fixup', 'pick', 'pick']
  );
});
