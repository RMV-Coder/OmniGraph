import { useState, useCallback, useMemo } from 'react';
import type { OmniGraph, OmniEdge, FlowTrace, FlowTraceStep, FlowStepType } from '../types';

/** Max depth for walking upstream/downstream from the focal edge */
const MAX_DEPTH = 3;
/** Max total steps to prevent overwhelming traces */
const MAX_STEPS = 20;

/**
 * Walk the graph backwards (upstream) from a node, collecting ancestors.
 * Returns steps in reverse order (furthest ancestor first).
 */
function walkUpstream(
  nodeId: string,
  graph: OmniGraph,
  edgeIndex: Map<string, OmniEdge[]>,
  visited: Set<string>,
  depth: number,
): FlowTraceStep[] {
  if (depth >= MAX_DEPTH || visited.has(nodeId)) return [];
  visited.add(nodeId);

  const steps: FlowTraceStep[] = [];
  const incomingEdges = edgeIndex.get(`target:${nodeId}`) ?? [];

  for (const edge of incomingEdges) {
    if (visited.has(edge.source)) continue;
    const sourceNode = graph.nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;

    const upstream = walkUpstream(edge.source, graph, edgeIndex, visited, depth + 1);
    steps.push(...upstream);

    steps.push({
      nodeId: edge.source,
      label: sourceNode.label,
      description: `Imports from ${sourceNode.label}`,
      edgeId: edge.id,
      type: 'caller' as FlowStepType,
    });

    if (steps.length >= MAX_STEPS) break;
  }

  return steps;
}

/**
 * Walk the graph forwards (downstream) from a node, collecting dependencies.
 */
function walkDownstream(
  nodeId: string,
  graph: OmniGraph,
  edgeIndex: Map<string, OmniEdge[]>,
  visited: Set<string>,
  depth: number,
): FlowTraceStep[] {
  if (depth >= MAX_DEPTH || visited.has(nodeId)) return [];
  visited.add(nodeId);

  const steps: FlowTraceStep[] = [];
  const outgoingEdges = edgeIndex.get(`source:${nodeId}`) ?? [];

  for (const edge of outgoingEdges) {
    if (visited.has(edge.target)) continue;
    const targetNode = graph.nodes.find(n => n.id === edge.target);
    if (!targetNode) continue;

    steps.push({
      nodeId: edge.target,
      label: targetNode.label,
      description: `Depends on ${targetNode.label}`,
      edgeId: edge.id,
      type: 'dependency' as FlowStepType,
    });

    if (steps.length >= MAX_STEPS) break;

    const downstream = walkDownstream(edge.target, graph, edgeIndex, visited, depth + 1);
    steps.push(...downstream);
  }

  return steps;
}

/**
 * Build a complete flow trace for a cross-network edge.
 */
function buildTrace(edge: OmniEdge, graph: OmniGraph): FlowTrace | null {
  const sourceNode = graph.nodes.find(n => n.id === edge.source);
  const targetNode = graph.nodes.find(n => n.id === edge.target);
  if (!sourceNode || !targetNode) return null;

  // Build edge index for fast lookup
  const edgeIndex = new Map<string, OmniEdge[]>();
  for (const e of graph.edges) {
    const sourceKey = `source:${e.source}`;
    const targetKey = `target:${e.target}`;
    if (!edgeIndex.has(sourceKey)) edgeIndex.set(sourceKey, []);
    if (!edgeIndex.has(targetKey)) edgeIndex.set(targetKey, []);
    edgeIndex.get(sourceKey)!.push(e);
    edgeIndex.get(targetKey)!.push(e);
  }

  const visited = new Set<string>();
  const steps: FlowTraceStep[] = [];

  // 1. Walk upstream from source (callers of the frontend file)
  const upstream = walkUpstream(edge.source, graph, edgeIndex, new Set(), 0);
  steps.push(...upstream);

  // 2. Source node (the file making the HTTP call)
  visited.add(edge.source);
  steps.push({
    nodeId: edge.source,
    label: sourceNode.label,
    description: `Makes ${edge.label || 'HTTP'} call`,
    edgeId: null,
    type: 'http-call',
  });

  // 3. Target node (the route handler)
  visited.add(edge.target);
  steps.push({
    nodeId: edge.target,
    label: targetNode.label,
    description: `Handles request at ${targetNode.metadata.route || edge.label || 'route'}`,
    edgeId: edge.id,
    type: 'route-handler',
  });

  // 4. Walk downstream from target (dependencies of the backend handler)
  const downstream = walkDownstream(edge.target, graph, edgeIndex, visited, 0);
  steps.push(...downstream);

  return {
    id: `trace-${edge.id}`,
    edgeId: edge.id,
    steps: steps.slice(0, MAX_STEPS),
  };
}

export function useFlowTracer(graphData: OmniGraph | null) {
  const [tracedEdge, setTracedEdge] = useState<OmniEdge | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const trace = useMemo(() => {
    if (!tracedEdge || !graphData) return null;
    return buildTrace(tracedEdge, graphData);
  }, [tracedEdge, graphData]);

  const startTrace = useCallback((edge: OmniEdge) => {
    setTracedEdge(edge);
    setCurrentStepIndex(0);
  }, []);

  const stopTrace = useCallback(() => {
    setTracedEdge(null);
    setCurrentStepIndex(0);
  }, []);

  const stepForward = useCallback(() => {
    if (!trace) return;
    setCurrentStepIndex(prev => Math.min(prev + 1, trace.steps.length - 1));
  }, [trace]);

  const stepBackward = useCallback(() => {
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((index: number) => {
    if (!trace) return;
    setCurrentStepIndex(Math.max(0, Math.min(index, trace.steps.length - 1)));
  }, [trace]);

  const currentStep = trace?.steps[currentStepIndex] ?? null;

  return {
    trace,
    currentStepIndex,
    currentStep,
    startTrace,
    stopTrace,
    stepForward,
    stepBackward,
    goToStep,
    isTracing: trace !== null,
  };
}
