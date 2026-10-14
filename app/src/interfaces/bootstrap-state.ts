export interface BootstrapState {
  mode: 'browse' | 'commit';
  repo: string;
  recent: string[];
}
