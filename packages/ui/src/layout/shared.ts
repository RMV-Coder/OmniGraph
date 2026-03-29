import type { Node, Edge } from 'reactflow';
import type { OmniNode, OmniEdge } from '../types';

export const NODE_COLORS: Record<string, string> = {
  // TypeScript / JavaScript
  'nestjs-controller': '#e8534a',
  'nestjs-injectable': '#4a90e8',
  'nestjs-module': '#f5a623',
  'typescript-file': '#7ed321',
  'javascript-file': '#f0db4f',
  // Next.js
  'nextjs-api-route': '#0070f3',  // Next.js brand blue
  'nextjs-page': '#171717',       // Next.js dark
  'nextjs-layout': '#383838',     // Darker gray for layouts
  // Python
  'python-file': '#3776ab',
  'python-fastapi-route': '#009688',
  'python-django-view': '#092e20',
  'python-django-model': '#44b78b',
  // Markdown / Obsidian
  'markdown-file': '#7c3aed',       // Purple
  'markdown-moc': '#a855f7',        // Lighter purple for Maps of Content
  'markdown-daily': '#6d28d9',      // Darker purple for daily notes
  'markdown-readme': '#8b5cf6',     // Mid purple for README
  // PHP
  'php-file': '#777bb4',
  'php-laravel-controller': '#ff2d20',
  'php-laravel-model': '#f4645f',
  'php-laravel-middleware': '#fb503b',
  'php-laravel-route': '#ff7043',
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
  const isHttpEdge = e.id.startsWith('e-http-');
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: { omniEdge: e },
    animated: true,
    style: {
      stroke: isHttpEdge ? '#ff9800' : '#888',
      strokeWidth: isHttpEdge ? 2 : 1,
      strokeDasharray: isHttpEdge ? '6 3' : undefined,
    },
    labelStyle: isHttpEdge ? { fill: '#ff9800', fontSize: 10, fontWeight: 600 } : undefined,
  };
}

/** Extract directory path from a node for grouping */
export function getNodeDirectory(n: OmniNode): string {
  const fp = n.metadata.filePath ?? n.id;
  const normalized = fp.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
}
