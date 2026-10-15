import type { Text } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { Chunk } from '@codemirror/merge';

/** Translate an anchor through CodeMirror's diff, rather than matching repeated text. */
export function mapMergePosition(chunks: readonly Chunk[], position: number, reverse = false): number {
  let offset = 0;
  for (const chunk of chunks) {
    for (const change of chunk.changes) {
      const from = reverse ? chunk.fromB + change.fromB : chunk.fromA + change.fromA;
      const to = reverse ? chunk.fromB + change.toB : chunk.fromA + change.toA;
      const targetFrom = reverse ? chunk.fromA + change.fromA : chunk.fromB + change.fromB;
      const targetTo = reverse ? chunk.fromA + change.toA : chunk.fromB + change.toB;
      if (position < from) {
        return position + offset;
      }
      if (position <= to) {
        const fraction = to === from ? 0 : (position - from) / (to - from);
        return Math.round(targetFrom + fraction * (targetTo - targetFrom));
      }
      offset = targetTo - to;
    }
  }
  return position + offset;
}

export function differenceDecorations(chunks: readonly Chunk[], doc: Text, side: 'a' | 'b') {
  const decorations = [];
  for (const chunk of chunks) {
    const from = Math.min(doc.length, side === 'a' ? chunk.fromA : chunk.fromB);
    const to = Math.min(doc.length, side === 'a' ? chunk.toA : chunk.toB);
    const last = doc.lineAt(Math.max(from, to - 1)).number;
    for (let line = doc.lineAt(from).number; line <= last; line++) {
      decorations.push(Decoration.line({ class: from === to ? 'merge-empty-difference' : 'merge-difference' }).range(doc.line(line).from));
    }
    for (const change of chunk.changes) {
      const start = side === 'a' ? chunk.fromA + change.fromA : chunk.fromB + change.fromB;
      const end = side === 'a' ? chunk.fromA + change.toA : chunk.fromB + change.toB;
      if (end > start) {
        decorations.push(Decoration.mark({ class: 'merge-word-difference' }).range(start, end));
      }
    }
  }
  return decorations;
}
