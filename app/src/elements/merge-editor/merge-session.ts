import { Compartment } from '@codemirror/state';
import { Decoration, EditorView, type ViewUpdate } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { Chunk } from '@codemirror/merge';
import { EditorSession } from '../code-editor/editor-session';
import type { ConflictContent } from '../../interfaces/conflict-content';
import { conflictChoice } from '../../services/merge-conflicts';
import { mergeDocument, prepareMerge, setMergeRegions } from './merge-document';
import { differenceDecorations, mapMergePosition } from './merge-differences';

export class MergeSession {
  readonly result: EditorSession;
  readonly sources: EditorSession[];
  private document;
  private initial: string;
  private activeId = 0;
  private highlights = [new Compartment(), new Compartment(), new Compartment(), new Compartment()];
  private chunks: (readonly Chunk[])[] = [];
  private diffConfig = { scanLimit: 500, timeout: 40 };
  private scrollListeners: (() => void)[] = [];
  private expectedScroll = new Map<EditorView, { top: number; left: number }>();
  private frame = 0;
  private refreshFrame = 0;
  private scrollSource?: EditorView;
  private destroyed = false;
  syncScroll = true;

  get regions() {
    return this.result.view.state.field(this.document.field);
  }

  get remaining() {
    return this.regions.filter(region => !region.resolved);
  }

  get current() {
    return this.remaining.find(region => region.id === this.activeId) ?? this.remaining[0];
  }

  get value() {
    return this.result.view.state.doc.toString();
  }

  get dirty() {
    return this.value !== this.initial || this.regions.some(region => region.resolved);
  }

  constructor(
    hosts: HTMLElement[],
    content: ConflictContent,
    path: string,
    private onUpdate: () => void
  ) {
    const prepared = prepareMerge(content.working.replaceAll('\r\n', '\n'));
    this.initial = prepared.text;
    this.document = mergeDocument(prepared.regions);
    this.result = new EditorSession(hosts[0], prepared.text, 'Resolved content', false, undefined, undefined, [
      this.document.field,
      this.document.history,
      this.highlights[0].of([]),
      EditorView.updateListener.of(update => this.updated(update))
    ]);
    this.sources = [content.ours, content.theirs, content.base].map(
      (text, index) =>
        new EditorSession(
          hosts[index + 1],
          text.replaceAll('\r\n', '\n'),
          ['Ours', 'Theirs', 'Common ancestor'][index],
          true,
          undefined,
          position => {
            const translated = mapMergePosition(this.chunks[index], position, true);
            this.setActive(translated);
          },
          this.highlights[index + 1].of([])
        )
    );
    this.chunks = this.sources.map(source => Chunk.build(this.result.view.state.doc, source.view.state.doc, this.diffConfig));
    for (const session of [this.result, ...this.sources]) {
      void session.loadLanguage(path);
      const listener = () => this.scrolled(session.view);
      session.view.scrollDOM.addEventListener('scroll', listener);
      this.scrollListeners.push(() => session.view.scrollDOM.removeEventListener('scroll', listener));
    }
    this.refreshHighlights();
  }

  private updated(update: ViewUpdate) {
    if (!this.sources) {
      return;
    }
    if (update.docChanged) {
      this.chunks = this.sources.map((source, index) =>
        Chunk.updateA(this.chunks[index], update.state.doc, source.view.state.doc, update.changes, this.diffConfig)
      );
    }
    const regionsChanged = update.transactions.some(transaction => transaction.effects.some(effect => effect.is(setMergeRegions)));
    if (update.selectionSet) {
      this.setActive(update.state.selection.main.head, false);
    }
    if (update.docChanged || regionsChanged || update.selectionSet) {
      this.activeId = this.current?.id ?? 0;
      this.onUpdate();
      this.scheduleHighlights();
    }
  }

  private setActive(position: number, notify = true) {
    const region = this.remaining.find(region => position >= region.from && position <= region.to);
    if (region) {
      this.activeId = region.id;
      if (notify) {
        this.onUpdate();
        this.scheduleHighlights();
      }
    }
  }

