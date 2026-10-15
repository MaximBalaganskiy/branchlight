export interface MergeConflict {
  from: number;
  to: number;
  ours: string;
  base: string | null;
  theirs: string;
}
