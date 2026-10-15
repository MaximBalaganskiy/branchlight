export interface DiffRequest {
  path: string;
  hash?: string;
  staged?: boolean;
  untracked?: boolean;
  fullFile?: boolean;
}
