import { bindable } from 'aurelia';
import type { DiffLine } from '../../interfaces/diff-line';
import './diff-view.css';
import './syntax.css';

export class DiffView {
  private generation = 0;
  lines: DiffLine[] = [];
  truncated = false;

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
    this.lines = parseDiff(this.text, this.filePath);
  }
}
