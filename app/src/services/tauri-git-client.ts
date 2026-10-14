import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { GitClient } from '../interfaces/git-client';
import type { BootstrapState } from '../interfaces/bootstrap-state';
import type { Snapshot } from '../interfaces/snapshot';
import type { Detail } from '../interfaces/detail';
import type { DiffRequest } from '../interfaces/diff-request';
import type { CommandEntry } from '../interfaces/command-entry';
import type { Remote } from '../interfaces/remote';
import type { TreeEntry } from '../interfaces/tree-entry';
import type { FilePreview } from '../interfaces/file-preview';

export class TauriGitClient implements GitClient {
  commitTree(hash: string) {
    return invoke<TreeEntry[]>('commit_tree', { hash });
  }

  commitFile(hash: string, path: string) {
    return invoke<FilePreview>('commit_file', { hash, path });
  }

  remotes() {
    return invoke<Remote[]>('remotes');
  }

  bootstrap() {
    return invoke<BootstrapState>('bootstrap');
  }

  open(directory?: string) {
    return invoke<string | null>('open_repository', { directory });
  }

  snapshot(limit: number) {
    return invoke<Snapshot>('snapshot', { limit });
  }

  detail(hash: string) {
    return invoke<Detail>('detail', { hash });
  }

  diff(request: DiffRequest) {
    return invoke<string>('diff', { request });
  }

  mutate(action: string, payload: Record<string, unknown> = {}) {
    return invoke<boolean>('mutate', { action, payload });
  }

  log() {
    return invoke<CommandEntry[]>('command_log');
  }

  openCommit() {
    return invoke<void>('commit_window');
  }

  async onChanged(callback: () => void) {
    return listen('repository-changed', callback);
  }
}
