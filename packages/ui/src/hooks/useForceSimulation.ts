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
import type { Node, NodeDragHandler } from 'reactflow';
import type { OmniGraph } from '../types';
import { styleNode, styleEdge } from '../layout/shared';

interface ForceNode extends SimulationNodeDatum {
  id: string;
  flowNode: Node;
}

interface UseForceSimulationOptions {
  graphData: OmniGraph | null;
  active: boolean;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setEdges: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useForceSimulation({ graphData, active, setNodes, setEdges }: UseForceSimulationOptions) {
  const simRef = useRef<Simulation<ForceNode, SimulationLinkDatum<ForceNode>> | null>(null);
  const simNodesRef = useRef<ForceNode[]>([]);
  const nodeMapRef = useRef<Map<string, ForceNode>>(new Map());
  const rafRef = useRef<number | null>(null);
  const needsUpdateRef = useRef(false);

  // Flush simulation positions to React Flow via rAF (throttled to ~60fps)
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current != null) return; // already scheduled
    needsUpdateRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!needsUpdateRef.current) return;
      needsUpdateRef.current = false;
      const simNodes = simNodesRef.current;
      setNodes((prev) => {
        // If lengths differ, rebuild; otherwise update positions in-place
        if (prev.length !== simNodes.length) {
          return simNodes.map(sn => ({
            ...sn.flowNode,
            position: { x: sn.x ?? 0, y: sn.y ?? 0 },
          }));
        }
        return prev.map((node, i) => {
          const sn = simNodes[i];
          const nx = sn.x ?? 0;
          const ny = sn.y ?? 0;
          // Skip update if position hasn't changed meaningfully
          if (
            Math.abs(node.position.x - nx) < 0.1 &&
            Math.abs(node.position.y - ny) < 0.1
          ) {
            return node;
          }
          return { ...node, position: { x: nx, y: ny } };
        });
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

    // Set edges once (edge routing is handled by React Flow based on node positions)
    setEdges(validEdges.map(styleEdge));

    // Set initial node positions immediately so React Flow has something to render
    setNodes(() =>
      simNodes.map(sn => ({
        ...sn.flowNode,
        position: { x: sn.x ?? 0, y: sn.y ?? 0 },
      })),
    );

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
