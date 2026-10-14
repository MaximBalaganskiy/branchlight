export interface Worktree {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
  main: boolean;
}
