import type { Commit } from '../interfaces/commit';
import type { GraphRow } from '../interfaces/graph-row';
import type { GraphEdge } from '../interfaces/graph-edge';
import type { Lane } from '../interfaces/lane';
export const ROW_HEIGHT = 26;
const palette = ['#79c6ad', '#9ca4ff', '#efa76e', '#e68db8', '#74b7ed', '#c6b56d'];

const x = (lane: number) => 14 + lane * 12;
/** Allocate lanes in topological order. Pending parents continue across page boundaries. */
export function buildGraph(commits: Commit[], height = ROW_HEIGHT): GraphRow[] {
  const middle = height / 2;
  let lanes: Lane[] = [];
  let nextColor = 0;
  const rows: GraphRow[] = [];
  for (const commit of commits) {
    let index = lanes.findIndex(lane => lane.hash === commit.hash);
    const hasIncoming = index >= 0;
    if (index < 0) {
      index = lanes.length;
      lanes.push({ hash: commit.hash, color: palette[nextColor++ % palette.length] });
    }
    const before = lanes.slice(),
      current = before[index],
      after = before.slice();
    after.splice(index, 1);
    for (let p = 0; p < commit.parents.length; p++) {
      const hash = commit.parents[p];
      if (!after.some(lane => lane.hash === hash))
        after.splice(Math.min(index + p, after.length), 0, {
          hash,
          color: p === 0 ? current.color : palette[nextColor++ % palette.length]
        });
    }
    const edges: GraphEdge[] = [];
    for (let i = 0; i < before.length; i++) {
      const lane = before[i];
      if (i === index) {
        if (hasIncoming) {
          edges.push({ d: `M ${x(i)} 0 L ${x(i)} ${middle}`, color: lane.color });
        }
        continue;
      }
      const j = after.findIndex(item => item.hash === lane.hash);
      edges.push({ d: `M ${x(i)} 0 C ${x(i)} ${middle} ${x(j)} ${middle} ${x(j)} ${height}`, color: lane.color });
    }
    for (const parent of commit.parents) {
      const j = after.findIndex(lane => lane.hash === parent);
      edges.push({
        d: `M ${x(index)} ${middle} C ${x(index)} ${height * 0.8} ${x(j)} ${height * 0.7} ${x(j)} ${height}`,
        color: after[j].color
      });
    }
    // Only this row's active lanes reserve space. Distant merges must not widen
    // every commit or move the existing subjects when another page is loaded.
    const width = Math.max(40, x(Math.max(before.length, after.length) - 1) + 14);
    rows.push({ commit, x: x(index), color: current.color, edges, width });
    lanes = after;
  }
  return rows;
}
