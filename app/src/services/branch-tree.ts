import type { Branch } from '../interfaces/branch';
import type { BranchTreeNode } from '../interfaces/branch-tree-node';

export function buildBranchTree(branches: Branch[], search = '', expansion: ReadonlyMap<string, boolean> = new Map()): BranchTreeNode[] {
  const query = search.trim().toLowerCase();
  const sections: [Branch['kind'], string][] = [
    ['local', 'Local branches'],
    ['remote', 'Remotes'],
    ['tag', 'Tags']
  ];
  const roots = sections.map(
    ([kind, name]) =>
      ({
        id: `section:${kind}`,
        name,
        count: 0,
        expanded: query.length > 0 || (expansion.get(`section:${kind}`) ?? kind !== 'tag'),
        children: []
      }) as BranchTreeNode
  );
  const folders = new Map<string, BranchTreeNode>();

  for (const branch of branches) {
    if (!branch.name.toLowerCase().includes(query)) {
      continue;
    }
    let parent = roots[sections.findIndex(([kind]) => kind === branch.kind)];
    parent.count++;
    const segments = branch.name.split('/');
    let path = '';
    for (const segment of segments.slice(0, -1)) {
      path += `${segment}/`;
      const id = `folder:${branch.kind}:${path}`;
      let folder = folders.get(id);
      if (!folder) {
        folder = { id, name: segment, count: 0, expanded: query.length > 0 || (expansion.get(id) ?? true), children: [] };
        folders.set(id, folder);
        parent.children.push(folder);
      }
      folder.count++;
      parent = folder;
    }
    parent.children.push({ id: branch.fullName, name: segments.at(-1)!, count: 1, expanded: false, branch, children: [] });
  }

  const sort = (nodes: BranchTreeNode[]) => {
    nodes.sort((a, b) => Number(!!a.branch) - Number(!!b.branch) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const node of nodes) {
      sort(node.children);
    }
  };
  for (const root of roots) {
    sort(root.children);
  }
  return query ? roots.filter(root => root.count > 0) : roots;
}
