import { RepositoryToolDialog } from '../repository-tool-dialog';
import { observable } from 'aurelia';
import type { ReflogEntry } from '../../../interfaces/reflog-entry';

export class ReflogDialog extends RepositoryToolDialog {
  constructor() {
    super();
    this.requireRef('name', 'Recovery branch name');
  }

  entries: ReflogEntry[] = [];
  selected: ReflogEntry | null = null;
  name = '';

  @observable
  query = '';
  queryChanged() {
    if (!this.filtered.some(entry => entry === this.selected)) {
      this.selected = this.filtered[0] ?? null;
    }
  }

  get filtered() {
    const query = this.query.toLowerCase();
    return this.entries.filter(entry => `${entry.hash} ${entry.reference} ${entry.message}`.toLowerCase().includes(query));
  }

  async load() {
    this.entries = await this.workspace.client.reflog();
    this.selected = this.entries.find(entry => entry.hash === this.selected?.hash) ?? this.entries[0] ?? null;
  }

  async recover() {
    if (!(await this.validateFields('name'))) {
      return;
    }
    return this.act('reflog-recover', { name: this.name, reference: this.selected?.hash });
  }
}
