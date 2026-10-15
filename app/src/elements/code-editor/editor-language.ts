import { StreamLanguage, type LanguageSupport } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

export async function editorLanguage(path: string): Promise<Extension | LanguageSupport> {
  const extension = path.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(extension || '')) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: extension === 'ts' || extension === 'tsx', jsx: extension === 'jsx' || extension === 'tsx' });
  }
  if (['cs', 'java', 'c', 'cpp', 'h'].includes(extension || '')) {
    const modes = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(
      extension === 'cs' ? modes.csharp : extension === 'java' ? modes.java : extension === 'c' ? modes.c : modes.cpp
    );
  }
  if (['html', 'xml', 'svg', 'xaml', 'csproj'].includes(extension || '')) {
    const { xml } = await import('@codemirror/legacy-modes/mode/xml');
    return StreamLanguage.define(xml);
  }
  if (extension === 'json') {
    const { json } = await import('@codemirror/legacy-modes/mode/javascript');
    return StreamLanguage.define(json);
  }
  if (['css', 'scss'].includes(extension || '')) {
    const { css } = await import('@codemirror/legacy-modes/mode/css');
    return StreamLanguage.define(css);
  }
  if (extension === 'py') {
    const { python } = await import('@codemirror/legacy-modes/mode/python');
    return StreamLanguage.define(python);
  }
  if (extension === 'rs') {
    const { rust } = await import('@codemirror/legacy-modes/mode/rust');
    return StreamLanguage.define(rust);
  }
  return [];
}
