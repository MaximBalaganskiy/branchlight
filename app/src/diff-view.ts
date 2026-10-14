import { bindable } from 'aurelia';
interface Line {
  text: string;
  kind: string;
  old: string;
  next: string;
}
export class DiffView {
  @bindable
  text = '';

  @bindable
  isLoading = false;

  lines: Line[] = [];
  truncated = false;
  textChanged() {
    let old = 0,
      next = 0;
    const raw = this.text.split('\n');
    if (raw.at(-1) === '') raw.pop();
    this.truncated = raw.length > 12000;
    this.lines = raw.slice(0, 12000).map(text => {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (match) {
        old = Number(match[1]);
        next = Number(match[2]);
        return { text, kind: 'hunk', old: '', next: '' };
      }
      if (/^(diff |index |--- |\+\+\+ |new file|deleted file|Binary |\\)/.test(text)) return { text, kind: 'meta', old: '', next: '' };
      if (text.startsWith('@@')) return { text, kind: 'hunk', old: '', next: '' };
      if (text.startsWith('+')) return { text, kind: 'added', old: '', next: String(next++) };
      if (text.startsWith('-')) return { text, kind: 'removed', old: String(old++), next: '' };
      return { text, kind: 'context', old: old ? String(old++) : '', next: next ? String(next++) : '' };
    });
  }
  binding() {
    this.textChanged();
  }
}
