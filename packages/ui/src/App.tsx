import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeMouseHandler,
  NodeDragHandler,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import type { OmniGraph, OmniNode } from './types';
import Sidebar from './components/Sidebar';
import DirectoryGroupNode from './components/DirectoryGroupNode';
import { applyLayout } from './layout';
import type { LayoutPreset, MindmapDirection } from './layout';
import { NODE_COLORS } from './layout/shared';
import { useForceSimulation } from './hooks/useForceSimulation';

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
    // Force layout is handled by the live simulation hook
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

  useEffect(() => {
    if (!graphData || isForceActive) return;
    const isFiltering = searchQuery !== '' || activeTypes.size !== availableTypes.length;
    const matchingIds = getMatchingIds(graphData, searchQuery, activeTypes);
    const { nodes: styled, edges: styledEdges } = applyFilterStyles(
      layoutNodes, layoutEdges, matchingIds, isFiltering,
    );
    setNodes(styled);
    setEdges(styledEdges);
  }, [layoutNodes, layoutEdges, searchQuery, activeTypes, availableTypes, isForceActive]);

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
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelected(null);
  }, []);

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
