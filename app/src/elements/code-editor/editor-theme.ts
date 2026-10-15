import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const editorHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.bool, tags.null], color: 'var(--syntax-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.comment, color: 'var(--syntax-comment)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syntax-type)' },
  { tag: tags.function(tags.variableName), color: 'var(--syntax-function)' },
  { tag: tags.variableName, color: 'var(--syntax-variable)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--syntax-property)' },
  { tag: tags.tagName, color: 'var(--syntax-tag)' }
]);
