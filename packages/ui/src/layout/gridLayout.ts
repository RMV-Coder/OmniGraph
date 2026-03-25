import type { LayoutFunction } from './types';
import { styleNode, styleEdge } from './shared';

const COLS = 8;
const X_GAP = 200;
const Y_GAP = 150;

export const gridLayout: LayoutFunction = ({ nodes, edges }) => {
  const flowNodes = nodes.map((n, i) => ({
    ...styleNode(n),
    position: { x: (i % COLS) * X_GAP, y: Math.floor(i / COLS) * Y_GAP },
  }));

  return { nodes: flowNodes, edges: edges.map(styleEdge) };
};