  accept(choice: 'ours' | 'theirs' | 'both' | 'both-reversed' | 'manual') {
    const region = this.current;
    if (!region || this.result.view.state.readOnly) {
      return;
    }
    const view = this.result.view;
    const changes = view.state.changes(
      choice === 'manual' ? [] : { from: region.from, to: region.to, insert: conflictChoice(region, choice) }
    );
    const regions = this.regions.map(item => ({
      ...item,
      from: changes.mapPos(item.from, item.id > region.id ? 1 : -1),
      to: changes.mapPos(item.to, item.id < region.id ? -1 : 1),
      resolved: item.resolved || item.id === region.id
    }));
    view.dispatch({
      changes,
      effects: setMergeRegions.of(regions),
      selection: { anchor: changes.mapPos(region.from, -1) },
      annotations: isolateHistory.of('full'),
      userEvent: 'input.merge'
    });
    this.revealCurrent();
    view.focus();
  }

  navigate(direction: number) {
    const pending = this.remaining;
    if (!pending.length) {
      return;
    }
    const index = pending.findIndex(region => region.id === this.current?.id);
    this.activeId = pending[(index + direction + pending.length) % pending.length].id;
    this.revealCurrent();
    this.onUpdate();
    this.scheduleHighlights();
  }

  revealCurrent() {
    if (this.current) {
      this.result.select(this.current.from);
      for (const source of this.sources) {
        const position = this.translate(this.result.view, source.view, this.current.from);
        source.view.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'center' }) });
      }
    }
  }

  private scheduleHighlights() {
    cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = requestAnimationFrame(() => this.refreshHighlights());
  }

  private refreshHighlights() {
    if (this.destroyed) {
      return;
    }
    const views = [this.result.view, ...this.sources.map(source => source.view)];
    for (const [index, view] of views.entries()) {
      // Sources are compared with the result; the result is compared with the ancestor.
      const decorations = differenceDecorations(this.chunks[index === 0 ? 2 : index - 1], view.state.doc, index === 0 ? 'a' : 'b');
      const regions = index === 0 ? this.regions : this.remaining;
      for (const region of regions) {
        const from = this.translate(this.result.view, view, region.from);
        const to = this.translate(this.result.view, view, region.to);
        const last = view.state.doc.lineAt(Math.max(from, to - 1)).number;
        const className = `${region.resolved ? 'merge-resolved' : 'merge-pending'}${region.id === this.current?.id ? ' merge-current' : ''}`;
        for (let line = view.state.doc.lineAt(from).number; line <= last; line++) {
          decorations.push(
            Decoration.line({ class: className, attributes: { 'data-conflict': String(region.id + 1) } }).range(
              view.state.doc.line(line).from
            )
          );
        }
      }
      view.dispatch({ effects: this.highlights[index].reconfigure(EditorView.decorations.of(Decoration.set(decorations, true))) });
    }
  }

  private translate(from: EditorView, to: EditorView, position: number) {
    const sourceIndex = this.sources.findIndex(source => source.view === from);
    const targetIndex = this.sources.findIndex(source => source.view === to);
    const resultPosition = sourceIndex < 0 ? position : mapMergePosition(this.chunks[sourceIndex], position, true);
    const translated = targetIndex < 0 ? resultPosition : mapMergePosition(this.chunks[targetIndex], resultPosition);
    return Math.max(0, Math.min(to.state.doc.length, translated));
  }

  private scrolled(view: EditorView) {
    const expected = this.expectedScroll.get(view);
    this.expectedScroll.delete(view);
    if (
      !this.syncScroll ||
      (expected && Math.abs(view.scrollDOM.scrollTop - expected.top) < 1 && Math.abs(view.scrollDOM.scrollLeft - expected.left) < 1)
    ) {
      return;
    }
    this.scrollSource = view;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.synchronize());
  }

  syncFromResult() {
    this.scrollSource = this.result.view;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.synchronize());
  }

  private synchronize() {
    const from = this.scrollSource;
    if (!from || this.destroyed || !this.syncScroll) {
      return;
    }
    const anchor = from.lineBlockAtHeight(from.scrollDOM.scrollTop);
    const offset = from.scrollDOM.scrollTop - anchor.top;
    for (const view of [this.result.view, ...this.sources.map(source => source.view)]) {
      if (view === from || !view.scrollDOM.clientHeight) {
        continue;
      }
      const position = this.translate(from, view, anchor.from);
      const top = view.lineBlockAt(position).top + offset;
      view.scrollDOM.scrollTop = top;
      view.scrollDOM.scrollLeft = from.scrollDOM.scrollLeft;
      this.expectedScroll.set(view, { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft });
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.refreshFrame);
    this.scrollListeners.forEach(remove => remove());
    [this.result, ...this.sources].forEach(session => session.destroy());
  }
}
