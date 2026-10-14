import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { ConflictContent } from '../../../interfaces/conflict-content';

export class ConflictDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  path = '';
  content: ConflictContent | null = null;
  result = '';
  error = '';
  tab = 'sides';

  async activate(path: string) {
    this.path = path;
    try {
      this.content = await this.workspace.client.conflictContent(path);
      this.result = this.content.working;
    } catch (error) {
      this.error = String(error);
    }
  }

  async resolve(choice: string) {
    this.error = '';
    if (await this.workspace.action('resolve', { paths: [this.path], choice, text: this.result, original: this.content?.working }, false)) {
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.cancel();
  }
}
