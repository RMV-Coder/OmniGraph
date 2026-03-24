import React from 'react';
import ReactFlow, { Background, Controls, MiniMap, Node, Edge } from 'reactflow';

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
}

const NODE_COLORS: Record<string, string> = {
  'nestjs-controller': '#e8534a',
  'nestjs-injectable': '#4a90e8',
  'nestjs-module': '#f5a623',
  'typescript-file': '#7ed321',
};

export default function Graph({ nodes, edges, onNodeClick }: Props) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={(_evt, node) => onNodeClick?.(node)}
      fitView
    >
      <Background color="#333" gap={16} />
      <Controls />
      <MiniMap
        nodeColor={(n) => NODE_COLORS[n.data?.omniNode?.type] ?? '#888'}
        style={{ background: '#0d0d1e' }}
      />
    </ReactFlow>
  );
}
