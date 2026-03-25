import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeMouseHandler,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import type { OmniGraph, OmniNode, OmniEdge, HttpMethod } from './types';
import Sidebar from './components/Sidebar';
import type { SidebarTab } from './components/Sidebar';
import DirectoryGroupNode from './components/DirectoryGroupNode';
import { applyLayout } from './layout';
import type { LayoutPreset, MindmapDirection } from './layout';
import { NODE_COLORS } from './layout/shared';
import { useForceSimulation } from './hooks/useForceSimulation';
import { useExport } from './hooks/useExport';
import { useApiClient } from './hooks/useApiClient';
import { useFlowTracer } from './hooks/useFlowTracer';

const nodeTypes = { directoryGroup: DirectoryGroupNode };

/** Determine which node IDs match the current search + type filters */
function getMatchingIds(
  graphData: OmniGraph,
  searchQuery: string,
  activeTypes: Set<string>,
): Set<string> {
  const query = searchQuery.toLowerCase();
  const ids = new Set<string>();
  for (const n of graphData.nodes) {
    if (!activeTypes.has(n.type)) continue;
    if (query && !n.label.toLowerCase().includes(query) && !n.id.toLowerCase().includes(query)) continue;
    ids.add(n.id);
  }
  return ids;
}

/** Apply dim/highlight styling to nodes based on matching IDs */
function applyFilterStyles(
  nodes: Node[],
  edges: Edge[],
  matchingIds: Set<string>,
  isFiltering: boolean,
): { nodes: Node[]; edges: Edge[] } {
  if (!isFiltering) return { nodes, edges };

  const styledNodes = nodes.map(node => {
    if (node.type === 'directoryGroup') return node;
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

  const styledEdges = edges.map(edge => {
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

  return { nodes: styledNodes, edges: styledEdges };
}

/** Apply trace highlight styling when flow tracer is active */
function applyTraceStyles(
  nodes: Node[],
  edges: Edge[],
  traceNodeId: string | null,
  traceEdgeId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  if (!traceNodeId) return { nodes, edges };

  const styledNodes = nodes.map(node => {
    if (node.type === 'directoryGroup') return node;
    const isCurrent = node.id === traceNodeId;
    return {
      ...node,
      style: {
        ...node.style,
        opacity: isCurrent ? 1 : 0.25,
        boxShadow: isCurrent ? '0 0 16px 4px rgba(74, 144, 232, 0.6)' : undefined,
        transition: 'opacity 0.3s, box-shadow 0.3s',
      },
    };
  });

  const styledEdges = edges.map(edge => {
    const isTraced = edge.id === traceEdgeId;
    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: isTraced ? 1 : 0.1,
        strokeWidth: isTraced ? 3 : (edge.style?.strokeWidth ?? 1),
        transition: 'opacity 0.3s, stroke-width 0.3s',
      },
      animated: isTraced,
    };
  });

  return { nodes: styledNodes, edges: styledEdges };
}

function GraphApp() {
  const [graphData, setGraphData] = useState<OmniGraph | null>(null);
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('directory');
  const [mindmapDirection, setMindmapDirection] = useState<MindmapDirection>('LR');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<OmniNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<SidebarTab>('controls');
  const { fitView } = useReactFlow();

  const [layoutNodes, setLayoutNodes] = useState<Node[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);

  const isForceActive = layoutPreset === 'force';
  const { onNodeDrag: forceDrag, onNodeDragStop: forceDragStop } = useForceSimulation({
    graphData,
    active: isForceActive,
    setNodes,
    setEdges,
  });

  const { exportPng, exportSvg, exportJson } = useExport(graphData);
  const apiClient = useApiClient();
  const flowTracer = useFlowTracer(graphData);

  const availableTypes = useMemo(() => {
    if (!graphData) return [];
    const types = new Set(graphData.nodes.map(n => n.type));
    return Array.from(types).sort();
  }, [graphData]);

  useEffect(() => {
    if (availableTypes.length > 0 && activeTypes.size === 0) {
      setActiveTypes(new Set(availableTypes));
    }
  }, [availableTypes]);

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((data: OmniGraph) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!graphData) return;
    if (isForceActive) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      setTimeout(() => fitView({ padding: 0.1 }), 200);
      return;
    }
    const options = { mindmapDirection };
    const result = applyLayout(layoutPreset, graphData, options);
    setLayoutNodes(result.nodes);
    setLayoutEdges(result.edges);
    setTimeout(() => fitView({ padding: 0.1 }), 50);
  }, [graphData, layoutPreset, mindmapDirection]);

  // Apply filter + trace styles
  useEffect(() => {
    if (!graphData || isForceActive) return;
    const isFiltering = searchQuery !== '' || activeTypes.size !== availableTypes.length;
    const matchingIds = getMatchingIds(graphData, searchQuery, activeTypes);

    let { nodes: styled, edges: styledEdges } = applyFilterStyles(
      layoutNodes, layoutEdges, matchingIds, isFiltering,
    );

    // Overlay trace highlighting when active
    if (flowTracer.isTracing && flowTracer.currentStep) {
      const result = applyTraceStyles(
        styled, styledEdges,
        flowTracer.currentStep.nodeId,
        flowTracer.currentStep.edgeId,
      );
      styled = result.nodes;
      styledEdges = result.edges;
    }

    setNodes(styled);
    setEdges(styledEdges);
  }, [layoutNodes, layoutEdges, searchQuery, activeTypes, availableTypes, isForceActive,
      flowTracer.isTracing, flowTracer.currentStep]);

  const matchCount = useMemo(() => {
    if (!graphData) return 0;
    return getMatchingIds(graphData, searchQuery, activeTypes).size;
  }, [graphData, searchQuery, activeTypes]);

  const handleTypeToggle = useCallback((type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.data.omniNode) {
      setSelected(node.data.omniNode as OmniNode);
      setActiveTab('controls');
    }
  }, []);

  const onEdgeClick = useCallback((_evt: React.MouseEvent, edge: Edge) => {
    // For cross-network edges, open the API client with pre-filled data
    if (edge.id.startsWith('e-http-') && edge.data?.omniEdge) {
      const omniEdge = edge.data.omniEdge as OmniEdge;
      // Parse method + URL from edge label (format: "GET /api/users")
      const parts = omniEdge.label.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
      if (parts) {
        apiClient.prefill(parts[1].toUpperCase() as HttpMethod, parts[2]);
      } else {
        apiClient.prefill('GET', omniEdge.label);
      }
      setActiveTab('api-client');

      // Also start a flow trace
      flowTracer.startTrace(omniEdge);
    }
  }, [apiClient, flowTracer]);

  const onPaneClick = useCallback(() => {
    setSelected(null);
  }, []);

  /** Switch from flow tracer to API client with data from the traced edge */
  const handleFlowOpenInApiClient = useCallback(() => {
    if (flowTracer.trace) {
      const httpStep = flowTracer.trace.steps.find(s => s.type === 'http-call');
      if (httpStep) {
        const parts = httpStep.description.match(/Makes\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)\s+call$/i);
        if (parts) {
          apiClient.prefill(parts[1].toUpperCase() as HttpMethod, parts[2]);
        }
      }
    }
    setActiveTab('api-client');
  }, [flowTracer.trace, apiClient]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff' }}>
        <p>Analyzing codebase&#8230;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#e8534a' }}>
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1a1a2e' }}>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDrag={isForceActive ? forceDrag : undefined}
          onNodeDragStop={isForceActive ? forceDragStop : undefined}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          minZoom={0.05}
          maxZoom={2}
          fitView
        >
          <Background color="#333" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(n) => NODE_COLORS[n.data?.omniNode?.type] ?? '#888'}
            style={{ background: '#0d0d1e' }}
          />
        </ReactFlow>
      </div>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        layoutPreset={layoutPreset}
        onLayoutChange={setLayoutPreset}
        mindmapDirection={mindmapDirection}
        onDirectionChange={setMindmapDirection}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeTypes={activeTypes}
        onTypeToggle={handleTypeToggle}
        availableTypes={availableTypes}
        matchCount={matchCount}
        totalCount={graphData?.nodes.length ?? 0}
        selectedNode={selected}
        onCloseInspector={() => setSelected(null)}
        onExportPng={exportPng}
        onExportSvg={exportSvg}
        onExportJson={exportJson}
        // API Client
        apiRequest={apiClient.request}
        apiResponse={apiClient.response}
        apiLoading={apiClient.loading}
        apiError={apiClient.error}
        onApiMethodChange={apiClient.setMethod}
        onApiUrlChange={apiClient.setUrl}
        onApiSetHeader={apiClient.setHeader}
        onApiRemoveHeader={apiClient.removeHeader}
        onApiSetQueryParam={apiClient.setQueryParam}
        onApiRemoveQueryParam={apiClient.removeQueryParam}
        onApiBodyChange={apiClient.setBody}
        onApiSend={apiClient.send}
        onApiReset={apiClient.reset}
        // Flow Tracer
        flowTrace={flowTracer.trace}
        flowCurrentStepIndex={flowTracer.currentStepIndex}
        onFlowStepForward={flowTracer.stepForward}
        onFlowStepBackward={flowTracer.stepBackward}
        onFlowGoToStep={flowTracer.goToStep}
        onFlowStop={() => {
          flowTracer.stopTrace();
          setActiveTab('controls');
        }}
        onFlowOpenInApiClient={handleFlowOpenInApiClient}
      />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <GraphApp />
    </ReactFlowProvider>
  );
}
