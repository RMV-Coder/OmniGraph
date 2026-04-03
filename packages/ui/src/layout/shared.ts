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
  // Database
  'db-table': '#336791',         // PostgreSQL blue
  'db-collection': '#4DB33D',    // MongoDB green
  'db-view': '#8e44ad',          // Purple for views
  // Method-level nodes
  'method-node': '#5a5a8a',
  // API Schema
  'openapi-spec': '#85ea2d',        // Swagger green
  'graphql-schema': '#e10098',      // GraphQL pink
  // Go
  'go-file': '#00ADD8',             // Go brand cyan
  'go-main': '#00ADD8',
  'go-http-handler': '#00897B',     // Teal for HTTP handlers
  // Rust
  'rust-file': '#DEA584',           // Rust orange
  'rust-http-handler': '#B7410E',   // Darker rust for handlers
  // Java
  'java-file': '#f89820',           // Java orange
  'java-spring-controller': '#6DB33F', // Spring green
  'java-spring-service': '#68BD45',
  'java-spring-repository': '#85C440',
  'java-spring-component': '#9CCC65',
  'java-spring-config': '#558B2F',
  'java-spring-entity': '#33691E',
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
  const isFkEdge = e.id.startsWith('e-fk-');
  const isDbEdge = e.id.startsWith('e-db-');
  let stroke = '#888';
  let strokeWidth = 1;
  let strokeDasharray: string | undefined;
  let labelFill: string | undefined;

  if (isHttpEdge) {
    stroke = '#ff9800';
    strokeWidth = 2;
    strokeDasharray = '6 3';
    labelFill = '#ff9800';
  } else if (isFkEdge) {
    // FK/reference edges: solid teal line (ERD-style)
    stroke = '#2dd4bf';
    strokeWidth = 2;
    labelFill = '#2dd4bf';
  } else if (isDbEdge) {
    // Code → DB table edges: dashed blue
    stroke = '#336791';
    strokeWidth = 2;
    strokeDasharray = '4 4';
    labelFill = '#336791';
  }

  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: { omniEdge: e },
    animated: false,
    style: { stroke, strokeWidth, strokeDasharray },
    labelStyle: labelFill ? { fill: labelFill, fontSize: 10, fontWeight: 600 } : undefined,
  };
}

/** Extract directory path from a node for grouping */
export function getNodeDirectory(n: OmniNode): string {
  const fp = n.metadata.filePath ?? n.id;
  const normalized = fp.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
}
