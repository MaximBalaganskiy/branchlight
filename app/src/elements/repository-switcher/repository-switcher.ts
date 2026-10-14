import { resolve } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';

export class RepositorySwitcher {
  readonly workspace = resolve(WorkspaceService);
  anchor!: HTMLElement;
  open = false;

  get repositories() {
    const paths = [this.workspace.repo, ...this.workspace.recent].filter(Boolean);
    return [...new Set(paths)].map(path => ({ path, name: path.split(/[\\/]/).filter(Boolean).at(-1) || path }));
  }

  openWithKeyboard(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open = true;
    }
  }

  async switchRepository(path: string) {
    if (path !== this.workspace.repo || !path) {
      await this.workspace.open(path || undefined);
    }
  }
}
