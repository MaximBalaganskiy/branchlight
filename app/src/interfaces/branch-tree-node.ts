import type { Branch } from './branch';
import type { Remote } from './remote';

export interface BranchTreeNode {
  id: string;
  name: string;
  count: number;
  expanded: boolean;
  branch?: Branch;
  remote?: Remote;
  children: BranchTreeNode[];
}
