import { RepositoryToolDialog } from '../repository-tool-dialog';
import type { Submodule } from '../../../interfaces/submodule';

export class SubmodulesDialog extends RepositoryToolDialog {
  modules: Submodule[] = [];
  url = '';
  path = '';
  removing = '';

  async load() {
    this.modules = await this.workspace.client.submodules();
  }

  add() {
    return this.act('submodule-add', { name: this.path, url: this.url });
  }

  async operate(action: string, module: Submodule) {
    await this.act(action, { name: module.path });
    this.removing = '';
  }

  async open(module: Submodule) {
    await this.dialog.ok();
    await this.workspace.open(`${this.workspace.repo}/${module.path}`);
  }
}
