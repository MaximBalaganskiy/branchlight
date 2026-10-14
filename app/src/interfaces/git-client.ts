import type { Snapshot } from './snapshot';
import type { Detail } from './detail';
import type { DiffRequest } from './diff-request';
import type { CommandEntry } from './command-entry';
import type { BootstrapState } from './bootstrap-state';
import type { Remote } from './remote';

export interface GitClient {
  bootstrap(): Promise<BootstrapState>;
  open(directory?: string): Promise<string | null>;
  snapshot(limit: number): Promise<Snapshot>;
  remotes(): Promise<Remote[]>;
  detail(hash: string): Promise<Detail>;
  diff(request: DiffRequest): Promise<string>;
  mutate(action: string, payload?: Record<string, unknown>): Promise<boolean>;
  log(): Promise<CommandEntry[]>;
  openCommit(): Promise<void>;
  onChanged(callback: () => void): Promise<() => void>;
}
