export interface TreeEntry {
  path: string;
  kind: 'blob' | 'commit' | 'tree';
  objectId: string;
  size: number | null;
}
