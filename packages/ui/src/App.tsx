import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  NodeMouseHandler,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import { OmniGraph, OmniNode } from './types';
import NodeInspector from './components/NodeInspector';

const NODE_COLORS: Record<string, string> = {
  'nestjs-controller': '#e8534a',
  'nestjs-injectable': '#4a90e8',
  'nestjs-module': '#f5a623',
  'typescript-file': '#7ed321',
};

function toFlowNodes(omniNodes: OmniNode[]): Node[] {
  return omniNodes.map((n, i) => ({
    id: n.id,
    data: { label: n.label, omniNode: n },
    position: { x: (i % 8) * 200, y: Math.floor(i / 8) * 150 },
    style: {
      background: NODE_COLORS[n.type] ?? '#888',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: 600,
    },
  }));
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<OmniNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((data: OmniGraph) => {
        setNodes(toFlowNodes(data.nodes));
        setEdges(
          data.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: true,
            style: { stroke: '#888' },
          }))
        );
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelected(node.data.omniNode as OmniNode);
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
      {selected && (
        <NodeInspector node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
