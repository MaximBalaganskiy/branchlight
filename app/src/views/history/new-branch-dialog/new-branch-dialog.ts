import { ValidatedForm } from '../../../services/validated-form';
import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import './new-branch-dialog.css';

export class NewBranchDialog extends ValidatedForm {
  constructor() {
    super();
    this.requireRef('name', 'Branch name');
  }

  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  name = '';
  error = '';
  reference = '';

  activate(reference?: string) {
    this.reference = reference || '';
  }

  async save() {
    if (!(await this.validateFields('name'))) {
      return;
    }
    this.error = '';
    if (await this.workspace.action('branch', { name: this.name, reference: this.reference || undefined })) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  cancel() {
    return this.dialog.cancel();
  }
}
