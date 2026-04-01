import type { Node } from 'reactflow';
import type { OmniNode, OmniEdge } from '../types';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge, NODE_WIDTH, NODE_HEIGHT } from './shared';

// ─── Column Classification ──────────────────────────────────────────

export type ColumnId = 'frontend' | 'api' | 'services' | 'database';

const COLUMN_ORDER: Record<ColumnId, number> = {
  frontend: 0,
  api: 1,
  services: 2,
  database: 3,
};

const COLUMN_LABELS: Record<ColumnId, string> = {
  frontend: 'Frontend',
  api: 'API / Routes',
  services: 'Services / Libs',
  database: 'Database',
};

const COLUMN_HEADER_COLORS: Record<ColumnId, string> = {
  frontend: '#171717',
  api: '#0070f3',
  services: '#f5a623',
  database: '#336791',
};

/** Node types → column (exact match, highest confidence) */
const TYPE_TO_COLUMN: Record<string, ColumnId> = {
  // Database
  'db-table': 'database',
  'db-collection': 'database',
  'db-view': 'database',
  'python-django-model': 'database',
  'php-laravel-model': 'database',
  // API / Routes
  'nestjs-controller': 'api',
  'nextjs-api-route': 'api',
  'python-fastapi-route': 'api',
  'python-django-view': 'api',
  'php-laravel-controller': 'api',
  'php-laravel-route': 'api',
  // Frontend
  'nextjs-page': 'frontend',
  'nextjs-layout': 'frontend',
  // Services
  'nestjs-injectable': 'services',
  'nestjs-module': 'services',
  'php-laravel-middleware': 'services',
};

