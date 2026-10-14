import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';

export class NewWorktreeDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  name = '';
  directory = '';
  reference = 'HEAD';
  error = '';

  async create() {
    this.error = '';
    if (
      await this.workspace.action(
        'worktree-add',
        { name: this.name.trim(), directory: this.directory.trim(), reference: this.reference.trim() },
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
