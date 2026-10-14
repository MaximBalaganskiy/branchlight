import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { GitActionPrompt } from '../../../interfaces/git-action-prompt';

export class ActionDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  model!: GitActionPrompt;
  error = '';

  activate(model: GitActionPrompt) {
    this.model = model;
  }

  async confirm() {
    if (await this.workspace.action(this.model.action, this.model.payload, false)) {
      await this.dialog.ok(true);
      if (this.model.action === 'merge' && this.workspace.snapshot?.operation === 'Merge') {
        await this.workspace.openCommit();
      }
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
