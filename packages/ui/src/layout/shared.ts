import type { Node, Edge } from 'reactflow';
import type { OmniNode, OmniEdge } from '../types';

export const NODE_COLORS: Record<string, string> = {
  'nestjs-controller': '#e8534a',
  'nestjs-injectable': '#4a90e8',
  'nestjs-module': '#f5a623',
  'typescript-file': '#7ed321',
  'javascript-file': '#f0db4f',
};

export const NODE_WIDTH = 172;
export const NODE_HEIGHT = 36;

export function styleNode(n: OmniNode, overrides?: Partial<Node>): Node {
  return {
    id: n.id,
    data: { label: n.label, omniNode: n },
    position: { x: 0, y: 0 },
    style: {
      background: NODE_COLORS[n.type] ?? '#888',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: 600,
    },
    ...overrides,
  };
}

export function styleEdge(e: OmniEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: '#888' },
  };
}

/** Extract directory path from a node for grouping */
export function getNodeDirectory(n: OmniNode): string {
  const fp = n.metadata.filePath ?? n.id;
  const normalized = fp.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
}
