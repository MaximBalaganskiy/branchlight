import { resolve } from 'aurelia';
import { IDialogController, type DialogCloseResult } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { ConflictContent } from '../../../interfaces/conflict-content';
import type { MergeEditor } from '../../../elements/merge-editor/merge-editor';
import { mergeConflicts } from '../../../services/merge-conflicts';

export class ConflictDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  path = '';
  content: ConflictContent | null = null;
  editor: MergeEditor | null = null;
  private lineEnding = '\n';
  private discardConfirmed = false;
  confirmDiscard = false;
  hasMarkerConflicts = false;
  error = '';

  async activate(path: string) {
    this.path = path;
    try {
      this.content = await this.workspace.client.conflictContent(path);
      this.lineEnding = this.content.working.includes('\r\n') ? '\r\n' : '\n';
      this.hasMarkerConflicts = mergeConflicts(this.content.working).length > 0;
    } catch (error) {
      this.error = String(error);
    }
  }

  async resolve(choice: string) {
    this.error = '';
    if (choice === 'edit' && (!this.editor?.ready || this.editor.remaining)) {
      this.error = 'Resolve each conflict before saving. Accept a side or edit the result and choose Mark conflict resolved.';
      return;
    }
    const result = this.editor?.value ?? '';
    const text = this.lineEnding === '\r\n' ? result.replaceAll('\n', '\r\n') : result;
    if (await this.workspace.action('resolve', { paths: [this.path], choice, text, original: this.content?.working }, false)) {
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

  discard() {
    this.discardConfirmed = true;
    return this.dialog.cancel();
  }
}
