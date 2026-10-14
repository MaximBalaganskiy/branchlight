import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';

export class RepositoryDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  mode = 'clone';
  directory = '';
  url = '';
  branch = 'main';
  error = '';
  working = false;

  activate(mode: string) {
    this.mode = mode;
  }

  async browse() {
    try {
      this.directory = (await this.workspace.client.chooseDirectory()) || this.directory;
    } catch (error) {
      this.error = String(error);
    }
  }

  async create() {
    if (this.working || this.workspace.busy) {
      return;
    }
    this.working = true;
    this.workspace.busy = true;
    this.error = '';
    try {
      const directory = await this.workspace.client.createRepository({
        directory: this.directory.trim(),
        url: this.mode === 'clone' ? this.url.trim() : undefined,
        branch: this.mode === 'init' ? this.branch.trim() : undefined
      });
      this.workspace.busy = false;
      await this.workspace.open(directory);
      if (this.workspace.lastError) {
        this.error = this.workspace.lastError;
      } else {
        this.working = false;
        await this.dialog.ok();
      }
    } catch (error) {
      this.error = String(error);
    } finally {
      this.working = false;
      this.workspace.busy = false;
    }
  }

  cancel() {
    if (!this.working) {
      return this.dialog.cancel();
    }
  }

  canDeactivate() {
    return !this.working;
  }
}
