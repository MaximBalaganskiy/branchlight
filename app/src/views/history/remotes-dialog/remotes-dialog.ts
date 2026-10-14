import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Remote } from '../../../interfaces/remote';

export class RemotesDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  remotes: Remote[] = [];
  editing = false;
  loading = true;
  name = '';
  url = '';
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
    this.editing = true;
    this.name = remote.name;
    this.url = remote.url;
    this.error = '';
  }

  add() {
    this.editing = false;
    this.name = '';
    this.url = '';
    this.error = '';
  }

  async save() {
    this.error = '';
    const name = this.name.trim();
    if (await this.workspace.action(this.editing ? 'remote-edit' : 'remote-add', { name, url: this.url.trim() })) {
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

  close() {
    return this.dialog.ok();
  }
}
