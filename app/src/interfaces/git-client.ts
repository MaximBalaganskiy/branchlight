import type { Snapshot } from './snapshot';
import type { Detail } from './detail';
import type { DiffRequest } from './diff-request';
import type { CommandEntry } from './command-entry';
import type { BootstrapState } from './bootstrap-state';
import type { Remote } from './remote';
import type { TreeEntry } from './tree-entry';
import type { FilePreview } from './file-preview';
import type { Worktree } from './worktree';
import type { ConflictContent } from './conflict-content';
import type { MessageOptions } from './message-options';

export interface GitClient {
  worktrees(): Promise<Worktree[]>;
  conflictContent(path: string): Promise<ConflictContent>;
  messageOptions(): Promise<MessageOptions>;
  bootstrap(): Promise<BootstrapState>;
  open(directory?: string): Promise<string | null>;
  snapshot(limit: number): Promise<Snapshot>;
  remotes(): Promise<Remote[]>;
  detail(hash: string): Promise<Detail>;
  commitTree(hash: string): Promise<TreeEntry[]>;
  commitFile(hash: string, path: string): Promise<FilePreview>;
  diff(request: DiffRequest): Promise<string>;
  mutate(action: string, payload?: Record<string, unknown>): Promise<boolean>;
  log(): Promise<CommandEntry[]>;
  openCommit(): Promise<void>;
  onChanged(callback: () => void): Promise<() => void>;
}
