import { ValidatedForm } from '../../../services/validated-form';
import { resolve } from 'aurelia';
import { IDialogController, type DialogCloseResult } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { ConflictContent } from '../../../interfaces/conflict-content';
import type { MergeEditor } from '../../../elements/merge-editor/merge-editor';
import { mergeConflicts } from '../../../services/merge-conflicts';
import { MergeDrafts } from '../../../services/merge-drafts';
import type { MergeDraft } from '../../../interfaces/merge-draft';

export class ConflictDialog extends ValidatedForm {
  constructor() {
    super();
    this.requireText('destination', 'Resolved file path');
    this.requireText('submoduleCommit', 'Resolved submodule commit');
  }

  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  private drafts = resolve(MergeDrafts);
  private draftTimer?: ReturnType<typeof setTimeout>;
  private repo = '';
  pendingDraft?: MergeDraft;
  staleDraft = false;
  draft?: MergeDraft;
  draftStatus = '';
  path = '';
  destination = '';
  submoduleCommit = 'HEAD';
  confirmDelete = false;
  content: ConflictContent | null = null;
  editor: MergeEditor | null = null;
  private lineEnding = '\n';
  private discardConfirmed = false;
  confirmDiscard = false;
  hasMarkerConflicts = false;
  error = '';

  get sides() {
    return [2, 3].map(stage => ({
      label: stage === 2 ? 'Ours' : 'Theirs',
      hash: this.content?.stages?.find(item => item.stage === stage)?.hash.slice(0, 12) ?? 'deleted / absent'
    }));
  }

  async activate(path: string) {
    this.path = path;
    this.destination = path;
    this.repo = this.workspace.repo;
    try {
      this.content = await this.workspace.client.conflictContent(path);
      this.lineEnding = this.content.working.includes('\r\n') ? '\r\n' : '\n';
      this.hasMarkerConflicts = mergeConflicts(this.content.working).length > 0;
      const saved = await this.drafts.read(this.repo, path);
      if (saved && JSON.stringify(saved.content) === JSON.stringify(this.content)) {
        this.pendingDraft = saved;
      } else if (saved) {
        this.pendingDraft = saved;
        this.staleDraft = true;
        this.draftStatus = 'The conflict changed since the saved draft. The old draft was not applied.';
      }
    } catch (error) {
      this.error = String(error);
    }
  }

  async resolve(choice: string) {
    if (this.content?.kind === 'delete/rename' && choice !== 'delete' && !(await this.validateFields('destination'))) {
      return;
    }
    if (choice === 'submodule' && !(await this.validateFields('submoduleCommit'))) {
      return;
    }
    this.error = '';
    if (choice === 'edit' && (!this.editor?.ready || this.editor.remaining)) {
      this.error = 'Resolve each conflict before saving. Accept a side or edit the result and choose Mark conflict resolved.';
      return;
    }
    const result = this.editor?.value ?? '';
    const text = this.lineEnding === '\r\n' ? result.replaceAll('\n', '\r\n') : result;
    if (
      await this.workspace.action(
        'resolve',
        { paths: [this.path], choice, text, original: this.content?.working, directory: this.destination, reference: this.submoduleCommit },
        false
      )
    ) {
      clearTimeout(this.draftTimer);
      await this.clearDraft();
      await this.dialog.ok();
    } else {
      this.error = this.workspace.lastError;
    }
  }

  close() {
    return this.dialog.cancel();
  }

  canDeactivate(result: DialogCloseResult) {
    if (this.workspace.busy) {
      return false;
    }
    if (result.status !== 'ok' && this.editor?.dirty && !this.discardConfirmed) {
      this.confirmDiscard = true;
      return false;
    }
    return true;
  }

  async discard() {
    clearTimeout(this.draftTimer);
    if (!(await this.clearDraft())) {
      return;
    }
    this.discardConfirmed = true;
    return this.dialog.cancel();
  }

  restoreDraft() {
    if (this.staleDraft) {
      return;
    }
    this.draft = this.pendingDraft;
    this.pendingDraft = undefined;
    this.draftStatus = 'Draft restored';
  }

  async discardDraft() {
    if (!(await this.clearDraft())) {
      return;
    }
    this.pendingDraft = undefined;
    this.staleDraft = false;
  }

  private async clearDraft() {
    try {
      await this.drafts.write(this.repo, this.path);
      return true;
    } catch (error) {
      this.error = `Could not remove the saved draft: ${String(error)}`;
      return false;
    }
  }

  changed() {
    this.error = '';
    clearTimeout(this.draftTimer);
    if (this.editor?.ready) {
      this.draftStatus = 'Saving draft…';
      this.draftTimer = setTimeout(() => void this.saveDraft(), 300);
    }
  }

  private async saveDraft() {
    try {
      await this.drafts.write(this.repo, this.path, this.editor?.dirty ? this.editor.savedDraft : undefined);
      this.draftStatus = 'Draft saved on this device';
      return true;
    } catch (error) {
      this.draftStatus = `Could not save draft: ${String(error)}`;
      return false;
    }
  }

  async keepDraft() {
    clearTimeout(this.draftTimer);
    if (await this.saveDraft()) {
      this.discardConfirmed = true;
      await this.dialog.cancel();
    }
  }

  detaching() {
    clearTimeout(this.draftTimer);
  }
}
