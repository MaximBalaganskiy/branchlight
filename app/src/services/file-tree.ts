import type { TreeEntry } from '../interfaces/tree-entry';
import type { FileTreeNode } from '../interfaces/file-tree-node';

export function buildFileTree(entries: TreeEntry[]): FileTreeNode[] {
  const roots: FileTreeNode[] = [];
  const folders = new Map<string, FileTreeNode>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let children = roots;
    let path = '';
    for (const name of parts.slice(0, -1)) {
      path += `${name}/`;
      let folder = folders.get(path);
      if (!folder) {
        folder = { path, name, expanded: false, children: [] };
        folders.set(path, folder);
        children.push(folder);
      }
      children = folder.children;
    }
    children.push({ path: entry.path, name: parts.at(-1)!, expanded: false, entry, children: [] });
  }
  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => Number(!!a.entry) - Number(!!b.entry) || a.name.localeCompare(b.name));
    for (const node of nodes) {
      sort(node.children);
    }
  };
  sort(roots);
  return roots;
}
