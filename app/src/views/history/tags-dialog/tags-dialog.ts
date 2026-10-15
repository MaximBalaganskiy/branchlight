import { observable } from 'aurelia';
import { RepositoryToolDialog } from '../repository-tool-dialog';
import type { Tag } from '../../../interfaces/tag';
import type { Remote } from '../../../interfaces/remote';

export class TagsDialog extends RepositoryToolDialog {
  tags: Tag[] = [];
  remotes: Remote[] = [];
  remote = '';
  name = '';
  reference = 'HEAD';
  message = '';
  deleting = false;
  deletingRemote = false;

  @observable
  query = '';
  queryChanged() {
    if (!this.filtered.some(tag => tag === this.selected)) {
      this.selected = this.filtered[0] ?? null;
    }
  }

  @observable
  selected: Tag | null = null;
  selectedChanged() {
    this.deleting = false;
    this.deletingRemote = false;
  }

  get filtered() {
    return this.tags.filter(tag => tag.name.toLowerCase().includes(this.query.toLowerCase()));
  }

  activate(reference?: string) {
    this.reference = reference || 'HEAD';
  }

  async load() {
    [this.tags, this.remotes] = await Promise.all([this.workspace.client.tags(), this.workspace.client.remotes()]);
    this.selected = this.tags.find(tag => tag.name === this.selected?.name) ?? this.tags[0] ?? null;
    this.remote = this.remotes.find(remote => remote.name === this.remote)?.name ?? this.remotes[0]?.name ?? '';
  }

  create() {
    return this.act('tag-create', { name: this.name, reference: this.reference, message: this.message });
  }

  async selectedAction(action: string) {
    await this.act(action, { name: this.selected?.name, reference: this.selected?.object, url: this.remote });
    this.deleting = false;
    this.deletingRemote = false;
  }
}
