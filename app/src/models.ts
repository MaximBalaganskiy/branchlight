export interface Commit { hash: string; parents: string[]; author: string; date: string; subject: string; refs: string[] }
export interface Branch { fullName: string; name: string; hash: string; upstream: string; tracking: string; kind: 'local' | 'remote' | 'tag' }
export interface ChangedFile { path: string; originalPath?: string; index: string; worktree: string; staged: boolean; unstaged: boolean; conflict: boolean }
export interface Snapshot { path: string; name: string; branch: string; head: string; files: ChangedFile[]; branches: Branch[]; commits: Commit[]; hasMore: boolean; operation: string }
export interface Detail { message: string; files: { path: string; status: string }[] }
export interface DiffRequest { path: string; hash?: string; staged?: boolean; untracked?: boolean }
export interface CommandEntry { command: string; time: string; duration: number; exitCode: number; error: string }
export interface GitClient {
  bootstrap(): Promise<{ mode: 'browse' | 'commit'; repo: string; recent: string[] }>;
  open(directory?: string): Promise<string | null>;
  snapshot(limit: number): Promise<Snapshot>;
  detail(hash: string): Promise<Detail>;
  diff(request: DiffRequest): Promise<string>;
  mutate(action: string, payload?: Record<string, unknown>): Promise<boolean>;
  log(): Promise<CommandEntry[]>;
  openCommit(): Promise<void>;
  onChanged(callback: () => void): () => void;
}
declare global { interface Window { gitClient: GitClient } }
