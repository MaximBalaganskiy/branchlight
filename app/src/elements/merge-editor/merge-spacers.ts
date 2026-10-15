import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { MergeSpacer } from '../../interfaces/merge-spacer';
import { MergeSpacerWidget } from './merge-spacer-widget';

const setSpacers = StateEffect.define<DecorationSet>();

export const mergeSpacers = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    return transaction.effects.find(effect => effect.is(setSpacers))?.value ?? value.map(transaction.changes);
  },
  provide: field => EditorView.decorations.from(field)
});

export function applyMergeSpacers(view: EditorView, plan: MergeSpacer[], lineHeight: number) {
  const doc = view.state.doc;
  const decorations = plan.map(spacer => {
    const atEnd = spacer.line >= doc.lines;
    const position = atEnd ? doc.length : doc.line(spacer.line + 1).from;
    return Decoration.widget({ widget: new MergeSpacerWidget(spacer.rows * lineHeight), block: true, side: atEnd ? 1 : -1 }).range(
      position
    );
  });
  const previous = view.state.field(mergeSpacers);
  const cursor = previous.iter();
  const unchanged =
    previous.size === decorations.length &&
    decorations.every(decoration => {
      const matches = cursor.from === decoration.from && cursor.value?.eq(decoration.value);
      cursor.next();
      return matches;
    });
  if (!unchanged) {
    view.dispatch({ effects: setSpacers.of(Decoration.set(decorations, true)) });
  }
}
