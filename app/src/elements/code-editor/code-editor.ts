import { bindable, BindingMode, INode, resolve } from 'aurelia';
import type { EditorSession } from './editor-session';
import '../diff-view/syntax.css';
import './code-editor.css';

export class CodeEditor {
  private host = resolve(INode) as HTMLElement;
  private session?: EditorSession;
  private generation = 0;

  @bindable({ mode: BindingMode.twoWay })
  value = '';
  valueChanged() {
    this.session?.setValue(this.value);
  }

  @bindable
  filePath = '';
  filePathChanged() {
    void this.session?.loadLanguage(this.filePath);
  }

  @bindable
  readOnly = false;
  readOnlyChanged() {
    this.session?.setReadOnly(this.readOnly);
  }

  @bindable
  label = 'Code';

  async attached() {
    const generation = ++this.generation;
    const { EditorSession } = await import('./editor-session');
    if (generation !== this.generation) {
      return;
    }
    this.session = new EditorSession(
      this.host,
      this.value,
      this.label,
      this.readOnly,
      value => {
        this.value = value;
      },
      position => {
        this.host.dispatchEvent(new CustomEvent('cursor-moved', { bubbles: true, detail: position }));
      }
    );
    await this.session.loadLanguage(this.filePath);
  }

  detaching() {
    ++this.generation;
    this.session?.destroy();
    this.session = undefined;
  }

  replace(from: number, to: number, text: string) {
    this.session?.replace(from, to, text);
  }

  select(from: number, to = from) {
    this.session?.select(from, to);
  }

  undo() {
    this.session?.undo();
  }

  redo() {
    this.session?.redo();
  }
}
