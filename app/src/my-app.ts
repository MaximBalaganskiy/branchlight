import type { Snapshot, Commit, ChangedFile, Detail, CommandEntry, Branch } from './models';
import { buildGraph, type GraphRow } from './graph';

export class MyApp {
  mode: 'browse' | 'commit' = 'browse';
  repo = '';
  recent: string[] = [];
  snapshot: Snapshot | null = null;
  rows: GraphRow[] = [];
  selected: Commit | null = null;
  detail: Detail | null = null;
  selectedFile = '';
  diff = '';
  diffLoading = false;
  workingFile: ChangedFile | null = null;
  workingStaged = false;
  query = '';
  branchFilter = '';
  branchSearch = '';
  error = '';
  notice = '';
  busy = false;
  refreshing = false;
  limit = 300;
  tab = 'diff';
  message = '';
  branchName = '';
  branchDialog!: HTMLDialogElement;
  commandLog: CommandEntry[] = [];
  theme = localStorage.getItem('branchlight-theme') || 'dark';
  private detailGeneration = 0;
  private diffGeneration = 0;
  private refreshGeneration = 0;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private signature = '';
  private api = window.gitClient;

  get unstaged() { return this.snapshot?.files.filter(f => f.unstaged) ?? []; }
  get staged() { return this.snapshot?.files.filter(f => f.staged) ?? []; }
  get localBranches() { return this.filterBranches('local'); }
  get remoteBranches() { return this.filterBranches('remote'); }
  get tags() { return this.filterBranches('tag'); }
  get currentTracking() { return this.snapshot?.branches.find(b => b.kind === 'local' && b.name === this.snapshot?.branch)?.tracking || ''; }
  get canCommit() { return !this.busy && !!this.message.trim() && this.staged.length > 0 && !this.snapshot?.files.some(f => f.conflict); }
  get matchCount() { return this.rows.filter(r => this.matches(r.commit)).length; }
  get diffTitle() { return this.mode === 'commit' ? this.workingFile?.path : this.selectedFile; }
  get summaryLength() { return this.message.split('\n')[0].length; }
  filterBranches(kind: Branch['kind']) { const q = this.branchSearch.toLowerCase(); return this.snapshot?.branches.filter(b => b.kind === kind && b.name.toLowerCase().includes(q)) ?? []; }
  async binding() {
    document.documentElement.dataset.theme = this.theme;
    if (!this.api) { this.error = 'Open Branchlight as a desktop app with npm start to access local repositories.'; return; }
    try {
      const initial = await this.api.bootstrap();
      this.mode = initial.mode; this.repo = initial.repo; this.recent = initial.recent;
      if (this.repo) { this.message = localStorage.getItem('draft:' + this.repo) || ''; await this.refresh(); }
      this.unsubscribe = this.api.onChanged(() => { if (!this.busy) void this.refresh(true); });
    } catch (e) { this.fail(e); }
  }
  attached() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('focus', this.onFocus);
    this.timer = setInterval(() => { if (document.hasFocus() && !this.busy && !this.refreshing && this.repo) void this.refresh(true); }, 8000);
  }
  detaching() { this.unsubscribe?.(); clearInterval(this.timer); window.removeEventListener('keydown', this.onKey); window.removeEventListener('focus', this.onFocus); }
  private onFocus = () => { if (this.repo && !this.busy) void this.refresh(true); };
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'F5') { e.preventDefault(); void this.refresh(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'o' && this.mode === 'browse') { e.preventDefault(); void this.open(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'k' && this.mode === 'browse' && this.repo) { e.preventDefault(); void this.openCommit(); }
    if (e.ctrlKey && e.key === 'Enter' && this.mode === 'commit' && this.canCommit) { e.preventDefault(); void this.commit(); }
  };
  messageChanged() { if (this.repo && this.mode === 'commit') localStorage.setItem('draft:' + this.repo, this.message); }
  toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = this.theme; localStorage.setItem('branchlight-theme', this.theme); }
  fail(e: unknown) { this.error = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  async open(directory?: string) {
    if (this.busy || !this.api) return;
    this.busy = true; this.error = '';
    try {
      const repo = await this.api.open(directory);
      if (repo) { ++this.detailGeneration; ++this.diffGeneration; this.repo = repo; this.snapshot = null; this.selected = null; this.detail = null; this.diff = ''; this.selectedFile = ''; this.branchFilter = ''; this.query = ''; this.limit = 300; this.signature = ''; await this.refresh(); this.recent = (await this.api.bootstrap()).recent; }
    } catch (e) { this.fail(e); } finally { this.busy = false; }
  }
  async refresh(quiet = false) {
    if (!this.repo || !this.api) return;
    const generation = ++this.refreshGeneration;
    this.refreshing = true;
    if (!quiet) this.error = '';
    try {
      const result = await this.api.snapshot(this.limit);
      if (generation !== this.refreshGeneration) return;
      const signature = JSON.stringify(result);
      const changed = signature !== this.signature;
      this.signature = signature;
      if (changed) { this.snapshot = result; this.rows = buildGraph(result.commits); }
      if (this.mode === 'browse' && changed) {
        const commit = result.commits.find(c => c.hash === this.selected?.hash) ?? result.commits[0];
        if (commit && (!this.selected || commit.hash !== this.selected.hash)) await this.selectCommit(commit);
      }
      if (this.mode === 'commit') {
        const old = this.workingFile;
        const file = result.files.find(f => f.path === old?.path && (this.workingStaged ? f.staged : f.unstaged));
        if (file) await this.selectWorking(file, this.workingStaged);
        else if (this.unstaged[0]) await this.selectWorking(this.unstaged[0], false);
        else if (this.staged[0]) await this.selectWorking(this.staged[0], true);
        else { ++this.diffGeneration; this.workingFile = null; this.diff = ''; }
      }
      if (this.tab === 'log') this.commandLog = await this.api.log();
    } catch (e) { if (generation === this.refreshGeneration) this.fail(e); }
    finally { if (generation === this.refreshGeneration) this.refreshing = false; }
  }
  async selectCommit(commit: Commit) {
    const generation = ++this.detailGeneration;
    ++this.diffGeneration;
    this.selected = commit; this.detail = null; this.selectedFile = ''; this.diff = ''; this.diffLoading = false;
    try { const detail = await this.api.detail(commit.hash); if (generation !== this.detailGeneration) return; this.detail = detail; if (detail.files[0]) await this.selectFile(detail.files[0].path); }
    catch (e) { if (generation === this.detailGeneration) this.fail(e); }
  }
  async selectFile(path: string) {
    if (!this.selected) return;
    const generation = ++this.diffGeneration;
    this.selectedFile = path; this.diffLoading = true; this.diff = '';
    try { const text = await this.api.diff({ path, hash: this.selected.hash }); if (generation === this.diffGeneration) this.diff = text || 'No text changes for this file.'; }
    catch (e) { if (generation === this.diffGeneration) this.fail(e); }
    finally { if (generation === this.diffGeneration) this.diffLoading = false; }
  }
  async selectWorking(file: ChangedFile, staged: boolean) {
    const generation = ++this.diffGeneration;
    this.workingFile = file; this.workingStaged = staged; this.diffLoading = true;
    try { const text = await this.api.diff({ path: file.path, staged, untracked: file.index === '?' }); if (generation === this.diffGeneration) this.diff = text || 'No text changes. This may be a rename, mode change or submodule.'; }
    catch (e) { if (generation === this.diffGeneration) this.fail(e); }
    finally { if (generation === this.diffGeneration) this.diffLoading = false; }
  }
  matches(commit: Commit) {
    const q = this.query.toLowerCase();
    return !q || `${commit.subject} ${commit.author} ${commit.hash} ${commit.refs.join(' ')}`.toLowerCase().includes(q);
  }
  focusBranch(branch: Branch) {
    this.branchFilter = branch.name;
    const commit = this.snapshot?.commits.find(c => c.hash === branch.hash);
    if (commit) { void this.selectCommit(commit); requestAnimationFrame(() => document.getElementById('commit-' + commit.hash)?.scrollIntoView({ block: 'center' })); }
    else this.notice = 'Load more history to find this branch tip.';
  }
  findNext() {
    const matches = this.rows.filter(r => this.matches(r.commit));
    if (!matches.length) return;
    const index = matches.findIndex(r => r.commit.hash === this.selected?.hash);
    const commit = matches[(index + 1) % matches.length].commit;
    void this.selectCommit(commit);
    document.getElementById('commit-' + commit.hash)?.scrollIntoView({ block: 'center' });
  }
  async loadMore() { this.limit += 300; await this.refresh(); }
  async openCommit() { try { await this.api.openCommit(); } catch(e) { this.fail(e); } }
  async action(action: string, payload: Record<string, unknown> = {}) {
    if (this.busy) return false;
    this.busy = true; this.error = ''; this.notice = '';
    try { await this.api.mutate(action, payload); this.notice = ({ stage: 'Changes staged', unstage: 'Changes unstaged', commit: 'Commit created', fetch: 'Fetch complete', pull: 'Pull complete', push: 'Push complete', checkout: 'Branch switched', branch: 'Branch created' } as Record<string,string>)[action] || 'Done'; await this.refresh(true); return true; }
    catch (e) { this.fail(e); await this.refresh(true); return false; }
    finally { this.busy = false; }
  }
  stage(file: ChangedFile, staged: boolean) { return this.action(staged ? 'unstage' : 'stage', { paths: [file.path, ...(file.originalPath ? [file.originalPath] : [])] }); }
  stageAll(staged: boolean) { const files = staged ? this.staged : this.unstaged; return this.action(staged ? 'unstage' : 'stage', { paths: [...new Set(files.flatMap(f => [f.path, ...(f.originalPath ? [f.originalPath] : [])]))] }); }
  async commit() { if (this.canCommit && await this.action('commit', { message: this.message })) this.message = ''; }
  async createBranch() { if (await this.action('branch', { name: this.branchName })) { this.branchDialog.close(); this.branchName = ''; } }
  async showLog() { this.tab = 'log'; this.commandLog = await this.api.log(); }
  short(hash: string) { return hash.slice(0, 7); }
  date(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  fullDate(value: string) { return new Date(value).toLocaleString(); }
  basename(value: string) { return value.split(/[\\/]/).pop(); }
  statusLabel(file: ChangedFile, staged: boolean) { return file.conflict ? '!' : (staged ? file.index : file.worktree) === '?' ? 'A' : (staged ? file.index : file.worktree); }
}
