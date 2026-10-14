import type { Commit } from './commit';
import type { GraphEdge } from './graph-edge';

export interface GraphRow {
  commit: Commit;
  x: number;
  color: string;
  edges: GraphEdge[];
  width: number;
}
