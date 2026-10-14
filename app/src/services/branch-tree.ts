import type { Branch } from '../interfaces/branch';
import type { BranchTreeNode } from '../interfaces/branch-tree-node';
import type { Remote } from '../interfaces/remote';

export function buildBranchTree(
  branches: Branch[],
  search = '',
  expansion: ReadonlyMap<string, boolean> = new Map(),
  remotes: Remote[] = []
): BranchTreeNode[] {
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
  const orderedRemotes = [...remotes].sort((a, b) => b.name.length - a.name.length);
  for (const remote of remotes) {
    const id = `folder:remote:${remote.name}/`;
    const node: BranchTreeNode = {
      id,
      name: remote.name,
      count: 0,
      expanded: query.length > 0 || (expansion.get(id) ?? true),
      remote,
      children: []
    };
    folders.set(id, node);
    roots[1].children.push(node);
  }

  for (const branch of branches) {
    if (!branch.name.toLowerCase().includes(query)) {
      continue;
    }
    let parent = roots[sections.findIndex(([kind]) => kind === branch.kind)];
    parent.count++;
    let path = '';
    const remote = branch.kind === 'remote' ? orderedRemotes.find(item => branch.name.startsWith(`${item.name}/`)) : undefined;
    if (remote) {
      path = `${remote.name}/`;
      parent = folders.get(`folder:remote:${path}`)!;
      parent.count++;
    }
    const segments = branch.name.slice(path.length).split('/');
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
  if (query) {
    roots[1].children = roots[1].children.filter(node => node.count > 0 || node.name.toLowerCase().includes(query));
  }
  roots[1].count = roots[1].children.length;
  return query ? roots.filter(root => root.children.length > 0) : roots;
}
