import { resolve } from 'aurelia';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { WorkspaceService } from '../../services/workspace-service';

export class WindowControls {
  private workspace = resolve(WorkspaceService);
  private nativeWindow = isTauri() ? getCurrentWindow() : null;
  private unlisten?: UnlistenFn;
  private generation = 0;
  readonly available = !!this.nativeWindow;
  maximized = false;

  attached() {
    void this.connect(++this.generation);
  }

  detaching() {
    ++this.generation;
    this.unlisten?.();
    this.unlisten = undefined;
  }

  private async connect(generation: number) {
    if (!this.nativeWindow) {
      return;
    }
    try {
      const unlisten = await this.nativeWindow.onResized(() => void this.refresh(generation));
      if (generation !== this.generation) {
        unlisten();
        return;
      }
      this.unlisten = unlisten;
      await this.refresh(generation);
    } catch (error) {
      if (generation === this.generation) {
        this.workspace.fail(error);
      }
    }
  }

  private async refresh(generation: number) {
    try {
      const maximized = await this.nativeWindow?.isMaximized();
      if (generation === this.generation) {
        this.maximized = !!maximized;
      }
    } catch (error) {
      if (generation === this.generation) {
        this.workspace.fail(error);
      }
    }
  }

  async run(action: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      await this.nativeWindow?.[action]();
      if (action === 'toggleMaximize') {
        await this.refresh(this.generation);
      }
    } catch (error) {
      this.workspace.fail(error);
    }
  }
}
