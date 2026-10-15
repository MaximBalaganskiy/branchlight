import type { MergeConflict } from './merge-conflict';

export interface MergeRegion extends MergeConflict {
  id: number;
  resolved: boolean;
}
