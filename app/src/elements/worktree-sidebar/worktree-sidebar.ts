import { INode, resolve } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';
import type { Worktree } from '../../interfaces/worktree';
import type { UiMenu } from '@aurelia-ui-toolkits/headless';
import './worktree-sidebar.css';

export class WorktreeSidebar {
  readonly workspace = resolve(WorkspaceService);
  private element = resolve(INode) as HTMLElement;
  private unsubscribe?: () => void;
  private generation = 0;
  trees: Worktree[] = [];
  expanded = true;
  loading = true;
  error = '';
  menu!: UiMenu;
  contextTree: Worktree | null = null;

  binding() {
    this.unsubscribe = this.workspace.subscribe(() => void this.load());
    void this.load();
  }

  unbinding() {
    this.unsubscribe?.();
    ++this.generation;
  }

  async load() {
    const generation = ++this.generation;
    const repository = this.workspace.repo;
    this.loading = true;
    try {
      const trees = await this.workspace.client.worktrees();
      if (generation === this.generation && repository === this.workspace.repo) {
        if (JSON.stringify(trees) !== JSON.stringify(this.trees)) {
          this.trees = trees;
        }
        this.error = '';
      }
    } catch (error) {
      if (generation === this.generation && repository === this.workspace.repo) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
      }
    }
  }

  folder(tree: Worktree) {
    return tree.path.replaceAll('\\', '/').replace(/\/$/, '').split('/').at(-1) || tree.path;
  }

  isCurrent(tree: Worktree) {
    const normalize = (value: string) => {
      const path = value.replaceAll('\\', '/').replace(/\/$/, '');
      return navigator.platform.startsWith('Win') ? path.toLowerCase() : path;
    };
    return normalize(tree.path) === normalize(this.workspace.repo);
  }

  canRemove(tree: Worktree | null) {
    return !!tree && !tree.main && !tree.locked && !this.isCurrent(tree);
  }

  create() {
    this.expanded = true;
    this.element.dispatchEvent(new CustomEvent('add-worktree', { bubbles: true }));
  }

  async open(tree: Worktree) {
    if (!this.workspace.busy && !this.isCurrent(tree)) {
      await this.workspace.open(tree.path);
    }
  }

  async action(action: string) {
    const tree = this.contextTree;
    if (!tree) {
      return;
    }
    if (action === 'open') {
      await this.open(tree);
    } else if (action === 'remove' && !this.workspace.busy && this.canRemove(tree)) {
      this.element.dispatchEvent(new CustomEvent('remove-worktree', { detail: tree, bubbles: true }));
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(tree.path);
        this.workspace.inform('Worktree path copied');
      } catch (error) {
        this.workspace.fail(error);
      }
    }
  }
}
