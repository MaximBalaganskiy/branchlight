import { StateEffect, StateField, type ChangeDesc } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import type { MergeRegion } from '../../interfaces/merge-region';
import { mergeConflicts } from '../../services/merge-conflicts';

export function prepareMerge(working: string) {
  const regions: MergeRegion[] = [];
  let text = '';
  let position = 0;
  for (const [id, conflict] of mergeConflicts(working).entries()) {
    text += working.slice(position, conflict.from);
    const from = text.length;
    text += conflict.ours;
    regions.push({ ...conflict, id, from, to: text.length, resolved: false });
    position = conflict.to;
  }
  return { text: text + working.slice(position), regions };
}

export function mapRegions(regions: readonly MergeRegion[], changes: ChangeDesc): MergeRegion[] {
  return regions.map(region => ({
    ...region,
    from: changes.mapPos(region.from, -1),
    // The end is the start of the following line. Typing there must stay outside
    // this region when an earlier resolution is revisited.
    to: changes.mapPos(region.to, region.from === region.to ? 1 : -1)
  }));
}

export const setMergeRegions = StateEffect.define<readonly MergeRegion[]>({ map: mapRegions });

export function mergeDocument(regions: readonly MergeRegion[]) {
  const field = StateField.define<readonly MergeRegion[]>({
    create: () => regions,
    update(value, transaction) {
      const effect = transaction.effects.find(effect => effect.is(setMergeRegions));
      return effect ? effect.value : mapRegions(value, transaction.changes);
    }
  });
  const history = invertedEffects.of(transaction => {
    if (transaction.docChanged || transaction.effects.some(effect => effect.is(setMergeRegions))) {
      return [setMergeRegions.of(transaction.startState.field(field))];
    }
    return [];
  });
  return { field, history };
}
