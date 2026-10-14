import type { GitClient } from './git-client';

declare global {
  interface Window {
    gitClient: GitClient;
  }
}
