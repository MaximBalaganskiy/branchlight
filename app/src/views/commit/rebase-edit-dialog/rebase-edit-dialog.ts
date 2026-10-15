import { RepositoryToolDialog } from '../../history/repository-tool-dialog';

export class RebaseEditDialog extends RepositoryToolDialog {
  head = '';
  message = '';

  async load() {
    this.head = this.workspace.snapshot?.head ?? '';
    const detail = await this.workspace.client.detail(this.head);
    this.message = detail.message;
  }

  async amend() {
    if (await this.workspace.action('rebase-amend', { expected_head: this.head, message: this.message }, false)) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }
}
