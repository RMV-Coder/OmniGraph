import { useRef, useEffect, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  Simulation,
} from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { Node, Edge, NodeDragHandler } from 'reactflow';
import type { OmniGraph } from '../types';
import { styleNode, styleEdge } from '../layout/shared';
import type { SearchFilterMode } from '../App';

interface ForceNode extends SimulationNodeDatum {
  id: string;
  flowNode: Node;
}

interface UseForceSimulationOptions {
  graphData: OmniGraph | null;
  active: boolean;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setEdges: React.Dispatch<React.SetStateAction<any[]>>;
  matchingIds: Set<string>;
  isFiltering: boolean;
  filterMode: SearchFilterMode;
}

/** Apply filter to force-layout nodes inline (avoids extra render pass) */
function applyForceFilter(
  nodes: Node[],
  matchingIds: Set<string>,
  isFiltering: boolean,
  mode: SearchFilterMode,
): Node[] {
  if (!isFiltering) return nodes;

  if (mode === 'hide') {
    return nodes.filter(node => matchingIds.has(node.id));
  }

  // Dim mode
  return nodes.map(node => {
    const matches = matchingIds.has(node.id);
    return {
      ...node,
      style: {
        ...node.style,
        opacity: matches ? 1 : 0.15,
        transition: 'opacity 0.2s',
      },
    };
  });
}

/** Apply filter to force-layout edges inline */
function applyForceEdgeFilter(
  edges: Edge[],
  matchingIds: Set<string>,
  isFiltering: boolean,
  mode: SearchFilterMode,
): Edge[] {
  if (!isFiltering) return edges;

  if (mode === 'hide') {
    return edges.filter(edge =>
      matchingIds.has(edge.source) && matchingIds.has(edge.target),
    );
  }

  // Dim mode
  return edges.map(edge => {
    const bothMatch = matchingIds.has(edge.source) && matchingIds.has(edge.target);
    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: bothMatch ? 1 : 0.08,
        transition: 'opacity 0.2s',
      },
      animated: bothMatch ? edge.animated : false,
    };
  });
}

