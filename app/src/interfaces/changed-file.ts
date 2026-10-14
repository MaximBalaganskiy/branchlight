export interface ChangedFile {
  path: string;
  originalPath?: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  conflict: boolean;
}
