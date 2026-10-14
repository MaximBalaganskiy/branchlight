import type { ChangedFile } from './changed-file';

export interface WorkingFileNode {
  path: string;
  name: string;
  expanded: boolean;
  file?: ChangedFile;
  children: WorkingFileNode[];
}
