import { CustomElement, customAttribute, INode, resolve } from 'aurelia';
import type { UiSplitter } from '@aurelia-ui-toolkits/headless';

@customAttribute('splitter-bounds')
export class SplitterBounds {
  private element = resolve(INode) as HTMLElement;
  private splitter!: UiSplitter;
  private observer?: ResizeObserver;

  attached() {
    this.splitter = CustomElement.for(this.element).viewModel as UiSplitter;
    const parent = this.element.parentElement;
    if (!parent) {
      return;
    }
    this.observer = new ResizeObserver(() => this.updateBounds());
    this.observer.observe(parent);
    this.observer.observe(this.element);
  }

  detaching() {
    this.observer?.disconnect();
  }

  private updateBounds() {
    const parent = this.element.parentElement;
    if (!parent) {
      return;
    }
    const horizontal = this.splitter.direction === 'horizontal';
    const available = horizontal ? parent.clientWidth - this.element.offsetWidth : parent.clientHeight - this.element.offsetHeight;
    if (available <= 0) {
      return;
    }
    this.splitter.max = Math.max(0, available);
    this.splitter.size = Math.min(this.splitter.size, this.splitter.max);
  }
}
