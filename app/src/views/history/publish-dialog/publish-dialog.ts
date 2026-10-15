import { ValidatedForm } from '../../../services/validated-form';
import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { Remote } from '../../../interfaces/remote';

export class PublishDialog extends ValidatedForm {
  constructor() {
    super();
    this.requireText('remote', 'Remote');
    this.requireRef('branch', 'Remote branch');
  }

  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  remotes: Remote[] = [];
  remote = '';
  branch = '';
  source = '';
  error = '';

  async binding() {
    this.source = this.workspace.snapshot?.branch || '';
    this.branch = this.source;
    try {
      this.remotes = await this.workspace.client.remotes();
      this.remote = this.remotes.find(remote => remote.name === 'origin')?.name || this.remotes[0]?.name || '';
    } catch (error) {
      this.error = String(error);
    }
  }

  async publish() {
    if (!(await this.validateFields('remote', 'branch'))) {
      return;
    }
    if (await this.workspace.action('publish', { name: this.remote, text: this.branch.trim(), reference: this.source }, false)) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.cancel();
  }
}
