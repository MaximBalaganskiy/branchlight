export class BranchTreeState {
  load(repository: string): Map<string, boolean> {
    try {
      const entries: unknown = JSON.parse(localStorage.getItem(this.key(repository)) || '[]');
      if (Array.isArray(entries)) {
        return new Map(
          entries.filter(
            entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
          )
        );
      }
    } catch {
      // Missing or unreadable preferences should not prevent browsing a repository.
    }
    return new Map();
  }

  save(repository: string, expansion: ReadonlyMap<string, boolean>) {
    try {
      localStorage.setItem(this.key(repository), JSON.stringify([...expansion]));
    } catch {
      // Keep the in-memory state usable when browser storage is unavailable.
    }
  }

  private key(repository: string) {
    const path = navigator.platform.startsWith('Win') ? repository.replaceAll('\\', '/').toLowerCase() : repository;
    return `branchlight:branch-tree:${path.replace(/\/+$/, '') || '/'}`;
  }
}
