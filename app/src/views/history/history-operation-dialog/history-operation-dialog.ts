import { resolve } from 'aurelia';
import { IDialogController } from '@aurelia/dialog';
import { WorkspaceService } from '../../../services/workspace-service';
import type { HistoryOperation } from '../../../interfaces/history-operation';
import type { RebaseStep } from '../../../interfaces/rebase-step';
import { autosquashPlan } from '../../../services/autosquash-plan';

export class HistoryOperationDialog {
  readonly workspace = resolve(WorkspaceService);
  private dialog = resolve(IDialogController);
  model!: HistoryOperation;
  head = '';
  branch = '';
  error = '';
  loading = false;
  mode = 'mixed';
  discard = false;
  mainline = 1;
  plan: RebaseStep[] = [];
  readonly actions = ['pick', 'edit', 'reword', 'drop', 'squash', 'fixup'];

  autosquash() {
    this.plan = autosquashPlan(this.plan);
  }
  readonly modes = [
    { value: 'soft', label: 'Soft — keep changes staged' },
    { value: 'mixed', label: 'Mixed — keep changes unstaged' },
    { value: 'hard', label: 'Hard — discard tracked changes' }
  ];

  get title() {
    return {
      'cherry-pick': 'Cherry-pick commit',
      revert: 'Revert commit',
      reset: 'Reset current branch',
      rebase: 'Rebase current branch',
      'rebase-plan': 'Edit rebase plan'
    }[this.model.action];
  }

  get parents() {
    return (this.model.parents ?? []).map((hash, index) => ({ value: index + 1, label: `Parent ${index + 1} · ${hash.slice(0, 8)}` }));
  }

  async activate(model: HistoryOperation) {
    this.model = model;
    this.head = this.workspace.snapshot?.head ?? '';
    this.branch = this.workspace.snapshot?.branch ?? '';
    if (model.action === 'rebase-plan') {
      this.loading = true;
      try {
        this.plan = await this.workspace.client.rebasePlan(model.reference);
      } catch (error) {
        this.error = String(error);
      } finally {
        this.loading = false;
      }
    }
  }

  move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= this.plan.length) {
      return;
    }
    const plan = [...this.plan];
    [plan[index], plan[target]] = [plan[target], plan[index]];
    this.plan = plan;
  }

  async confirm() {
    this.error = '';
    const success = await this.workspace.action(
      this.model.action,
      {
        reference: this.model.reference,
        expected_head: this.head,
        expected_branch: this.branch,
        choice: this.mode,
        force: this.discard,
        mainline: this.mainline,
        plan: this.model.action === 'rebase-plan' ? this.plan : undefined
      },
      false
    );
    if (success) {
      await this.dialog.ok();
      if (this.workspace.snapshot?.operation) {
        await this.workspace.openCommit();
      }
    } else {
      this.error = this.workspace.lastError;
    }
  }

  async resolve() {
    await this.dialog.ok();
    await this.workspace.openCommit();
  }

  cancel() {
    return this.dialog.cancel();
  }

  canDeactivate() {
    return !this.workspace.busy;
  }
}
