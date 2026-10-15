import { RepositoryToolDialog } from '../repository-tool-dialog';
import type { LfsStatus } from '../../../interfaces/lfs-status';
import type { Remote } from '../../../interfaces/remote';

export class LfsDialog extends RepositoryToolDialog {
  constructor() {
    super();
    this.requireText('pattern', 'LFS file pattern');
    this.requireText('remote', 'LFS remote');
  }

  info: LfsStatus | null = null;
  remotes: Remote[] = [];
  remote = '';
  pattern = '';

  async load() {
    [this.info, this.remotes] = await Promise.all([this.workspace.client.lfsStatus(), this.workspace.client.remotes()]);
    this.remote = this.remotes.find(remote => remote.name === this.remote)?.name ?? this.remotes[0]?.name ?? '';
  }

  async track(action: string) {
    if (!(await this.validateFields('pattern'))) {
      return;
    }
    return this.act(action, { name: this.pattern });
  }

  async transfer(action: string) {
    if (!(await this.validateFields('remote'))) {
      return;
    }
    return this.act(action, { name: this.remote });
  }
}
