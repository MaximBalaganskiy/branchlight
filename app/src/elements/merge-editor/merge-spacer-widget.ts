import { WidgetType } from '@codemirror/view';

export class MergeSpacerWidget extends WidgetType {
  constructor(readonly height: number) {
    super();
  }

  eq(other: MergeSpacerWidget) {
    return this.height === other.height;
  }

  get estimatedHeight() {
    return this.height;
  }

  toDOM() {
    const element = document.createElement('div');
    element.className = 'merge-spacer';
    element.style.height = `${this.height}px`;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  updateDOM(element: HTMLElement) {
    element.style.height = `${this.height}px`;
    return true;
  }
}
