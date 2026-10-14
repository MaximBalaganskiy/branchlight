const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const failures = [];

function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(file);
      continue;
    }

    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.html')) {
      for (const tag of source.match(/<[a-z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g) || []) {
        if (tag.includes('\n')) {
          failures.push(`${file}: keep opening-tag attributes on one line`);
        }
      }
      for (const tag of source.match(/<button\b[^>]*>/g) || []) {
        if (!/\bui-(?:icon-)?button\b/.test(tag)) {
          failures.push(`${file}: button is not headless`);
        }
      }
      if (/<(?:input|textarea|select)\b/.test(source)) {
        failures.push(`${file}: raw input control`);
      }
      if (/as-element=/.test(source)) {
        failures.push(`${file}: use the headless attribute or element syntax`);
      }
    }

    if (file.endsWith('.ts')) {
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      let declarations = 0;
      const visit = node => {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          declarations++;
        }
        if (ts.isMethodDeclaration(node) && node.body && !node.body.getText(tree).includes('\n')) {
          failures.push(`${file}: method body must span multiple lines`);
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      if (declarations > 1) {
        failures.push(`${file}: multiple class/interface declarations`);
      }
      if (/@bindable(?:\([^\n]*\))?[^\S\n]+\w/.test(source)) {
        failures.push(`${file}: bindable decorator must have its own line`);
      }
    }
  }
}

inspect(path.resolve('src'));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Source conventions pass: one class/interface per file, multiline methods, separate decorators, headless controls.');
}
