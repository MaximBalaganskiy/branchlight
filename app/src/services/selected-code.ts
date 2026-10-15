export function selectedCode(container: HTMLElement, selection: Selection, selector: string): string {
  const lines = container.querySelectorAll(selector);
  const fragments: string[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    const selected = selection.getRangeAt(index);
    for (const line of lines) {
      if (!selected.intersectsNode(line)) {
        continue;
      }
      const content = document.createRange();
      content.selectNodeContents(line);
      const clipped = selected.cloneRange();
      if (selected.compareBoundaryPoints(Range.START_TO_START, content) < 0) {
        clipped.setStart(content.startContainer, content.startOffset);
      }
      if (selected.compareBoundaryPoints(Range.END_TO_END, content) > 0) {
        clipped.setEnd(content.endContainer, content.endOffset);
      }
      fragments.push(clipped.toString());
    }
  }
  return fragments.join('\n');
}
