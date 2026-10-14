import { common, createLowlight } from 'lowlight';
import type { RootContent } from 'hast';

const highlighter = createLowlight(common);
const extensions: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  csproj: 'xml',
  xaml: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  json: 'json',
  jsonc: 'json',
  cs: 'csharp',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  rb: 'ruby',
  php: 'php',
  ini: 'ini',
  toml: 'ini',
  dockerfile: 'dockerfile'
};

export function escapeCode(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Flatten syntax tokens by line while carrying multiline comment/string classes. */
export function highlightCode(source: string, filePath: string): string[] {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() || '';
  const language = extensions[name] || extensions[name.split('.').pop() || ''];
  if (!language || !highlighter.registered(language) || source.length > 250_000) {
    return source.split('\n').map(escapeCode);
  }

  const lines = [''];
  const visit = (node: RootContent, classes: string[]) => {
    if (node.type === 'text') {
      const parts = node.value.split('\n');
      for (let index = 0; index < parts.length; index++) {
        if (index > 0) {
          lines.push('');
        }
        const text = escapeCode(parts[index]);
        lines[lines.length - 1] += classes.length ? `<span class="${classes.join(' ')}">${text}</span>` : text;
      }
    } else if (node.type === 'element') {
      const names = Array.isArray(node.properties.className)
        ? node.properties.className.map(String).filter(name => /^[\w-]+$/.test(name))
        : [];
      for (const child of node.children) {
        visit(child, [...classes, ...names]);
      }
    }
  };

  try {
    for (const node of highlighter.highlight(language, source).children) {
      visit(node, []);
    }
    return lines;
  } catch {
    return source.split('\n').map(escapeCode);
  }
}
