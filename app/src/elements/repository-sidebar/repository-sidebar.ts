import { INode, observable, resolve, watch } from 'aurelia';
import { WorkspaceService } from '../../services/workspace-service';
import { buildBranchTree } from '../../services/branch-tree';
import type { BranchTreeNode } from '../../interfaces/branch-tree-node';
import type { Branch } from '../../interfaces/branch';
import type { UiMenu } from '@aurelia-ui-toolkits/headless';
import './repository-sidebar.css';

export class RepositorySidebar {
  readonly workspace = resolve(WorkspaceService);
  private element = resolve(INode) as HTMLElement;
  private expansion = new Map<string, boolean>();
  private repository = '';
  selectedNode = '';
  nodes: BranchTreeNode[] = [];
  branchMenu!: UiMenu;
  contextBranch: Branch | null = null;

  async branchAction(action: string) {
    const branch = this.contextBranch;
    if (!branch) {
      return;
    }
    if (action === 'tip') {
      this.selectedNode = branch.fullName;
      this.element.dispatchEvent(new CustomEvent('branch-selected', { detail: branch, bubbles: true }));
    } else if (action === 'checkout') {
      await this.workspace.action('checkout', { name: branch.name });
    } else if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(branch.name);
        this.workspace.inform('Reference name copied');
      } catch (error) {
        this.workspace.fail(error);
      }
    } else {
      this.element.dispatchEvent(new CustomEvent('branch-action', { detail: { action, branch }, bubbles: true }));
    }
  }

  @observable
  branchSearch = '';
  branchSearchChanged() {
    this.rebuildTree();
  }

  binding() {
    this.rebuildTree();
  }

  @watch('workspace.snapshot')
  rebuildTree() {
    if (this.repository !== this.workspace.repo) {
      this.repository = this.workspace.repo;
      this.expansion.clear();
      this.selectedNode = '';
    }
    this.nodes = buildBranchTree(this.workspace.snapshot?.branches ?? [], this.branchSearch, this.expansion);
  }

  rememberExpansion(node: BranchTreeNode, expanded: boolean) {
    if (!this.branchSearch.trim()) {
      this.expansion.set(node.id, expanded);
    }
  }

  selectNode(node: BranchTreeNode) {
    if (node.branch) {
      this.element.dispatchEvent(new CustomEvent('branch-selected', { detail: node.branch, bubbles: true }));
    }
  }

  checkout(node: BranchTreeNode, event: Event) {
    event.stopPropagation();
    if (node.branch) {
      void this.workspace.action('checkout', { name: node.branch.name });
    }
  }

  manageRemotes() {
    this.element.dispatchEvent(new CustomEvent('manage-remotes', { bubbles: true }));
  }
}