/** Path patterns for fallback classification */
const PATH_PATTERNS: Array<{ pattern: RegExp; column: ColumnId }> = [
  // Database-related paths
  { pattern: /\/(prisma|drizzle|migrations?|seeds?)\//i, column: 'database' },
  { pattern: /\/models?\//i, column: 'database' },
  { pattern: /\/entit(y|ies)\//i, column: 'database' },
  // API paths
  { pattern: /\/api\/.*route\.\w+$/i, column: 'api' },
  { pattern: /\/controllers?\//i, column: 'api' },
  { pattern: /\/routes?\//i, column: 'api' },
  { pattern: /\/endpoints?\//i, column: 'api' },
  // Frontend paths
  { pattern: /\/components?\//i, column: 'frontend' },
  { pattern: /\/pages?\//i, column: 'frontend' },
  { pattern: /\/views?\//i, column: 'frontend' },
  { pattern: /\/layouts?\//i, column: 'frontend' },
  { pattern: /\/app\/.*page\.\w+$/i, column: 'frontend' },
  // Services / libs
  { pattern: /\/(lib|libs|utils?|helpers?|services?|hooks?|middleware)\//i, column: 'services' },
];

function classifyNode(node: OmniNode): ColumnId {
  // 1. Exact type match
  const byType = TYPE_TO_COLUMN[node.type];
  if (byType) return byType;

  // 2. File path heuristic
  const fp = (node.metadata.filePath ?? node.id).replace(/\\/g, '/');
  for (const { pattern, column } of PATH_PATTERNS) {
    if (pattern.test(fp)) return column;
  }

  // 3. Default
  return 'services';
}

// ─── Directory Group Extraction ─────────────────────────────────────

function extractDirectoryGroup(node: OmniNode): string {
  const fp = (node.metadata.filePath ?? node.id).replace(/\\/g, '/');

  // Next.js App Router: app/(group)/... or app/segment/...
  const appMatch = fp.match(/\/app\/(\([^)]+\)|[^/]+)\//);
  if (appMatch) return appMatch[1].replace(/[()]/g, '');

  // Next.js Pages Router: pages/segment/...
  const pagesMatch = fp.match(/\/pages\/([^/]+)\//);
  if (pagesMatch && pagesMatch[1] !== 'api') return pagesMatch[1];

  // Generic: first meaningful directory segment
  const parts = fp.split('/').filter(Boolean);
  // Find the src/ or first meaningful directory
  const srcIdx = parts.indexOf('src');
  const startIdx = srcIdx >= 0 ? srcIdx + 1 : Math.max(0, parts.length - 3);
  return parts[startIdx] ?? 'root';
}

// ─── Row Assignment ─────────────────────────────────────────────────

interface RowInfo {
  row: number;
  group: string;
}

function assignRows(
  nodes: OmniNode[],
  edges: OmniEdge[],
  columnMap: Map<string, ColumnId>,
): { rowMap: Map<string, RowInfo>; groups: string[] } {
  // Build adjacency lists
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // Find root nodes: frontend nodes or API nodes with no incoming from a prior column
  const nodeSet = new Set(nodes.map(n => n.id));
  const roots: OmniNode[] = [];
  for (const node of nodes) {
    const col = columnMap.get(node.id)!;
    if (col === 'frontend') {
      roots.push(node);
    } else if (col === 'api') {
      const incomers = (incoming.get(node.id) ?? []).filter(id => nodeSet.has(id));
      const hasUpstreamFrontend = incomers.some(
        id => COLUMN_ORDER[columnMap.get(id) ?? 'services'] < COLUMN_ORDER.api,
      );
      if (!hasUpstreamFrontend) roots.push(node);
    }
  }

  // Collect flow paths via DFS from each root (following edges toward higher column order)
  const paths: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    path.push(nodeId);
    const col = COLUMN_ORDER[columnMap.get(nodeId) ?? 'services'];
    const neighbors = (outgoing.get(nodeId) ?? []).filter(id => {
      if (!nodeSet.has(id)) return false;
      const nCol = COLUMN_ORDER[columnMap.get(id) ?? 'services'];
      return nCol >= col; // only follow forward or same-column edges
    });

    let extended = false;
    for (const n of neighbors) {
      if (!path.includes(n)) {
        dfs(n, [...path]);
        extended = true;
      }
    }
    if (!extended) {
      paths.push([...path]);
    }
  }

  for (const root of roots) {
    dfs(root.id, []);
  }

  // Group paths by directory of root node
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const groupedPaths = new Map<string, string[][]>();
  for (const path of paths) {
    const rootNode = nodeById.get(path[0]);
    const group = rootNode ? extractDirectoryGroup(rootNode) : 'other';
    if (!groupedPaths.has(group)) groupedPaths.set(group, []);
    groupedPaths.get(group)!.push(path);
  }

  // Sort groups alphabetically
  const sortedGroups = Array.from(groupedPaths.keys()).sort();

  // Assign rows — each unique node gets the row of its first occurrence
  const rowMap = new Map<string, RowInfo>();
  let currentRow = 0;

  for (const group of sortedGroups) {
    const groupPaths = groupedPaths.get(group)!;
    // Sort paths by their root node label
    groupPaths.sort((a, b) => {
      const aLabel = nodeById.get(a[0])?.label ?? '';
      const bLabel = nodeById.get(b[0])?.label ?? '';
      return aLabel.localeCompare(bLabel);
    });

    for (const path of groupPaths) {
      let usedNewRow = false;
      for (const nodeId of path) {
        if (!rowMap.has(nodeId)) {
          rowMap.set(nodeId, { row: currentRow, group });
          usedNewRow = true;
        }
      }
      if (usedNewRow) currentRow++;
    }
  }

  // Place orphan nodes (not in any flow path)
  for (const node of nodes) {
    if (!rowMap.has(node.id)) {
      const group = extractDirectoryGroup(node);
      rowMap.set(node.id, { row: currentRow, group });
      currentRow++;
    }
  }

  return { rowMap, groups: sortedGroups };
}

// ─── Layout Function ────────────────────────────────────────────────

const COLUMN_GAP = 280;        // Horizontal gap between column centers
const ROW_HEIGHT = 56;          // Vertical spacing between rows
const GROUP_GAP = 32;           // Extra vertical gap between directory groups
const HEADER_HEIGHT = 48;       // Space for column headers at top
const LEFT_MARGIN = 40;

export const columnsLayout: LayoutFunction = ({ nodes, edges }) => {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  // 1. Classify nodes into columns
  const columnMap = new Map<string, ColumnId>();
  for (const node of nodes) {
    columnMap.set(node.id, classifyNode(node));
  }

  // 2. Edge-based refinement: if a "services" node only connects to one column, move it closer
  for (const node of nodes) {
    if (columnMap.get(node.id) !== 'services') continue;
    const neighbors = new Set<ColumnId>();
    for (const e of edges) {
      if (e.source === node.id && columnMap.has(e.target)) {
        neighbors.add(columnMap.get(e.target)!);
      }
      if (e.target === node.id && columnMap.has(e.source)) {
        neighbors.add(columnMap.get(e.source)!);
      }
    }
    // If all neighbors are in the same non-services column, stay in services (architectural clarity)
    // But if neighbors span frontend+api, keep in services (it's a shared util)
  }

  // 3. Assign rows
  const { rowMap, groups } = assignRows(nodes, edges, columnMap);

  // 4. Calculate column X positions
  const columnX: Record<ColumnId, number> = {
    frontend: LEFT_MARGIN,
    api: LEFT_MARGIN + COLUMN_GAP,
    services: LEFT_MARGIN + COLUMN_GAP * 2,
    database: LEFT_MARGIN + COLUMN_GAP * 3,
  };

  // 5. Build group offset map (add extra Y gap between groups)
  const groupStartRow = new Map<string, number>();
  let prevGroup = '';
  let extraY = 0;
  const rowYOffset = new Map<number, number>();

  // Collect all used rows sorted
  const allRows = new Map<number, string>(); // row → group
  for (const [, info] of rowMap) {
    if (!allRows.has(info.row) || allRows.get(info.row) === info.group) {
      allRows.set(info.row, info.group);
    }
  }
  const sortedRows = Array.from(allRows.entries()).sort((a, b) => a[0] - b[0]);

  for (const [row, group] of sortedRows) {
    if (group !== prevGroup && prevGroup !== '') {
      extraY += GROUP_GAP;
      if (!groupStartRow.has(group)) groupStartRow.set(group, row);
    }
    if (!groupStartRow.has(group)) groupStartRow.set(group, row);
    rowYOffset.set(row, extraY);
    prevGroup = group;
  }

  // 6. Create column header nodes
  const headerNodes: Node[] = (['frontend', 'api', 'services', 'database'] as ColumnId[]).map(col => ({
    id: `__col-header-${col}`,
    type: 'default',
    data: { label: COLUMN_LABELS[col] },
    position: { x: columnX[col], y: 0 },
    selectable: false,
    draggable: false,
    style: {
      background: COLUMN_HEADER_COLORS[col],
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      padding: '6px 16px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      opacity: 0.8,
      width: NODE_WIDTH,
      textAlign: 'center' as const,
    },
  }));

  // 7. Position all real nodes
  const styledNodes: Node[] = nodes.map(n => {
    const col = columnMap.get(n.id) ?? 'services';
    const info = rowMap.get(n.id) ?? { row: 0, group: '' };
    const yOffset = rowYOffset.get(info.row) ?? 0;
    const x = columnX[col];
    const y = HEADER_HEIGHT + info.row * ROW_HEIGHT + yOffset;

    return styleNode(n, { position: { x, y } });
  });

  // 8. Style edges
  const styledEdges = edges
    .filter(e => nodes.some(n => n.id === e.source) && nodes.some(n => n.id === e.target))
    .map(e => {
      const edge = styleEdge(e);
      // Cross-column edges use smoothstep for cleaner routing
      const srcCol = columnMap.get(e.source);
      const tgtCol = columnMap.get(e.target);
      if (srcCol !== tgtCol) {
        return { ...edge, type: 'smoothstep' };
      }
      return edge;
    });

  return {
    nodes: [...headerNodes, ...styledNodes],
    edges: styledEdges,
  };
};
