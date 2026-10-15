import { bindable, customAttribute, INode, resolve } from 'aurelia';
import { selectedCode } from '../services/selected-code';

@customAttribute('code-selection')
export class CodeSelection {
  private element = resolve(INode) as HTMLElement;

  @bindable
  value = 'code';

  attached() {
    this.element.addEventListener('keydown', this.onKeyDown);
    this.element.addEventListener('copy', this.onCopy);
  }

  detaching() {
    this.element.removeEventListener('keydown', this.onKeyDown);
    this.element.removeEventListener('copy', this.onCopy);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if ((event.target as Element).closest('input, textarea, [contenteditable="true"]')) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      const range = document.createRange();
      range.selectNodeContents(this.element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  private onCopy = (event: ClipboardEvent) => {
    const selection = window.getSelection();
    if (!event.clipboardData || !selection || selection.isCollapsed) {
      return;
    }
    if (!this.element.contains(selection.anchorNode) || !this.element.contains(selection.focusNode)) {
      return;
    }
    event.clipboardData.setData('text/plain', selectedCode(this.element, selection, this.value));
    event.preventDefault();
  };
}
