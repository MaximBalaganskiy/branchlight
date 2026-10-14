import { resolve } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';
import './app.css';

export class App {
  readonly workspace = resolve(WorkspaceService);
  theme = localStorage.getItem('branchlight-theme') || 'dark';
  private timer?: ReturnType<typeof setInterval>;

  get tracking() {
    const snapshot = this.workspace.snapshot;
    return snapshot?.branches.find(branch => branch.kind === 'local' && branch.name === snapshot.branch)?.tracking || '';
  }

  binding() {
    document.documentElement.dataset.theme = this.theme;
  }

  attached() {
    void this.workspace.initialize();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('focus', this.onFocus);
    this.timer = setInterval(() => {
      if (document.hasFocus() && !this.workspace.busy && !this.workspace.refreshing) {
        void this.workspace.refresh();
      }
    }, 8000);
  }

  detaching() {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('focus', this.onFocus);
    this.workspace.dispose();
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = this.theme;
    localStorage.setItem('branchlight-theme', this.theme);
  }

  private onFocus = () => {
    if (!this.workspace.busy) {
      void this.workspace.refresh();
    }
  };

  private onKey = (event: KeyboardEvent) => {
    if (event.key === 'F5') {
      event.preventDefault();
      void this.workspace.refresh();
    }

    if (this.workspace.mode !== 'browse') {
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void this.workspace.open();
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'k' && this.workspace.repo) {
      event.preventDefault();
      void this.workspace.openCommit();
    }
  };
}
