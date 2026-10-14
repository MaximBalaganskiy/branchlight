import { observable, resolve } from 'aurelia';
import { IDialogService } from '@aurelia/dialog';
import { WorkspaceService } from '../../services/workspace-service';
import { buildGraph } from '../../services/graph-layout';
import { NewBranchDialog } from './new-branch-dialog/new-branch-dialog';
import type { Commit } from '../../interfaces/commit';
import type { Branch } from '../../interfaces/branch';
import type { Detail } from '../../interfaces/detail';
import type { CommandEntry } from '../../interfaces/command-entry';
import type { GraphRow } from '../../interfaces/graph-row';
import type { Snapshot } from '../../interfaces/snapshot';
import './history.css';
import './details.css';
import './commit-details.css';

export class History {
  readonly workspace = resolve(WorkspaceService);
  private dialogs = resolve(IDialogService);
  private unsubscribe?: () => void;
  private lastSnapshot: Snapshot | null = null;
  private detailGeneration = 0;
  private diffGeneration = 0;

  rows: GraphRow[] = [];
  selected: Commit | null = null;
  detail: Detail | null = null;
  selectedFile = '';
  diff = '';
  diffLoading = false;
  query = '';
  commandLog: CommandEntry[] = [];

  @observable
  tab = 'diff';
  tabChanged() {
    if (this.tab === 'log') {
      void this.loadLog();
    }
  }

  get matchCount() {
    return this.rows.filter(row => this.matches(row.commit)).length;
  }

  binding() {
    this.unsubscribe = this.workspace.subscribe(() => this.refresh());
    this.refresh();
  }

  unbinding() {
    this.unsubscribe?.();
    ++this.detailGeneration;
    ++this.diffGeneration;
  }

  refresh() {
    const snapshot = this.workspace.snapshot;
    if (!snapshot || snapshot === this.lastSnapshot) {
      return;
    }

    this.lastSnapshot = snapshot;
    this.rows = buildGraph(snapshot.commits);
    const commit = snapshot.commits.find(item => item.hash === this.selected?.hash) ?? snapshot.commits[0];
    if (commit && commit.hash !== this.selected?.hash) {
      void this.selectCommit(commit);
    }
  }

  async selectCommit(commit: Commit) {
    const generation = ++this.detailGeneration;
    ++this.diffGeneration;
    this.selected = commit;
    this.detail = null;
    this.selectedFile = '';
    this.diff = '';
    this.diffLoading = false;

    try {
      const detail = await this.workspace.client.detail(commit.hash);
      if (generation !== this.detailGeneration) {
        return;
      }

      this.detail = detail;
      if (detail.files[0]) {
        await this.selectFile(detail.files[0].path);
      }
    } catch (error) {
      if (generation === this.detailGeneration) {
        this.workspace.fail(error);
      }
    }
  }

  async selectFile(path: string) {
    if (!this.selected) {
      return;
    }

    const generation = ++this.diffGeneration;
    this.selectedFile = path;
    this.diffLoading = true;
    this.diff = '';

    try {
      const text = await this.workspace.client.diff({ path, hash: this.selected.hash });
      if (generation === this.diffGeneration) {
        this.diff = text || 'No text changes for this file.';
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

  matches(commit: Commit) {
    return `${commit.subject} ${commit.author} ${commit.hash} ${commit.refs.join(' ')}`.toLowerCase().includes(this.query.toLowerCase());
  }

  focusBranch(branch: Branch) {
    const commit = this.workspace.snapshot?.commits.find(item => item.hash === branch.hash);
    if (!commit) {
      this.workspace.inform('Load more history to find this branch tip.');
      return;
    }

    void this.selectCommit(commit);
    document.getElementById('commit-' + commit.hash)?.scrollIntoView({ block: 'center' });
  }

  findNext() {
    const matches = this.rows.filter(row => this.matches(row.commit));
    if (!matches.length) {
      return;
    }

    const index = matches.findIndex(row => row.commit.hash === this.selected?.hash);
    const commit = matches[(index + 1) % matches.length].commit;
    void this.selectCommit(commit);
    document.getElementById('commit-' + commit.hash)?.scrollIntoView({ block: 'center' });
  }

  async createBranch() {
    try {
      await this.dialogs.open({ component: NewBranchDialog });
    } catch (error) {
      this.workspace.fail(error);
    }
  }

  async loadLog() {
    try {
      this.commandLog = await this.workspace.client.log();
    } catch (error) {
      this.workspace.fail(error);
    }
  }

  short(hash: string) {
    return hash.slice(0, 7);
  }

  date(value: string) {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  fullDate(value: string) {
    return new Date(value).toLocaleString();
  }
}
