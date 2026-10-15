import type { Text } from '@codemirror/state';
import type { MergeSpacer } from '../../interfaces/merge-spacer';
import { mergeLineChanges } from './merge-line-changes';

/** Align all panes on one row grid. Unequal replacements pair their first lines;
 * surplus lines occupy spacer rows before the next corresponding line. */
export function mergeAlignment(result: Text, sources: Text[]) {
  const lines = result.toString().split('\n');
  const comparisons = sources.map(source => mergeLineChanges(lines, source.toString().split('\n')));
  const intervals = comparisons.map(comparison => comparison.changes);
  const boundaries = new Set([0, result.lines]);
  for (const changes of intervals) {
    for (const change of changes) {
      boundaries.add(change.fromA);
      boundaries.add(change.fromA + Math.min(change.toA - change.fromA, change.toB - change.fromB));
      boundaries.add(change.toA);
    }
  }
  const plans: MergeSpacer[][] = Array.from({ length: sources.length + 1 }, () => []);
  const offsets = plans.map(() => 0);
  const cursors = intervals.map(() => 0);
  for (const line of [...boundaries].sort((a, b) => a - b)) {
    for (const after of [false, true]) {
      const positions = [
        line,
        ...intervals.map((changes, index) => {
          while (cursors[index] + 1 < changes.length && changes[cursors[index] + 1].fromA <= line) {
            cursors[index]++;
          }
          const change = changes[cursors[index]];
          if (!change || line < change.fromA) {
            return line;
          }
          if (line > change.toA || (line === change.toA && after)) {
            return line + change.toB - change.toA;
          }
          return change.fromB + Math.min(line - change.fromA, change.toB - change.fromB);
        })
      ];
      const row = Math.max(...positions.map((position, index) => position + offsets[index]));
      positions.forEach((position, index) => {
        const rows = row - position - offsets[index];
        if (rows > 0) {
          const previous = plans[index].at(-1);
          if (previous?.line === position) {
            previous.rows += rows;
          } else {
            plans[index].push({ line: position, rows });
          }
          offsets[index] += rows;
        }
      });
    }
  }
  return { plans, precise: comparisons.every(comparison => comparison.precise) };
}
