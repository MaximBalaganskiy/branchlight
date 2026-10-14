import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Remote } from '../../../interfaces/remote';

export class RemotesDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  remotes: Remote[] = [];
  editing = false;
  confirmingRemoval = false;
  loading = true;
  name = '';
  url = '';
  pushUrl = '';
  prune = false;
  error = '';

  async binding() {
    try {
      this.remotes = await this.workspace.client.remotes();
      if (this.remotes[0]) {
        this.edit(this.remotes[0]);
      }
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
    }
  }

  edit(remote: Remote) {
    this.confirmingRemoval = false;
    this.editing = true;
    this.name = remote.name;
    this.url = remote.url;
    this.pushUrl = remote.pushUrl;
    this.prune = remote.prune;
    this.error = '';
  }

  add() {
    this.confirmingRemoval = false;
    this.editing = false;
    this.name = '';
    this.url = '';
    this.pushUrl = '';
    this.prune = false;
    this.error = '';
  }

  async save() {
    this.error = '';
    const name = this.name.trim();
    if (
      await this.workspace.action(
        this.editing ? 'remote-edit' : 'remote-add',
        { name, url: this.url.trim(), push_url: this.pushUrl.trim(), prune: this.prune },
        false
      )
    ) {
      this.name = name;
      this.editing = true;
      try {
        this.remotes = await this.workspace.client.remotes();
      } catch (error) {
        this.error = String(error);
      }
    } else {
      this.error = this.workspace.lastError;
    }
  }

  async remove() {
    if (!this.editing || !this.confirmingRemoval) {
      return;
    }
    this.error = '';
    if (await this.workspace.action('remote-remove', { name: this.name })) {
      this.add();
      try {
        this.remotes = await this.workspace.client.remotes();
        if (this.remotes[0]) {
          this.edit(this.remotes[0]);
        }
      } catch (error) {
        this.error = String(error);
      }
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.ok();
  }

  async fetch() {
    this.error = '';
    if (!(await this.workspace.action('remote-fetch', { name: this.name }, false))) {
      this.error = this.workspace.lastError;
    }
  }

  canDeactivate() {
    return !this.workspace.busy;
  }
}
