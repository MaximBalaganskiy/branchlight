import type { Commit } from './commit';
import type { Branch } from './branch';
import type { ChangedFile } from './changed-file';

export interface Snapshot {
  path: string;
  name: string;
  branch: string;
  head: string;
  files: ChangedFile[];
  branches: Branch[];
  commits: Commit[];
  hasMore: boolean;
  operation: string;
}
