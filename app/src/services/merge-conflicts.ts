import type { MergeConflict } from '../interfaces/merge-conflict';

export function hasConflictMarkers(text: string): boolean {
  return text.split(/\r?\n/).some(line => /^(?:<{7,}|\|{7,}|={7,}|>{7,})(?:[ \t].*)?$/.test(line));
}

/** Parse Git merge, diff3 and zdiff3 markers, including conflict-marker-size. */
export function mergeConflicts(text: string): MergeConflict[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const conflicts: MergeConflict[] = [];
  let offset = 0;
  let start = -1;
  let width = 0;
  let section: 'ours' | 'base' | 'theirs' = 'ours';
  let ours = '';
  let base: string | null = null;
  let theirs = '';
  for (const line of lines) {
    const marker = /^(<{7,}|\|{7,}|={7,}|>{7,})(?:[ \t].*)?$/.exec(line.replace(/\r?\n$/, ''));
    if (marker?.[1][0] === '<') {
      start = offset;
      width = marker[1].length;
      section = 'ours';
      ours = '';
      base = null;
      theirs = '';
    } else if (start >= 0 && marker?.[1].length === width && marker[1][0] === '|' && section === 'ours') {
      section = 'base';
      base = '';
    } else if (start >= 0 && marker?.[1].length === width && marker[1][0] === '=' && section !== 'theirs') {
      section = 'theirs';
    } else if (start >= 0 && marker?.[1].length === width && marker[1][0] === '>' && section === 'theirs') {
      conflicts.push({ from: start, to: offset + line.length, ours, base, theirs });
      start = -1;
    } else if (start >= 0) {
      if (section === 'ours') {
        ours += line;
      } else if (section === 'base') {
        base += line;
      } else {
        theirs += line;
      }
    }
    offset += line.length;
  }
  return conflicts;
}

export function conflictChoice(conflict: MergeConflict, choice: 'ours' | 'theirs' | 'both' | 'both-reversed'): string {
  switch (choice) {
    case 'ours':
      return conflict.ours;
    case 'theirs':
      return conflict.theirs;
    case 'both':
      return conflict.ours + conflict.theirs;
    case 'both-reversed':
      return conflict.theirs + conflict.ours;
  }
}