export function useForceSimulation({
  graphData, active, setNodes, setEdges,
  matchingIds, isFiltering, filterMode,
}: UseForceSimulationOptions) {
  const simRef = useRef<Simulation<ForceNode, SimulationLinkDatum<ForceNode>> | null>(null);
  const simNodesRef = useRef<ForceNode[]>([]);
  const nodeMapRef = useRef<Map<string, ForceNode>>(new Map());
  const rafRef = useRef<number | null>(null);
  const needsUpdateRef = useRef(false);
  // Store raw (unfiltered) edges so we can re-filter when params change
  const rawEdgesRef = useRef<Edge[]>([]);
  // Store latest filter params in refs so tick callback always has current values
  const filterRef = useRef({ matchingIds, isFiltering, filterMode });
  filterRef.current = { matchingIds, isFiltering, filterMode };

  // Flush simulation positions to React Flow via rAF (throttled to ~60fps)
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current != null) return; // already scheduled
    needsUpdateRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!needsUpdateRef.current) return;
      needsUpdateRef.current = false;
      const simNodes = simNodesRef.current;
      const { matchingIds: mIds, isFiltering: isFilt, filterMode: fMode } = filterRef.current;

      setNodes(() => {
        // Build all nodes with current simulation positions, then filter
        const updated = simNodes.map(sn => ({
          ...sn.flowNode,
          position: { x: sn.x ?? 0, y: sn.y ?? 0 },
        }));
        return applyForceFilter(updated, mIds, isFilt, fMode);
      });
    });
  }, [setNodes]);

  // Initialize or tear down the simulation when active/data changes
  useEffect(() => {
    if (!active || !graphData) {
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Create simulation nodes with gentle initial positions (small circle)
    const count = graphData.nodes.length;
    const radius = Math.sqrt(count) * 30; // smaller spread to prevent flinging
    const simNodes: ForceNode[] = graphData.nodes.map((n, i) => {
      const angle = (i / count) * 2 * Math.PI;
      return {
        id: n.id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        flowNode: styleNode(n),
      };
    });

    const nodeMap = new Map(simNodes.map(n => [n.id, n]));
    nodeMapRef.current = nodeMap;
    simNodesRef.current = simNodes;

    // Filter edges to only valid connections
    const validEdges = graphData.edges.filter(
      e => nodeMap.has(e.source) && nodeMap.has(e.target),
    );

    const simLinks: SimulationLinkDatum<ForceNode>[] = validEdges.map(e => ({
      source: e.source,
      target: e.target,
    }));

    // Store raw edges and set filtered edges
    const styledEdges = validEdges.map(styleEdge);
    rawEdgesRef.current = styledEdges;
    const { matchingIds: mIds, isFiltering: isFilt, filterMode: fMode } = filterRef.current;
    setEdges(applyForceEdgeFilter(styledEdges, mIds, isFilt, fMode));

    // Set initial node positions immediately so React Flow has something to render
    const initialNodes = simNodes.map(sn => ({
      ...sn.flowNode,
      position: { x: sn.x ?? 0, y: sn.y ?? 0 },
    }));
    setNodes(() => applyForceFilter(initialNodes, mIds, isFilt, fMode));

    const simulation = forceSimulation(simNodes)
      .force(
        'link',
        forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
          .id(d => d.id)
          .distance(120)
          .strength(0.2),
      )
      .force('charge', forceManyBody().strength(-250).distanceMax(500))
      .force('center', forceCenter(0, 0).strength(0.03))
      .force('collide', forceCollide(50).strength(0.5))
      .alphaDecay(0.03) // settle faster (default is 0.0228)
      .velocityDecay(0.5) // more damping to prevent flinging
      .on('tick', scheduleUpdate);

    simRef.current = simulation;

    return () => {
      simulation.stop();
      simRef.current = null;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, graphData, scheduleUpdate, setEdges, setNodes]);

  // When filter params change, dynamically adjust forces to compact visible nodes
  // and re-apply visual filter without restarting the simulation
  useEffect(() => {
    if (!active || !graphData) return;
    const sim = simRef.current;

    // Re-filter nodes by triggering an immediate position update
    const simNodes = simNodesRef.current;
    let visibleNodes: Node[] = [];
    if (simNodes.length > 0) {
      const updated = simNodes.map(sn => ({
        ...sn.flowNode,
        position: { x: sn.x ?? 0, y: sn.y ?? 0 },
      }));
      visibleNodes = applyForceFilter(updated, matchingIds, isFiltering, filterMode);
      setNodes(() => visibleNodes);
    }

    // Re-filter edges — use actual visible node IDs (not just matchingIds) to prevent orphans
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    let filteredEdges = applyForceEdgeFilter(rawEdgesRef.current, matchingIds, isFiltering, filterMode);
    filteredEdges = filteredEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
    setEdges(filteredEdges);

    // Dynamically adjust simulation forces to pull visible nodes together
    if (sim && isFiltering && filterMode === 'hide') {
      // Compute centroid of visible nodes so compaction centers on them
      let cx = 0, cy = 0, count = 0;
      for (const sn of simNodes) {
        if (matchingIds.has(sn.id)) {
          cx += sn.x ?? 0;
          cy += sn.y ?? 0;
          count++;
        }
      }
      if (count > 0) {
        cx /= count;
        cy /= count;
      }

      // Per-node charge: hidden nodes have zero charge so they don't push visible ones apart
      sim.force('charge', forceManyBody<ForceNode>()
        .strength((d: ForceNode) => matchingIds.has(d.id) ? -100 : 0)
        .distanceMax(300),
      );
      sim.force('center', forceCenter(cx, cy).strength(0.08));
      sim.force('collide', forceCollide<ForceNode>(
        (d: ForceNode) => matchingIds.has(d.id) ? 50 : 0,
      ).strength(0.7));

      // Pin non-visible nodes in place so they don't interfere
      for (const sn of simNodes) {
        if (!matchingIds.has(sn.id)) {
          sn.fx = sn.x;
          sn.fy = sn.y;
        } else {
          sn.fx = null;
          sn.fy = null;
        }
      }

      // Reheat to animate the compaction
      sim.alpha(0.4).restart();
    } else if (sim && !isFiltering) {
      // Restore default forces when filter is cleared
      sim.force('charge', forceManyBody().strength(-250).distanceMax(500));
      sim.force('center', forceCenter(0, 0).strength(0.03));
      sim.force('collide', forceCollide(50).strength(0.5));

      // Unpin all nodes
      for (const sn of simNodes) {
        sn.fx = null;
        sn.fy = null;
      }

      sim.alpha(0.3).restart();
    }
  }, [active, graphData, matchingIds, isFiltering, filterMode, setNodes, setEdges]);

  const onNodeDrag: NodeDragHandler = useCallback((_evt, node) => {
    const sim = simRef.current;
    if (!sim || !active) return;

    // Pin the dragged node to its current position
    const simNode = nodeMapRef.current.get(node.id);
    if (simNode) {
      simNode.fx = node.position.x;
      simNode.fy = node.position.y;
      simNode.x = node.position.x;
      simNode.y = node.position.y;
    }

    // Gently reheat — lower target so it doesn't go crazy
    sim.alphaTarget(0.15).restart();
  }, [active]);

  const onNodeDragStop: NodeDragHandler = useCallback((_evt, _node) => {
    const sim = simRef.current;
    if (!sim || !active) return;

    // Unpin all nodes (the dragged one)
    for (const sn of simNodesRef.current) {
      if (sn.fx != null) {
        sn.fx = null;
        sn.fy = null;
      }
    }

    // Let the simulation cool down
    sim.alphaTarget(0);
  }, [active]);

  return { onNodeDrag, onNodeDragStop };
}
