import dagre from '@dagrejs/dagre';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge, NODE_WIDTH, NODE_HEIGHT } from './shared';

export const hierarchicalLayout: LayoutFunction = ({ nodes, edges }) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    // Only add edge if both nodes exist in the graph
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const flowNodes = nodes.map(n => {
    const pos = g.node(n.id);
    return {
      ...styleNode(n),
      // dagre returns center coords; React Flow uses top-left
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: flowNodes, edges: edges.map(styleEdge) };
};
