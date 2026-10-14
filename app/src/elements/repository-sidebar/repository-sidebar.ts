import { INode, resolve } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';
import type { Branch } from '../../interfaces/branch';
import './repository-sidebar.css';

export class RepositorySidebar {
  readonly workspace = resolve(WorkspaceService);
  private element = resolve(INode) as HTMLElement;
  branchFilter = '';
  branchSearch = '';

  get localBranches() {
    return this.filterBranches('local');
  }

  get remoteBranches() {
    return this.filterBranches('remote');
  }

  get tags() {
    return this.filterBranches('tag');
  }

  filterBranches(kind: Branch['kind']) {
    return (
      this.workspace.snapshot?.branches.filter(
        branch => branch.kind === kind && branch.name.toLowerCase().includes(this.branchSearch.toLowerCase())
      ) ?? []
    );
  }

  focusBranch(branch: Branch) {
    this.branchFilter = branch.name;
    this.element.dispatchEvent(new CustomEvent('branch-selected', { detail: branch, bubbles: true }));
  }

  manageRemotes() {
    this.element.dispatchEvent(new CustomEvent('manage-remotes', { bubbles: true }));
  }
}
