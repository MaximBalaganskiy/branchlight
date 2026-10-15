import { observable, resolve } from 'aurelia';
import { IDialogController, type DialogCloseResult } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { ConflictContent } from '../../../interfaces/conflict-content';
import type { MergeConflict } from '../../../interfaces/merge-conflict';
import type { CodeEditor } from '../../../elements/code-editor/code-editor';
import { conflictChoice, hasConflictMarkers, mergeConflicts } from '../../../services/merge-conflicts';
import './conflict-dialog.css';

export class ConflictDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  path = '';
  content: ConflictContent | null = null;
  editor!: CodeEditor;
  conflicts: MergeConflict[] = [];
  private preview: MergeConflict[] = [];
  private initial = '';
  private lineEnding = '\n';
  private discardConfirmed = false;
  active = 0;
  confirmDiscard = false;
  hasMarkerConflicts = false;
  error = '';

  @observable
  result = '';
  resultChanged() {
    this.conflicts = mergeConflicts(this.result);
    this.active = Math.min(this.active, Math.max(0, this.conflicts.length - 1));
  }

  get current() {
    return this.conflicts[this.active];
  }

  get conflictStatus() {
    if (!this.content?.editable) {
      return 'Resolve the entire file';
    }
    if (this.conflicts.length) {
      return `Conflict ${this.active + 1} of ${this.conflicts.length} remaining`;
    }
    return hasConflictMarkers(this.result)
      ? 'Unmatched conflict markers remain — edit the result'
      : 'No conflict markers remaining — review the result';
  }

  get ancestor() {
    const current = this.current;
    if (current?.base !== null && current?.base !== undefined) {
      return current.base;
    }
    const matches = this.preview.filter(block => block.ours === current?.ours && block.theirs === current?.theirs);
    return matches.length && matches.every(block => block.base === matches[0].base) ? matches[0].base : null;
  }

  get sourceOurs() {
    return this.current?.ours ?? this.normalise(this.content?.ours || '');
  }

  get sourceBase() {
    return this.ancestor ?? this.normalise(this.content?.base || '');
  }

  get sourceTheirs() {
    return this.current?.theirs ?? this.normalise(this.content?.theirs || '');
  }

  async activate(path: string) {
    this.path = path;
    try {
      this.content = await this.workspace.client.conflictContent(path);
      this.lineEnding = this.content.working.includes('\r\n') ? '\r\n' : '\n';
      this.initial = this.normalise(this.content.working);
      this.hasMarkerConflicts = mergeConflicts(this.initial).length > 0;
      this.preview = mergeConflicts(this.normalise(this.content.preview || ''));
      this.result = this.initial;
    } catch (error) {
      this.error = String(error);
    }
  }

  async resolve(choice: string) {
    this.error = '';
    const text = this.lineEnding === '\r\n' ? this.result.replaceAll('\n', '\r\n') : this.result;
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
    if (result.status !== 'ok' && this.result !== this.initial && !this.discardConfirmed) {
      this.confirmDiscard = true;
      return false;
    }
    return true;
  }

  discard() {
    this.discardConfirmed = true;
    return this.dialog.cancel();
  }

  accept(choice: 'ours' | 'theirs' | 'both' | 'both-reversed') {
    if (this.current && !this.workspace.busy) {
      this.editor.replace(this.current.from, this.current.to, conflictChoice(this.current, choice));
    }
  }

  navigate(direction: number) {
    if (!this.conflicts.length) {
      return;
    }
    this.active = (this.active + direction + this.conflicts.length) % this.conflicts.length;
    this.editor.select(this.current.from);
  }

  cursorMoved(position: number) {
    const index = this.conflicts.findIndex(block => position >= block.from && position < block.to);
    if (index >= 0) {
      this.active = index;
    }
  }

  onKey(event: KeyboardEvent) {
    if (event.key === 'F7') {
      event.preventDefault();
      event.stopPropagation();
      this.navigate(event.shiftKey ? -1 : 1);
    }
  }

  private normalise(text: string) {
    return text.replaceAll('\r\n', '\n');
  }
}
