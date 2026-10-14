import type { TreeEntry } from './tree-entry';

export interface FileTreeNode {
  path: string;
  name: string;
  expanded: boolean;
  entry?: TreeEntry;
  children: FileTreeNode[];
}
