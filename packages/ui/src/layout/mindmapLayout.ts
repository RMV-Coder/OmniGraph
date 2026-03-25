import dagre from '@dagrejs/dagre';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge, NODE_WIDTH, NODE_HEIGHT } from './shared';

export const mindmapLayout: LayoutFunction = ({ nodes, edges }, options) => {
  const direction = options?.mindmapDirection ?? 'LR';

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 160 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const flowNodes = nodes.map(n => {
    const pos = g.node(n.id);
    return {
      ...styleNode(n),
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: flowNodes, edges: edges.map(styleEdge) };
};
