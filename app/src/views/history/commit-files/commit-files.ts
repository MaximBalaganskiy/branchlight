import { bindable, resolve } from 'aurelia';
import { WorkspaceService } from '../../../services/workspace-service';
import { buildFileTree } from '../../../services/file-tree';
import type { FileTreeNode } from '../../../interfaces/file-tree-node';
import '../../../elements/diff-view/syntax.css';

export class CommitFiles {
  private workspace = resolve(WorkspaceService);
  private treeGeneration = 0;
  private fileGeneration = 0;
  private isBound = false;
  nodes: FileTreeNode[] = [];
  selectedNode = '';
  selectedPath = '';
  lines: string[] = [];
  fileCount = 0;
  treeLoading = false;
  fileLoading = false;
  message = '';
  error = '';
  truncated = false;

  @bindable
  hash = '';
  hashChanged() {
    if (this.isBound) {
      void this.loadTree();
    }
  }

  @bindable
  repository = '';
  repositoryChanged() {
    if (this.isBound) {
      void this.loadTree();
    }
  }

  binding() {
    this.isBound = true;
    void this.loadTree();
  }

  unbinding() {
    this.isBound = false;
    ++this.treeGeneration;
    ++this.fileGeneration;
  }

  async loadTree() {
    const generation = ++this.treeGeneration;
    ++this.fileGeneration;
    this.nodes = [];
    this.selectedNode = '';
    this.selectedPath = '';
    this.lines = [];
    this.message = '';
    this.error = '';
    this.fileLoading = false;
    this.treeLoading = false;
    this.fileCount = 0;
    if (!this.hash || !this.repository) {
      return;
    }
    this.treeLoading = true;
    try {
      const entries = await this.workspace.client.commitTree(this.hash);
      if (generation === this.treeGeneration) {
        this.nodes = buildFileTree(entries);
        this.fileCount = entries.length;
      }
    } catch (error) {
      if (generation === this.treeGeneration) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (generation === this.treeGeneration) {
        this.treeLoading = false;
      }
    }
  }

  async selectFile(node: FileTreeNode) {
    if (!node.entry) {
      return;
    }
    const generation = ++this.fileGeneration;
    this.selectedPath = node.path;
    this.lines = [];
    this.message = '';
    this.truncated = false;
    this.fileLoading = true;
    try {
      const preview = await this.workspace.client.commitFile(this.hash, node.path);
      const { highlightCode } = await import('../../../services/syntax-highlighter');
      if (generation !== this.fileGeneration) {
        return;
      }
      this.message = preview.message || (preview.text ? '' : 'Empty file.');
      const lines = preview.text.split('\n');
      this.truncated = lines.length > 12000;
      this.lines = preview.text ? highlightCode(lines.slice(0, 12000).join('\n'), node.path) : [];
    } catch (error) {
      if (generation === this.fileGeneration) {
        this.message = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (generation === this.fileGeneration) {
        this.fileLoading = false;
      }
    }
  }
}
