import { bindable, INode, resolve } from 'aurelia';
import type { ConflictContent } from '../../interfaces/conflict-content';
import type { MergeConflictOption } from '../../interfaces/merge-conflict-option';
import type { MergeSession } from './merge-session';
import type { MergeDraft } from '../../interfaces/merge-draft';
import type { MergeInlineControl } from '../../interfaces/merge-inline-control';
import { hasConflictMarkers } from '../../services/merge-conflicts';
import '../code-editor/code-editor.css';
import '../diff-view/syntax.css';
import './merge-editor.css';

export class MergeEditor {
  private host = resolve(INode) as HTMLElement;

  @bindable
  content!: ConflictContent;

  @bindable
  filePath = '';

  @bindable
  draft?: MergeDraft;

  @bindable
  busy = false;
  busyChanged() {
    this.session?.result.setReadOnly(this.busy);
  }

  resultHost!: HTMLElement;
  oursHost!: HTMLElement;
  theirsHost!: HTMLElement;
  baseHost!: HTMLElement;
  private session?: MergeSession;
  private generation = 0;
  value = '';
  remaining = 0;
  active = 0;
  choices: MergeConflictOption[] = [];
  selectedConflict = 0;
  currentResolved = false;
  dirty = false;
  ready = false;
  showBase = false;
  syncScroll = true;
  alignmentLimited = false;
  error = '';
  controls: MergeInlineControl[] = [];
  searchOpen = false;
  searchText = '';
  replacement = '';
  matchCase = false;
  regexp = false;
  searchStatus = '';
  wrapped = false;
  oursSize = Math.max(180, Math.min(420, Math.round(window.innerWidth * 0.27)));
  theirsSize = this.oursSize;

  get status() {
    if (!this.ready) {
      return 'Loading merge editor…';
    }
    if (this.remaining) {
      if (this.currentResolved) {
        return `Conflict ${this.selectedConflict + 1} resolved · ${this.remaining} remaining`;
      }
      return `Conflict ${this.active + 1} of ${this.remaining} remaining`;
    }
    return hasConflictMarkers(this.value)
      ? 'Unmatched conflict markers remain — edit the result'
      : 'All conflicts resolved — review the result';
  }

  async attached() {
    const generation = ++this.generation;
    try {
      const { MergeSession } = await import('./merge-session');
      if (generation !== this.generation) {
        return;
      }
      this.session = new MergeSession(
        [this.resultHost, this.oursHost, this.theirsHost, this.baseHost],
        this.content,
        this.filePath,
        () => this.update(),
        this.draft
      );
      this.ready = true;
      this.busyChanged();
      this.update();
      this.session.revealCurrent();
    } catch (error) {
      this.error = `Could not load the merge editor: ${String(error)}`;
    }
  }

  private update() {
    if (this.session) {
      const changed = this.value !== this.session.value || this.remaining !== this.session.remaining.length;
      this.value = this.session.value;
      this.remaining = this.session.remaining.length;
      this.active = this.session.remaining.findIndex(region => region.id === this.session?.current?.id);
      this.selectedConflict = this.session.current?.id ?? 0;
      this.currentResolved = this.session.current?.resolved ?? false;
      this.choices = this.session.regions.map(region => ({
        id: region.id,
        label: `Conflict ${region.id + 1} · ${region.resolved ? 'Resolved' : 'Unresolved'}`
      }));
      this.dirty = this.session.dirty;
      this.alignmentLimited = this.session.alignmentLimited;
      this.controls = this.session.controls;
      if (changed) {
        this.host.dispatchEvent(new CustomEvent('resolution-changed', { bubbles: true }));
      }
    }
  }

  get savedDraft(): MergeDraft | undefined {
    return this.session && { content: this.content, value: this.value, regions: [...this.session.regions], savedAt: Date.now() };
  }

  inlineAccept(control: MergeInlineControl) {
    if (this.busy) {
      return;
    }
    this.session?.selectRegion(control.id);
    if (control.pane === 0 && control.resolved) {
      this.reopen();
    } else {
      this.accept(control.pane === 1 ? 'ours' : control.pane === 2 ? 'theirs' : 'manual');
    }
  }

  toggleWrap() {
    this.session?.toggleWrap();
    this.wrapped = this.session?.wrapped ?? false;
  }

  openSearch() {
    this.searchOpen = true;
    requestAnimationFrame(() => this.host.querySelector<HTMLInputElement>('[data-merge-search] input')?.focus());
  }

  search(action: 'next' | 'previous' | 'replace' | 'all') {
    if (!this.session || !this.searchText) {
      return;
    }
    if (!this.session.query(this.searchText, this.replacement, this.matchCase, this.regexp)) {
      this.searchStatus = 'Invalid regular expression';
      return;
    }
    this.searchStatus = this.session.searchCommand(action) ? '' : 'No match';
  }

  accept(choice: 'ours' | 'theirs' | 'both' | 'both-reversed' | 'manual') {
    if (!this.busy) {
      this.session?.accept(choice);
    }
  }

  navigate(direction: number) {
    this.session?.navigate(direction);
  }

  selectConflict() {
    this.session?.selectRegion(this.selectedConflict);
  }

  reopen() {
    if (!this.busy) {
      this.session?.reopen();
    }
  }

  undo() {
    this.session?.result.undo();
  }

  redo() {
    this.session?.result.redo();
  }

  toggleSync() {
    this.syncScroll = !this.syncScroll;
    if (this.session) {
      this.session.syncScroll = this.syncScroll;
      if (this.syncScroll) {
        this.session.syncFromResult();
      }
    }
  }

  toggleBase() {
    this.showBase = !this.showBase;
    requestAnimationFrame(() => this.session?.syncFromResult());
  }

  onKey(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && ['f', 'h'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      this.openSearch();
    }
    if (event.key === 'Escape' && this.searchOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.searchOpen = false;
      this.session?.query('', '', false, false);
      this.session?.result.view.focus();
    }
    if (event.key === 'F7') {
      event.preventDefault();
      event.stopPropagation();
      this.navigate(event.shiftKey ? -1 : 1);
    }
  }

  detaching() {
    ++this.generation;
    this.session?.destroy();
    this.session = undefined;
  }
}
