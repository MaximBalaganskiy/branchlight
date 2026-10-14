import { resolve } from 'aurelia';
import { isTauri } from '@tauri-apps/api/core';
import { UiToastService } from '@aurelia-ui-toolkits/headless';
import type { Snapshot } from '../interfaces/snapshot';
import { TauriGitClient } from './tauri-git-client';

export class WorkspaceService {
  readonly client = resolve(TauriGitClient);
  private toasts = resolve(UiToastService);
  private listeners = new Set<() => void>();
  private generation = 0;
  private signature = '';
  private unsubscribe?: () => void;

  mode: 'browse' | 'commit' = 'browse';
  repo = '';
  recent: string[] = [];
  snapshot: Snapshot | null = null;
  busy = false;
  refreshing = false;
  limit = 300;
  lastError = '';

  async initialize() {
    if (!isTauri()) {
      this.fail(new Error('Launch the desktop app to access local repositories.'));
      return;
    }

    try {
      const initial = await this.client.bootstrap();
      this.mode = initial.mode;
      this.repo = initial.repo;
      this.recent = initial.recent;
      this.unsubscribe = await this.client.onChanged(() => {
        if (!this.busy) {
          void this.refresh();
        }
      });
      await this.refresh();
    } catch (error) {
      this.fail(error);
    }
  }

  dispose() {
    this.unsubscribe?.();
    this.listeners.clear();
    this.toasts.clear();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async open(directory?: string) {
    if (this.busy) {
      return;
    }

    this.busy = true;
    try {
      const repo = await this.client.open(directory);
      if (!repo) {
        return;
      }

      this.repo = repo;
      this.snapshot = null;
      this.signature = '';
      this.limit = 300;
      await this.refresh();
      this.recent = (await this.client.bootstrap()).recent;
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
    }
  }

  async refresh() {
    if (!this.repo) {
      return;
    }

    const generation = ++this.generation;
    this.refreshing = true;
    try {
      const snapshot = await this.client.snapshot(this.limit);
      if (generation !== this.generation) {
        return;
      }

      const signature = JSON.stringify(snapshot);
      if (signature !== this.signature) {
        this.signature = signature;
        this.snapshot = snapshot;
      }

      for (const listener of this.listeners) {
        listener();
      }
    } catch (error) {
      if (generation === this.generation) {
        this.fail(error);
      }
    } finally {
      if (generation === this.generation) {
        this.refreshing = false;
      }
    }
  }

  async loadMore() {
    this.limit = Math.min(this.limit + 300, 5000);
    await this.refresh();
  }

  async openCommit() {
    try {
      await this.client.openCommit();
    } catch (error) {
      this.fail(error);
    }
  }

  async action(action: string, payload: Record<string, unknown> = {}) {
    if (this.busy) {
      return false;
    }

    this.busy = true;
    this.lastError = '';
    try {
      await this.client.mutate(action, payload);
      await this.refresh();
      const messages: Record<string, string> = {
        stage: 'Changes staged',
        unstage: 'Changes unstaged',
        commit: 'Commit created',
        fetch: 'Fetch complete',
        pull: 'Pull complete',
        push: 'Push complete',
        checkout: 'Branch switched',
        branch: 'Branch created'
      };
      void this.toasts.success(messages[action] || 'Done');
      return true;
    } catch (error) {
      this.fail(error);
      await this.refresh();
      return false;
    } finally {
      this.busy = false;
    }
  }

  inform(message: string) {
    void this.toasts.info(message);
  }

  fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== this.lastError) {
      void this.toasts.show({ tone: 'danger', message, duration: 0 });
    }
    this.lastError = message;
  }
}
