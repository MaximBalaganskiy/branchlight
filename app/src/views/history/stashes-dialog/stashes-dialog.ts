import { observable, resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Stash } from '../../../interfaces/stash';

export class StashesDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  private generation = 0;
  stashes: Stash[] = [];
  message = '';
  includeUntracked = false;
  diff = '';
  loading = false;
  error = '';
  dropping = false;

  @observable
  selectedHash = '';
  selectedHashChanged() {
    this.dropping = false;
    void this.preview();
  }

  get selected() {
    return this.stashes.find(stash => stash.hash === this.selectedHash);
  }

  binding() {
    return this.load();
  }

  unbinding() {
    ++this.generation;
  }

  async load() {
    try {
      this.stashes = await this.workspace.client.stashes();
      if (!this.selected) {
        this.selectedHash = this.stashes[0]?.hash || '';
      }
    } catch (error) {
      this.error = String(error);
    }
  }

  async preview() {
    const generation = ++this.generation;
    this.diff = '';
    this.loading = !!this.selectedHash;
    if (!this.selectedHash) {
      return;
    }
    try {
      const diff = await this.workspace.client.stashDiff(this.selectedHash);
      if (generation === this.generation) {
        this.diff = diff;
      }
    } catch (error) {
      if (generation === this.generation) {
        this.error = String(error);
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
      }
    }
  }

  async act(action: string) {
    this.error = '';
    const success = await this.workspace.action(
      action,
      {
        reference: this.selectedHash,
        message: this.message,
        include_untracked: this.includeUntracked
      },
      false
    );
    this.error = success ? '' : this.workspace.lastError;
    if (success && action === 'stash-save') {
      this.message = '';
    }
    this.dropping = false;
    await this.load();
  }

  async resolveConflicts() {
    await this.dialog.ok();
    await this.workspace.openCommit();
  }

  close() {
    return this.dialog.ok();
  }
}
