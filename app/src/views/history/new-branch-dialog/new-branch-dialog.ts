import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import './new-branch-dialog.css';

export class NewBranchDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  name = '';
  error = '';

  async save() {
    this.error = '';
    if (await this.workspace.action('branch', { name: this.name })) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  cancel() {
    return this.dialog.cancel();
  }
}
