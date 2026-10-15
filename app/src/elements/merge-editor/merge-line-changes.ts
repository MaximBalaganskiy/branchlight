import { diffArrays } from 'diff';
import type { MergeLineChange } from '../../interfaces/merge-line-change';

export function mergeLineChanges(result: string[], source: string[]) {
  const diff = diffArrays(result, source, { timeout: 40, maxEditLength: 4000 });
  if (!diff) {
    return { precise: false, changes: [{ fromA: 0, toA: result.length, fromB: 0, toB: source.length }] };
  }
  const changes: MergeLineChange[] = [];
  let fromA = 0;
  let fromB = 0;
  let pending: MergeLineChange | undefined;
  for (const part of diff) {
    if (!part.added && !part.removed) {
      if (pending) {
        changes.push(pending);
        pending = undefined;
      }
      fromA += part.count;
      fromB += part.count;
    } else {
      pending ??= { fromA, toA: fromA, fromB, toB: fromB };
      if (part.removed) {
        fromA += part.count;
      } else {
        fromB += part.count;
      }
      pending.toA = fromA;
      pending.toB = fromB;
    }
  }
  if (pending) {
    changes.push(pending);
  }
  return { precise: true, changes };
}
