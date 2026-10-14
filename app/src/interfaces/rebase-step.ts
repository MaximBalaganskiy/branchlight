export interface RebaseStep {
  hash: string;
  subject: string;
  action: 'pick' | 'drop' | 'squash' | 'fixup';
}
