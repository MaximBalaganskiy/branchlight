import type { Commit } from './models';
export const ROW_HEIGHT = 34;
const palette = ['#79c6ad', '#9ca4ff', '#efa76e', '#e68db8', '#74b7ed', '#c6b56d'];
export interface GraphEdge {
  d: string;
  color: string;
}
export interface GraphRow {
  commit: Commit;
  x: number;
  color: string;
  edges: GraphEdge[];
  width: number;
}
interface Lane {
  hash: string;
  color: string;
}
const x = (lane: number) => 18 + lane * 18;
/** Allocate lanes in topological order. Pending parents continue across page boundaries. */
export function buildGraph(commits: Commit[]): GraphRow[] {
  let lanes: Lane[] = [],
    nextColor = 0,
    maxLanes = 1;
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
        if (hasIncoming) edges.push({ d: `M ${x(i)} 0 L ${x(i)} 17`, color: lane.color });
        continue;
      }
      const j = after.findIndex(item => item.hash === lane.hash);
      edges.push({ d: `M ${x(i)} 0 C ${x(i)} 17 ${x(j)} 17 ${x(j)} 34`, color: lane.color });
    }
    for (const parent of commit.parents) {
      const j = after.findIndex(lane => lane.hash === parent);
      edges.push({ d: `M ${x(index)} 17 C ${x(index)} 27 ${x(j)} 24 ${x(j)} 34`, color: after[j].color });
    }
    maxLanes = Math.max(maxLanes, before.length, after.length);
    rows.push({ commit, x: x(index), color: current.color, edges, width: 0 });
    lanes = after;
  }
  for (const row of rows) row.width = Math.max(74, x(maxLanes) + 12);
  return rows;
}
