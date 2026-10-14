import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Remote } from '../../../interfaces/remote';

export class RemoteDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  editing = false;
  name = '';
  url = '';
  pushUrl = '';
  prune = false;
  error = '';

  activate(remote: Remote | null) {
    if (remote) {
      this.editing = true;
      this.name = remote.name;
      this.url = remote.url;
      this.pushUrl = remote.pushUrl;
      this.prune = remote.prune;
    }
  }

  async save() {
    this.error = '';
    if (
      await this.workspace.action(
        this.editing ? 'remote-edit' : 'remote-add',
        { name: this.name.trim(), url: this.url.trim(), push_url: this.pushUrl.trim(), prune: this.prune },
        false
      )
    ) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  cancel() {
    return this.dialog.cancel();
  }

  canDeactivate() {
    return !this.workspace.busy;
  }
}
