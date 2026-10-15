import { RepositoryToolDialog } from '../repository-tool-dialog';
import type { LfsStatus } from '../../../interfaces/lfs-status';
import type { Remote } from '../../../interfaces/remote';

export class LfsDialog extends RepositoryToolDialog {
  info: LfsStatus | null = null;
  remotes: Remote[] = [];
  remote = '';
  pattern = '';

  async load() {
    [this.info, this.remotes] = await Promise.all([this.workspace.client.lfsStatus(), this.workspace.client.remotes()]);
    this.remote = this.remotes.find(remote => remote.name === this.remote)?.name ?? this.remotes[0]?.name ?? '';
  }

  track(action: string) {
    return this.act(action, { name: this.pattern });
  }

  transfer(action: string) {
    return this.act(action, { name: this.remote });
  }
}
