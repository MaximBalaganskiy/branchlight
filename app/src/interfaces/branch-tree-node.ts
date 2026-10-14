import type { Branch } from './branch';

export interface BranchTreeNode {
  id: string;
  name: string;
  count: number;
  expanded: boolean;
  branch?: Branch;
  children: BranchTreeNode[];
}
