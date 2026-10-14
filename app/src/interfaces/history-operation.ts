export interface HistoryOperation {
  action: 'cherry-pick' | 'revert' | 'reset' | 'rebase' | 'rebase-plan';
  reference: string;
  label: string;
  parents?: string[];
}
