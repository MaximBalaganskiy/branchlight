import { bindable, INode, resolve } from 'aurelia';
import type { DiffLine } from '../../interfaces/diff-line';
import { selectedDiffCode } from '../../services/selected-diff-code';
import './diff-view.css';
import './syntax.css';

export class DiffView {
  private generation = 0;
  private element = resolve(INode) as HTMLElement;
  lines: DiffLine[] = [];
  truncated = false;
  selected: number[] = [];

  @bindable
  text = '';
  textChanged() {
    void this.render();
  }

  @bindable
  filePath = '';
  filePathChanged() {
    void this.render();
  }

  @bindable
  isLoading = false;

  @bindable
  selectable = false;

  @bindable
  staged = false;

  @bindable
  disabled = false;

  selectAll(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      const range = document.createRange();
      range.selectNodeContents(event.currentTarget as HTMLElement);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  copy(event: ClipboardEvent) {
    const selection = window.getSelection();
    const container = event.currentTarget as HTMLElement;
    if (!event.clipboardData || !selection || selection.isCollapsed) {
      return;
    }
    if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
      return;
    }
    event.clipboardData.setData('text/plain', selectedDiffCode(container, selection));
    event.preventDefault();
  }

  toggle(index: number) {
    this.selected = this.selected.includes(index) ? this.selected.filter(value => value !== index) : [...this.selected, index];
  }

  apply(indices = this.selected) {
    if (indices.length && !this.disabled && !this.isLoading && !this.truncated) {
      this.element.dispatchEvent(new CustomEvent('stage-selection', { bubbles: true, detail: indices }));
    }
  }

  applyHunk(index: number) {
    const indices: number[] = [];
    for (let cursor = index + 1; cursor < this.lines.length && this.lines[cursor].kind !== 'hunk'; cursor++) {
      if (['added', 'removed'].includes(this.lines[cursor].kind)) {
        indices.push(cursor);
      }
    }
    this.apply(indices);
  }

  binding() {
    return this.render();
  }

  unbinding() {
    ++this.generation;
  }

  private async render() {
    const generation = ++this.generation;
    const { parseDiff } = await import('../../services/parse-diff');
    if (generation !== this.generation) {
      return;
    }

    this.truncated = this.text.split('\n').length > 12000;
    this.selected = [];
    this.lines = parseDiff(this.text, this.filePath);
  }
}
