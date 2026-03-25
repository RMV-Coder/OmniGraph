import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge } from './shared';
import type { OmniNode } from '../types';

interface ForceNode extends SimulationNodeDatum {
  id: string;
  omniNode: OmniNode;
}

export const forceLayout: LayoutFunction = ({ nodes, edges }) => {
  const simNodes: ForceNode[] = nodes.map(n => ({
    id: n.id,
    omniNode: n,
  }));

  const nodeIndex = new Map(simNodes.map(n => [n.id, n]));

  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map(e => ({
      source: e.source,
      target: e.target,
    }));

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks).id(d => d.id).distance(150))
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(70))
    .stop();

  // Run synchronously
  const ticks = Math.min(300, Math.max(150, nodes.length));
  for (let i = 0; i < ticks; i++) simulation.tick();

  const flowNodes = simNodes.map(sn => ({
    ...styleNode(sn.omniNode),
    position: { x: sn.x ?? 0, y: sn.y ?? 0 },
  }));

  return { nodes: flowNodes, edges: edges.map(styleEdge) };
};
