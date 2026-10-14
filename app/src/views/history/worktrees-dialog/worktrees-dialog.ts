import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Worktree } from '../../../interfaces/worktree';

export class WorktreesDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  trees: Worktree[] = [];
  name = '';
  directory = '';
  reference = 'HEAD';
  error = '';
  removing: Worktree | null = null;
  loading = false;

  binding() {
    return this.load();
  }

  async load() {
    this.loading = true;
    try {
      this.trees = await this.workspace.client.worktrees();
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
    }
  }

  isCurrent(tree: Worktree) {
    const normalize = (value: string) => {
      const path = value.replaceAll('\\', '/');
      return navigator.platform.startsWith('Win') ? path.toLowerCase() : path;
    };
    return normalize(tree.path) === normalize(this.workspace.repo);
  }

  async create() {
    this.error = '';
    if (
      await this.workspace.action('worktree-add', {
        name: this.name.trim(),
        directory: this.directory.trim(),
        reference: this.reference.trim()
      })
    ) {
      this.name = '';
      this.directory = '';
      await this.load();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  async remove() {
    if (!this.removing) {
      return;
    }
    if (await this.workspace.action('worktree-remove', { directory: this.removing.path })) {
      this.removing = null;
      this.error = '';
      await this.load();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  async open(tree: Worktree) {
    await this.workspace.open(tree.path);
    if (!this.workspace.lastError) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.ok();
  }
}
