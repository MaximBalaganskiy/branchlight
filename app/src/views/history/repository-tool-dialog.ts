import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../services/workspace-service';

export abstract class RepositoryToolDialog {
  readonly workspace = resolve(WorkspaceService);
  protected dialog = resolve(IDialogController);
  error = '';
  status = '';
  loading = false;

  abstract load(): Promise<void>;

  binding() {
    return this.refresh();
  }

  async refresh() {
    this.loading = true;
    this.error = '';
    try {
      await this.load();
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
    }
  }

  async act(action: string, payload: Record<string, unknown>) {
    this.error = '';
    this.status = '';
    if (await this.workspace.action(action, payload, false)) {
      await this.refresh();
      this.status = 'Completed';
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.ok();
  }

  canDeactivate() {
    return !this.workspace.busy && !this.loading;
  }
}
