import { observable, resolve } from 'aurelia';
import { IDialogService } from '@aurelia/dialog';
import { ConflictDialog } from './conflict-dialog/conflict-dialog';
import { ActionDialog } from '../history/action-dialog/action-dialog';
import { WorkspaceService } from '../../services/workspace-service';
import type { ChangedFile } from '../../interfaces/changed-file';
import './commit.css';

export class Commit {
  readonly workspace = resolve(WorkspaceService);
  private dialogs = resolve(IDialogService);
  private unsubscribe?: () => void;
  private diffGeneration = 0;
  workingFile: ChangedFile | null = null;
  workingStaged = false;
  diff = '';
  diffLoading = false;

  fileQuery = '';

  @observable
  message = '';
  messageChanged() {
    localStorage.setItem('draft:' + this.workspace.repo, this.message);
  }

  @observable
  treeLayout = localStorage.getItem('commit-file-layout') === 'tree';
  treeLayoutChanged() {
    localStorage.setItem('commit-file-layout', this.treeLayout ? 'tree' : 'flat');
  }

  get visibleUnstaged() {
    return this.unstaged.filter(file => file.path.toLowerCase().includes(this.fileQuery.toLowerCase()));
  }

  get visibleStaged() {
    return this.staged.filter(file => file.path.toLowerCase().includes(this.fileQuery.toLowerCase()));
  }

  ignore(file: ChangedFile) {
    return this.workspace.action('ignore', { paths: [file.path] });
  }

  resolveConflict(file: ChangedFile) {
    return this.dialogs.open({ component: ConflictDialog, model: file.path });
  }

  abortMerge() {
    return this.dialogs.open({
      component: ActionDialog,
      model: {
        title: 'Abort merge',
        description: 'Abort the current merge and discard its in-progress conflict resolutions?',
        action: 'merge-abort',
        payload: {},
        confirm: 'Abort merge',
        danger: true
      }
    });
  }
  get unstaged() {
    return this.workspace.snapshot?.files.filter(file => file.unstaged) ?? [];
  }

  get staged() {
    return this.workspace.snapshot?.files.filter(file => file.staged) ?? [];
  }

  get canStageAll() {
    return !this.workspace.busy && this.unstaged.some(file => !file.conflict);
  }

  get canCommit() {
    return (
      !this.workspace.busy &&
      !!this.message.trim() &&
      (this.staged.length > 0 || this.workspace.snapshot?.operation === 'Merge') &&
      !this.workspace.snapshot?.files.some(file => file.conflict)
    );
  }

  get summaryLength() {
    return this.message.split('\n')[0].length;
  }

  binding() {
    this.message = localStorage.getItem('draft:' + this.workspace.repo) || '';
    this.unsubscribe = this.workspace.subscribe(() => this.refresh());
    this.refresh();
  }

  attached() {
    window.addEventListener('keydown', this.onKey);
  }

  detaching() {
    window.removeEventListener('keydown', this.onKey);
  }

  unbinding() {
    this.unsubscribe?.();
    ++this.diffGeneration;
  }

  refresh() {
    const current = this.workspace.snapshot?.files.find(
      file => file.path === this.workingFile?.path && (this.workingStaged ? file.staged : file.unstaged)
    );
    if (current) {
      void this.selectWorking(current, this.workingStaged);
    } else if (this.unstaged[0]) {
      void this.selectWorking(this.unstaged[0], false);
    } else if (this.staged[0]) {
      void this.selectWorking(this.staged[0], true);
    } else {
      ++this.diffGeneration;
      this.workingFile = null;
      this.diff = '';
      this.diffLoading = false;
    }
  }

  async selectWorking(file: ChangedFile, staged: boolean) {
    const generation = ++this.diffGeneration;
    this.workingFile = file;
    this.workingStaged = staged;
    this.diffLoading = true;

    try {
      const text = await this.workspace.client.diff({ path: file.path, staged, untracked: file.index === '?' });
      if (generation === this.diffGeneration) {
        this.diff = text || 'No text changes. This may be a rename, mode change or submodule.';
      }
    } catch (error) {
      if (generation === this.diffGeneration) {
        this.workspace.fail(error);
      }
    } finally {
      if (generation === this.diffGeneration) {
        this.diffLoading = false;
      }
    }
  }

  stage(file: ChangedFile, staged: boolean) {
    return this.workspace.action(staged ? 'unstage' : 'stage', { paths: [file.path, ...(file.originalPath ? [file.originalPath] : [])] });
  }

  stageAll(staged: boolean) {
    const files = (staged ? this.staged : this.unstaged).filter(file => !file.conflict);
    const paths = [...new Set(files.flatMap(file => [file.path, ...(file.originalPath ? [file.originalPath] : [])]))];
    if (paths.length) {
      return this.workspace.action(staged ? 'unstage' : 'stage', { paths });
    }
  }

  async commit() {
    if (this.canCommit && (await this.workspace.action('commit', { message: this.message }))) {
      this.message = '';
    }
  }

  statusLabel(file: ChangedFile, staged: boolean) {
    const status = staged ? file.index : file.worktree;
    return file.conflict ? '!' : status === '?' ? 'A' : status;
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === 'Enter' && this.canCommit) {
      event.preventDefault();
      void this.commit();
    }
  };
}
