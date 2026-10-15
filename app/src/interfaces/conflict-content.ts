import type { ConflictStage } from './conflict-stage';

export interface ConflictContent {
  base: string;
  ours: string;
  theirs: string;
  working: string;
  editable: boolean;
  preview: string | null;
  stages?: ConflictStage[];
  kind?: string;
}
