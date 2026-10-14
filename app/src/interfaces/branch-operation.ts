import type { Branch } from './branch';

export interface BranchOperation {
  action: 'rename' | 'delete' | 'upstream';
  branch: Branch;
}
