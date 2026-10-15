import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { editorLanguage } from './editor-language';
import { editorHighlight } from './editor-theme';
import { mergeConflicts } from '../../services/merge-conflicts';

export class EditorSession {
  private view?: EditorView;
  private editable = new Compartment();
  private language = new Compartment();
  private generation = 0;

  setValue(value: string) {
    if (this.view && this.view.state.doc.toString() !== value) {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false)
      });
    }
  }

  setReadOnly(readOnly: boolean) {
    this.view?.dispatch({ effects: this.editable.reconfigure(EditorState.readOnly.of(readOnly)) });
  }

  constructor(
    host: HTMLElement,
    value: string,
    label: string,
    readOnly: boolean,
    onChange: (value: string) => void,
    onCursor: (position: number) => void
  ) {
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          history(),
          indentOnInput(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(editorHighlight),
          this.editable.of(EditorState.readOnly.of(readOnly)),
          this.language.of([]),
          EditorView.contentAttributes.of(view => ({
            'aria-label': label,
            'aria-multiline': 'true',
            'aria-readonly': String(view.state.readOnly)
          })),
          EditorView.decorations.compute(['doc'], state =>
            Decoration.set(
              mergeConflicts(state.doc.toString()).map(block =>
                Decoration.line({ class: 'merge-unresolved' }).range(state.doc.lineAt(block.from).from)
              )
            )
          ),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
            if (update.selectionSet) {
              onCursor(update.state.selection.main.head);
            }
          })
        ]
      })
    });
  }

  destroy() {
    ++this.generation;
    this.view?.destroy();
    this.view = undefined;
  }

  replace(from: number, to: number, text: string) {
    if (!this.view || this.view.state.readOnly) {
      return;
    }
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from },
      userEvent: 'input.merge',
      annotations: isolateHistory.of('full'),
      scrollIntoView: true
    });
    this.view.focus();
  }

  select(from: number, to = from) {
    if (!this.view) {
      return;
    }
    this.view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    this.view.focus();
  }

  undo() {
    if (this.view && !this.view.state.readOnly) {
      undo(this.view);
      this.view.focus();
    }
  }

  redo() {
    if (this.view && !this.view.state.readOnly) {
      redo(this.view);
      this.view.focus();
    }
  }

  async loadLanguage(path: string) {
    const generation = ++this.generation;
    const language = await editorLanguage(path);
    if (this.view && generation === this.generation) {
      this.view.dispatch({ effects: this.language.reconfigure(language) });
    }
  }
}
