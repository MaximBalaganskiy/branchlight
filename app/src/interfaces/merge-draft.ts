import type { ConflictContent } from './conflict-content';
import type { MergeRegion } from './merge-region';

export interface MergeDraft {
  content: ConflictContent;
  value: string;
  regions: readonly MergeRegion[];
  savedAt: number;
}
