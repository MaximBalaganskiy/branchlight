import type { DiffLine } from '../interfaces/diff-line';
import { escapeCode, highlightCode } from './syntax-highlighter';

export function parseDiff(text: string, filePath: string): DiffLine[] {
  let oldNumber = 0;
  let newNumber = 0;
  const raw = text.split('\n');
  if (raw.at(-1) === '') {
    raw.pop();
  }

  const lines: DiffLine[] = raw.slice(0, 12000).map(text => {
    const line: DiffLine = { text, html: escapeCode(text), kind: 'meta', old: '', next: '' };
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (match) {
      oldNumber = Number(match[1]);
      newNumber = Number(match[2]);
      line.kind = 'hunk';
    } else if (/^(diff |index |--- |\+\+\+ |new file|deleted file|Binary |\\)/.test(text)) {
      line.kind = 'meta';
    } else if (text.startsWith('+')) {
      line.kind = 'added';
      line.next = String(newNumber++);
    } else if (text.startsWith('-')) {
      line.kind = 'removed';
      line.old = String(oldNumber++);
    } else if (text.startsWith(' ') && (oldNumber || newNumber)) {
      line.kind = 'context';
      line.old = String(oldNumber++);
      line.next = String(newNumber++);
    }
    return line;
  });

  let hunk: DiffLine[] = [];
  const highlightHunk = () => {
    const before = hunk.filter(line => line.kind !== 'added');
    const after = hunk.filter(line => line.kind !== 'removed');
    const oldHtml = highlightCode(before.map(line => line.text.slice(1)).join('\n'), filePath);
    const newHtml = highlightCode(after.map(line => line.text.slice(1)).join('\n'), filePath);
    before.forEach((line, index) => {
      if (line.kind === 'removed') {
        line.html = '-' + oldHtml[index];
      }
    });
    after.forEach((line, index) => {
      line.html = escapeCode(line.text[0]) + newHtml[index];
    });
    hunk = [];
  };

  for (const line of lines) {
    if (line.kind === 'hunk' || line.kind === 'meta') {
      highlightHunk();
    } else {
      hunk.push(line);
    }
  }
  highlightHunk();
  return lines;
}
