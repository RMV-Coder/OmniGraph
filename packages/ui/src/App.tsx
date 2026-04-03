import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import {
  forceSimulation as d3ForceSimulation,
  forceCenter as d3ForceCenter,
  forceManyBody as d3ForceManyBody,
  forceCollide as d3ForceCollide,
  forceLink as d3ForceLink,
} from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { OmniGraph, OmniNode, OmniEdge, HttpMethod, DatabaseSchema, DatabaseTable, MethodInfo } from './types';
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
import { useSettings } from './hooks/useSettings';
import { useDatabase } from './hooks/useDatabase';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts, SHORTCUT_LIST } from './hooks/useKeyboardShortcuts';
import { useBookmarks } from './hooks/useBookmarks';
import { useAnnotations } from './hooks/useAnnotations';

const nodeTypes = { directoryGroup: DirectoryGroupNode };

export type SearchFilterMode = 'hide' | 'dim';

/** CSS injected when compacting so React Flow node transforms animate smoothly */
const COMPACT_TRANSITION_CSS = `
.compact-transition .react-flow__node {
  transition: transform 0.45s ease-out !important;
}
`;

/** Route node types that typically query databases */
const ROUTE_NODE_TYPES = new Set([
  'nextjs-api-route', 'python-fastapi-route', 'php-laravel-controller',
  'nestjs-controller', 'python-django-view',
]);

/** Normalize a name for fuzzy table matching: lowercase, strip separators */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[-_\s]/g, '');
}

/** Simple pluralize: 'user' → ['users', 'useres', 'useries', 'user'] */
function pluralVariants(base: string): string[] {
  const variants = [base, base + 's', base + 'es'];
  if (base.endsWith('y')) variants.push(base.slice(0, -1) + 'ies');
  if (base.endsWith('s')) variants.push(base.slice(0, -1));
  if (base.endsWith('es')) variants.push(base.slice(0, -2));
  if (base.endsWith('ies')) variants.push(base.slice(0, -3) + 'y');
  return variants;
}

/**
 * Merge database schema entities into the code graph.
 * Creates OmniNode entries for each table/collection, FK edges between tables,
 * and OmniEdge entries linking code/route nodes to the DB tables they reference.
 */
function mergeDbSchema(
  codeGraph: OmniGraph,
  schema: DatabaseSchema | null,
): OmniGraph {
  if (!schema || schema.tables.length === 0) return codeGraph;

  const dbNodes: OmniNode[] = [];
  const dbEdges: OmniEdge[] = [];
  const addedEdgeIds = new Set<string>();

  const addEdge = (edge: OmniEdge) => {
    if (!addedEdgeIds.has(edge.id)) {
      addedEdgeIds.add(edge.id);
      dbEdges.push(edge);
    }
  };

  // ── 1. Create DB table/collection nodes ──
  const dbNodeIds = new Map<string, string>(); // "schema.tableName" → nodeId
  const tableNameToNodeId = new Map<string, string>(); // lowercase table name → nodeId

  for (const table of schema.tables) {
    const nodeType =
      table.type === 'collection' ? 'db-collection' :
      table.type === 'view' ? 'db-view' : 'db-table';

    const schemaPrefix = table.schema && table.schema !== 'public' ? `${table.schema}.` : '';
    const nodeId = `db://${schema.engine}/${schema.database}/${table.schema ?? 'default'}/${table.name}`;

    dbNodes.push({
      id: nodeId,
      type: nodeType,
      label: `${schemaPrefix}${table.name}`,
      metadata: {
        engine: schema.engine,
        database: schema.database,
        schema: table.schema ?? '',
        columns: table.columns.map((c) => c.name).join(', '),
        columnCount: String(table.columns.length),
        rowCount: table.rowCount != null ? String(table.rowCount) : '',
        indexCount: String(table.indexes.length),
        foreignKeyCount: String(table.foreignKeys?.length ?? 0),
      },
    });

    const key = `${table.schema ?? 'default'}.${table.name}`;
    dbNodeIds.set(key, nodeId);
    tableNameToNodeId.set(table.name.toLowerCase(), nodeId);
  }

  // ── 2. Create FK/reference edges between DB tables (ERD-style) ──
  for (const table of schema.tables) {
    const sourceKey = `${table.schema ?? 'default'}.${table.name}`;
    const sourceNodeId = dbNodeIds.get(sourceKey);
    if (!sourceNodeId) continue;

    for (const fk of table.foreignKeys ?? []) {
      const targetKey = `${fk.referencedSchema ?? table.schema ?? 'default'}.${fk.referencedTable}`;
      const targetNodeId = dbNodeIds.get(targetKey) ?? tableNameToNodeId.get(fk.referencedTable.toLowerCase());
      if (!targetNodeId) continue;

      const fkLabel = `${fk.columns.join(',')} → ${fk.referencedTable}.${fk.referencedColumns.join(',')}`;
      addEdge({
        id: `e-fk-${fk.name}`,
        source: sourceNodeId,
        target: targetNodeId,
        label: fkLabel,
      });
    }
  }

  // ── 3. Match code nodes to DB tables ──
  for (const codeNode of codeGraph.nodes) {
    // 3a. Explicit metadata (dbTables field from parsers)
    const dbTablesStr = codeNode.metadata.dbTables;
    if (dbTablesStr) {
      for (const tableName of dbTablesStr.split(',').map((s) => s.trim().toLowerCase())) {
        const dbNodeId = tableNameToNodeId.get(tableName);
        if (dbNodeId) {
          addEdge({
            id: `e-db-${codeNode.id}-${dbNodeId}`,
            source: codeNode.id,
            target: dbNodeId,
            label: 'queries',
          });
        }
      }
    }

    // 3b. Model/entity types → match label to table name
    const isModelType =
      codeNode.type === 'python-django-model' ||
      codeNode.type === 'php-laravel-model';

    if (isModelType) {
      const normalized = normalizeName(codeNode.label);
      for (const [tName, tNodeId] of tableNameToNodeId) {
        const tNorm = normalizeName(tName);
        if (pluralVariants(normalized).includes(tNorm) || pluralVariants(tNorm).includes(normalized)) {
          addEdge({
            id: `e-db-${codeNode.id}-${tNodeId}`,
            source: codeNode.id,
            target: tNodeId,
            label: 'queries',
          });
        }
      }
    }

    // 3c. API route nodes → match route path segments to table names
    if (ROUTE_NODE_TYPES.has(codeNode.type)) {
      const route = codeNode.metadata.route ?? codeNode.label;
      // Extract path segments: "/api/users/[id]/posts" → ["users", "posts"]
      const segments = route.split('/')
        .map((s: string) => s.replace(/[\[\]\(\)\{\}:*]/g, '').toLowerCase())
        .filter((s: string) => s && s !== 'api' && s !== 'v1' && s !== 'v2' && s !== 'v3');

      for (const seg of segments) {
        const segNorm = normalizeName(seg);
        for (const [tName, tNodeId] of tableNameToNodeId) {
          const tNorm = normalizeName(tName);
          if (pluralVariants(segNorm).includes(tNorm) || pluralVariants(tNorm).includes(segNorm)) {
            addEdge({
              id: `e-db-${codeNode.id}-${tNodeId}`,
              source: codeNode.id,
              target: tNodeId,
              label: 'queries',
            });
          }
        }
      }
    }
  }

  // ── 4. Follow import chains to find indirect DB references ──
  // If a code node imports a file whose name matches a DB table,
  // create a "queries" edge from that code node to the DB table.
  // Also propagate: if an API route imports lib/db/users, and users matches the users table,
  // connect the route to the users table transitively.
  const importEdges = codeGraph.edges.filter(e => e.label === 'imports');
  const importTargetIndex = new Map<string, string[]>(); // target → [source1, source2, ...]
  for (const e of importEdges) {
    if (!importTargetIndex.has(e.target)) importTargetIndex.set(e.target, []);
    importTargetIndex.get(e.target)!.push(e.source);
  }

  for (const codeNode of codeGraph.nodes) {
    // Get the filename without extension: "/project/src/lib/db/users.ts" → "users"
    const fileParts = codeNode.id.split('/');
    const filename = fileParts[fileParts.length - 1]?.replace(/\.\w+$/, '') ?? '';
    if (!filename || filename === 'index') continue;

    const fnNorm = normalizeName(filename);
    for (const [tName, tNodeId] of tableNameToNodeId) {
      const tNorm = normalizeName(tName);
      if (pluralVariants(fnNorm).includes(tNorm) || pluralVariants(tNorm).includes(fnNorm)) {
        // This code file's name matches a DB table → connect the file to the table
        addEdge({
          id: `e-db-${codeNode.id}-${tNodeId}`,
          source: codeNode.id,
          target: tNodeId,
          label: 'queries',
        });

        // Also connect any upstream importers (especially API routes) to the table
        const importers = importTargetIndex.get(codeNode.id) ?? [];
        for (const importerId of importers) {
          addEdge({
            id: `e-db-${importerId}-${tNodeId}`,
            source: importerId,
            target: tNodeId,
            label: 'queries',
          });
        }
      }
    }
  }

  return {
    nodes: [...codeGraph.nodes, ...dbNodes],
    edges: [...codeGraph.edges, ...dbEdges],
  };
}

/**
 * Expand method-level nodes for selected files.
 * Replaces file nodes in expandedIds with their individual method nodes,
 * and re-routes edges accordingly.
 */
function expandMethods(
  graph: OmniGraph,
  expandedIds: Set<string>,
): OmniGraph {
  if (expandedIds.size === 0) return graph;

  const newNodes: OmniNode[] = [];
  const newEdges: OmniEdge[] = [];
  const methodNodeIds = new Map<string, string[]>(); // fileId → [methodNodeId, ...]

  for (const node of graph.nodes) {
    if (expandedIds.has(node.id) && node.methods && node.methods.length > 0) {
      // Replace file node with its method nodes
      const mIds: string[] = [];
      for (const method of node.methods) {
        const mId = `${node.id}#${method.name}`;
        mIds.push(mId);
        const paramStr = method.params.length > 0 ? `(${method.params.join(', ')})` : '()';
        newNodes.push({
          id: mId,
          type: 'method-node',
          label: `${method.exported ? '⬆ ' : ''}${method.name}${paramStr}`,
          metadata: {
            filePath: node.metadata.filePath ?? '',
            route: node.metadata.route ?? '',
            parentFile: node.id,
            line: String(method.line),
            endLine: String(method.endLine),
            kind: method.kind,
          },
        });
      }
      methodNodeIds.set(node.id, mIds);
    } else {
      newNodes.push(node);
    }
  }

  // Re-route edges: if an edge points to/from an expanded file, redirect to all its methods
  for (const edge of graph.edges) {
    const srcMethods = methodNodeIds.get(edge.source);
    const tgtMethods = methodNodeIds.get(edge.target);

    if (srcMethods && tgtMethods) {
      // Both expanded — connect first method of source to first of target (simplified)
      newEdges.push({ ...edge, id: `${edge.id}#m`, source: srcMethods[0], target: tgtMethods[0] });
    } else if (srcMethods) {
      // Source expanded — connect all exported methods to the target
      for (const mId of srcMethods) {
        newEdges.push({ ...edge, id: `${edge.id}#${mId}`, source: mId });
      }
    } else if (tgtMethods) {
      // Target expanded — connect source to all methods
      for (const mId of tgtMethods) {
        newEdges.push({ ...edge, id: `${edge.id}#${mId}`, target: mId });
      }
    } else {
      newEdges.push(edge);
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

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

/**
 * BFS-expand from a set of seed node IDs to include connected nodes
 * up to `maxHops` away. This traces the full data flow path:
 * component → API → (database) → API response → component.
 */
function expandConnectedIds(
  seedIds: Set<string>,
  edges: OmniEdge[],
  maxHops: number,
): Set<string> {
  if (seedIds.size === 0) return seedIds;

  // Build adjacency list (bidirectional — we want upstream AND downstream)
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const result = new Set(seedIds);
  let frontier = new Set(seedIds);

  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = new Set<string>();
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!result.has(neighbor)) {
          result.add(neighbor);
          nextFrontier.add(neighbor);
        }
      }
    }
    if (nextFrontier.size === 0) break;
    frontier = nextFrontier;
  }

  return result;
}

/**
 * Hub-centric compaction: finds the node(s) with the most edges and uses
 * them as the anchor point. Single hub → stays pinned, everything gravitates
 * toward it. Multiple hubs (tied edge count) → they meet at their average
 * position and everything gravitates there. Leaf nodes pull in via link forces.
 */
interface CompactSimNode extends SimulationNodeDatum {
  id: string;
  isHub?: boolean;
}

function compactNodes(visibleNodes: Node[], visibleEdges: Edge[]): Node[] {
  if (visibleNodes.length <= 1) return visibleNodes;

  const nodeIdSet = new Set(visibleNodes.map(n => n.id));
  const links = visibleEdges
    .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
    .map(e => ({ source: e.source, target: e.target }));

  // ── Step 1: Count edges per visible node ──────────────────────────
  const edgeCount = new Map<string, number>();
  for (const n of visibleNodes) edgeCount.set(n.id, 0);
  for (const link of links) {
    edgeCount.set(link.source, (edgeCount.get(link.source) ?? 0) + 1);
    edgeCount.set(link.target, (edgeCount.get(link.target) ?? 0) + 1);
  }

  // ── Step 2: Find hub(s) — node(s) with the highest edge count ─────
  let maxEdges = 0;
  for (const count of edgeCount.values()) {
    if (count > maxEdges) maxEdges = count;
  }

  const hubIds = new Set<string>();
  for (const [id, count] of edgeCount) {
    if (count === maxEdges && maxEdges > 0) hubIds.add(id);
  }

  // Fallback: if no edges at all, use plain centroid of all nodes
  if (hubIds.size === 0) {
    for (const n of visibleNodes) hubIds.add(n.id);
  }

  // ── Step 3: Compute anchor point ──────────────────────────────────
  // Single hub → its exact position (it won't move)
  // Multiple hubs → their average position (they'll meet here)
  let cx = 0, cy = 0;
  const hubNodes = visibleNodes.filter(n => hubIds.has(n.id));
  for (const n of hubNodes) {
    cx += n.position.x;
    cy += n.position.y;
  }
  cx /= hubNodes.length;
  cy /= hubNodes.length;

  const singleHub = hubIds.size === 1;

  // ── Step 4: Build simulation nodes ────────────────────────────────
  const simNodes: CompactSimNode[] = visibleNodes.map(n => {
    const isHub = hubIds.has(n.id);
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      isHub,
      // Pin the single hub so it never moves; others are free
      ...(singleHub && isHub ? { fx: n.position.x, fy: n.position.y } : {}),
    };
  });

  // ── Step 5: Configure forces ──────────────────────────────────────
  // Nodes are ~172×36px — collide and link distances must account for node width
  const count = visibleNodes.length;
  const linkDist = Math.max(140, Math.min(220, count * 8));
  const chargeStr = Math.max(-300, Math.min(-80, -count * 6));

  const sim = d3ForceSimulation(simNodes as any)
    .force('center', d3ForceCenter(cx, cy).strength(singleHub ? 0.06 : 0.12))
    .force('charge', d3ForceManyBody().strength(chargeStr).distanceMax(500))
    .force('collide', d3ForceCollide(100).strength(0.9).iterations(3))
    .force(
      'link',
      d3ForceLink(links as any)
        .id((d: any) => d.id)
        .distance(linkDist)
        .strength((link: any) => {
          // Stronger pull for edges connected to a hub
          const srcHub = hubIds.has(link.source.id ?? link.source);
          const tgtHub = hubIds.has(link.target.id ?? link.target);
          return (srcHub || tgtHub) ? 0.6 : 0.35;
        }),
    )
    .alphaDecay(0.035)
    .velocityDecay(0.35)
    .stop();

  // 120 ticks — a few extra to let hub-connected nodes settle nicely
  for (let i = 0; i < 120; i++) sim.tick();

  // ── Step 6: Map positions back ────────────────────────────────────
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const sn of simNodes) {
    positionMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 });
  }

  return visibleNodes.map(n => {
    const pos = positionMap.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}

/**
 * Column-aware compact: preserves each node's X (column) position
 * and only collapses vertical gaps between groups of nodes.
 * Nodes within the same column are sorted by their current Y and
 * re-stacked tightly with a small gap between Y-clusters.
 */
function compactColumnsNodes(visibleNodes: Node[]): Node[] {
  if (visibleNodes.length <= 1) return visibleNodes;

  // Skip header nodes (non-interactive column labels)
  const headerNodes = visibleNodes.filter(n => n.id.startsWith('__col-header-'));
  const realNodes = visibleNodes.filter(n => !n.id.startsWith('__col-header-'));

  // Group nodes by their X position (column)
  const columnBuckets = new Map<number, Node[]>();
  for (const n of realNodes) {
    const x = Math.round(n.position.x); // round to avoid float drift
    if (!columnBuckets.has(x)) columnBuckets.set(x, []);
    columnBuckets.get(x)!.push(n);
  }

  const ROW_H = 52;        // tight vertical spacing between nodes
  const CLUSTER_GAP = 28;  // extra gap between Y-clusters (was separated by large empty space)
  const CLUSTER_THRESHOLD = ROW_H * 3; // if gap > this, it's a cluster boundary

  const positionMap = new Map<string, { x: number; y: number }>();

  for (const [x, colNodes] of columnBuckets) {
    // Sort by current Y position to preserve relative order
    colNodes.sort((a, b) => a.position.y - b.position.y);

    let currentY = colNodes[0].position.y; // start from first node's Y (preserves top alignment)
    // Use the minimum Y across all columns as a shared start
    // (will normalize below)

    for (let i = 0; i < colNodes.length; i++) {
      if (i === 0) {
        positionMap.set(colNodes[i].id, { x, y: currentY });
      } else {
        const gap = colNodes[i].position.y - colNodes[i - 1].position.y;
        if (gap > CLUSTER_THRESHOLD) {
          // Cluster boundary — add a small gap instead of the huge one
          currentY += ROW_H + CLUSTER_GAP;
        } else {
          currentY += ROW_H;
        }
        positionMap.set(colNodes[i].id, { x, y: currentY });
      }
    }
  }

  // Normalize: find the minimum starting Y across all columns and align them
  // so all columns start at roughly the same top position
  const columnMinY = new Map<number, number>();
  const columnOrigMinY = new Map<number, number>();
  for (const [x, colNodes] of columnBuckets) {
    const origMinY = Math.min(...colNodes.map(n => n.position.y));
    const newMinY = positionMap.get(colNodes[0].id)!.y;
    columnMinY.set(x, newMinY);
    columnOrigMinY.set(x, origMinY);
  }

  // Find the global starting Y (top of all headers + margin)
  const globalStartY = Math.min(...Array.from(columnOrigMinY.values()));

  // Shift each column so they all start at the same top
  for (const [x, colNodes] of columnBuckets) {
    const currentMin = columnMinY.get(x)!;
    const shift = globalStartY - currentMin;
    if (Math.abs(shift) > 1) {
      for (const n of colNodes) {
        const pos = positionMap.get(n.id)!;
        positionMap.set(n.id, { x: pos.x, y: pos.y + shift });
      }
    }
  }

  return visibleNodes.map(n => {
    const pos = positionMap.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}

/**
 * When hiding nodes, un-nest them from directoryGroup parents.
 * Converts relative (parent-offset) positions to absolute positions so
 * compaction and edge rendering work correctly after parent groups are removed.
 */
function unnestFromGroups(nodes: Node[]): Node[] {
  // Build a map of group positions (can be nested: group inside group)
  const groupPos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.type === 'directoryGroup') {
      groupPos.set(n.id, n.position);
    }
  }

  // Resolve absolute position by walking the parentNode chain
  function resolveAbsolute(node: Node): { x: number; y: number } {
    let x = node.position.x;
    let y = node.position.y;
    let pid = node.parentNode;
    const seen = new Set<string>(); // guard against cycles
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const pp = groupPos.get(pid);
      if (pp) {
        x += pp.x;
        y += pp.y;
      }
      // Find parent's parentNode
      const parentNode = nodes.find(n => n.id === pid);
      pid = parentNode?.parentNode;
    }
    return { x, y };
  }

  return nodes
    .filter(n => n.type !== 'directoryGroup')
    .map(n => {
      if (!n.parentNode) return n;
      const absPos = resolveAbsolute(n);
      // Return a flat (un-nested) copy with absolute position
      const { parentNode: _removed, extent: _extRemoved, ...rest } = n as any;
      return { ...rest, position: absPos } as Node;
    });
}

/** Apply dim/highlight/hide styling to nodes based on matching IDs */
function applyFilterStyles(
  nodes: Node[],
  edges: Edge[],
  matchingIds: Set<string>,
  isFiltering: boolean,
  mode: SearchFilterMode,
): { nodes: Node[]; edges: Edge[] } {
  if (!isFiltering) return { nodes, edges };

  if (mode === 'hide') {
    // Un-nest from directoryGroups and convert to absolute positions,
    // then keep only matching nodes
    const flatNodes = unnestFromGroups(nodes);
    const filteredNodes = flatNodes.filter(node => matchingIds.has(node.id));

    // Filter edges using the actual set of visible node IDs (strictest check)
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(edge =>
      visibleIds.has(edge.source) && visibleIds.has(edge.target),
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }

  // Dim mode — keep all nodes but lower opacity of non-matching
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
  const [searchFilterMode, setSearchFilterMode] = useState<SearchFilterMode>('hide');
  const [searchDepth, setSearchDepth] = useState(2);
  const [activeTab, setActiveTab] = useState<SidebarTab>('controls');
  const [isCompacting, setIsCompacting] = useState(false);
  const [highlightedDbNodes, setHighlightedDbNodes] = useState<Set<string>>(new Set());
  const [expandedMethodNodes, setExpandedMethodNodes] = useState<Set<string>>(new Set());
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores compacted node positions so they survive re-renders (trace clicks, etc.)
  // Also tracks a fingerprint of the filter state when compaction happened,
  // so positions are invalidated when the user changes search/filter/layout.
  const compactedPositionsRef = useRef<{
    positions: Map<string, { x: number; y: number }>;
    fingerprint: string;
  } | null>(null);
  const { fitView } = useReactFlow();

  // Settings
  const {
    settings,
    updateEdgeLabels, updateGraph, updateSearch,
    resetEdgeLabels, resetGraph, resetSearch, resetAll,
  } = useSettings();

  // Theme
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Bookmarks & Annotations
  const bookmarks = useBookmarks();
  const annotations = useAnnotations();

  // Keyboard shortcuts
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onLayoutChange: (preset) => setLayoutPreset(preset as LayoutPreset),
    onCompact: () => handleCompact(),
    onCloseInspector: () => { setSelected(null); setShowShortcutHelp(false); },
    onToggleHelp: () => setShowShortcutHelp(prev => !prev),
  });

  // Apply search defaults from settings on first load
  const settingsInitRef = useRef(false);
  useEffect(() => {
    if (!settingsInitRef.current) {
      settingsInitRef.current = true;
      setSearchFilterMode(settings.search.defaultFilterMode);
      setSearchDepth(settings.search.defaultDepth);
    }
  }, []);

  const [layoutNodes, setLayoutNodes] = useState<Node[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);

  const isForceActive = layoutPreset === 'force';

  const db = useDatabase();

  // Merge code graph + DB schema into one unified graph, then expand methods if requested
  const mergedGraphData = useMemo<OmniGraph | null>(() => {
    if (!graphData) return null;
    const merged = mergeDbSchema(graphData, db.schema);
    return expandMethods(merged, expandedMethodNodes);
  }, [graphData, db.schema, expandedMethodNodes]);

  const { exportPng, exportSvg, exportJson, exportGif, gifProgress } = useExport(mergedGraphData);
  const apiClient = useApiClient();
  const flowTracer = useFlowTracer(mergedGraphData);

  const availableTypes = useMemo(() => {
    if (!mergedGraphData) return [];
    const types = new Set(mergedGraphData.nodes.map(n => n.type));
    return Array.from(types).sort();
  }, [mergedGraphData]);

  useEffect(() => {
    if (availableTypes.length > 0 && activeTypes.size === 0) {
      setActiveTypes(new Set(availableTypes));
    }
  }, [availableTypes]);

  // Compute matching IDs (shared by both layout modes)
  const isFiltering = searchQuery !== '' || activeTypes.size !== availableTypes.length;
  const matchingIds = useMemo(() => {
    if (!mergedGraphData) return new Set<string>();
    let ids = getMatchingIds(mergedGraphData, searchQuery, activeTypes);
    if (searchQuery !== '' && ids.size > 0) {
      ids = expandConnectedIds(ids, mergedGraphData.edges, searchDepth);
    }
    return ids;
  }, [mergedGraphData, searchQuery, activeTypes, searchDepth]);

  // Force simulation — receives filter params so it can apply them inline during ticks
  const { onNodeDrag: forceDrag, onNodeDragStop: forceDragStop } = useForceSimulation({
    graphData: mergedGraphData,
    active: isForceActive,
    setNodes,
    setEdges,
    matchingIds,
    isFiltering,
    filterMode: searchFilterMode,
  });

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

  // ─── Live Watch Mode (SSE) ──────────────────────────────────────
  // Connect to /api/watch for Server-Sent Events. When the server
  // detects file changes (--watch flag), it pushes the new graph.
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        es = new EventSource('/api/watch');
        es.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'graph-update' && msg.graph) {
              setGraphData(msg.graph);
            }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => {
          // Server may not have --watch enabled; silently retry after delay
          es?.close();
          es = null;
          retryTimer = setTimeout(connect, 10_000);
        };
      } catch { /* EventSource not supported or server down */ }
    }

    connect();

    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Track layout transition to temporarily suppress edge animation
  const layoutTransitionRef = useRef(false);

  useEffect(() => {
    if (!mergedGraphData) return;
    if (isForceActive) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      setTimeout(() => fitView({ padding: 0.1 }), 200);
      return;
    }
    // Suppress edge animation during layout switch to prevent SVG rendering storm
    layoutTransitionRef.current = true;
    const options = { mindmapDirection };
    const result = applyLayout(layoutPreset, mergedGraphData, options);
    setLayoutNodes(result.nodes);
    setLayoutEdges(result.edges);
    setTimeout(() => {
      layoutTransitionRef.current = false;
      fitView({ padding: 0.1 });
    }, 80);
  }, [mergedGraphData, layoutPreset, mindmapDirection]);

  // Apply edge label settings: hide/show labels based on user preferences
  const applyEdgeLabelSettings = useCallback((edgeList: Edge[]): Edge[] => {
    const { showImportLabels, showLinksToLabels, showEmbedsLabels, showHttpLabels, showQueriesLabels, showFkLabels, labelColor, labelFontSize } = settings.edgeLabels;
    return edgeList.map(edge => {
      const label = typeof edge.label === 'string' ? edge.label : '';
      let hideLabel = false;
      if (label === 'imports' && !showImportLabels) hideLabel = true;
      if (label === 'links to' && !showLinksToLabels) hideLabel = true;
      if (label === 'embeds' && !showEmbedsLabels) hideLabel = true;
      if (label === 'queries' && !showQueriesLabels) hideLabel = true;
      // FK labels contain "→" (e.g. "user_id → users.id")
      if (edge.id.startsWith('e-fk-') && !showFkLabels) hideLabel = true;
      // HTTP labels are things like "GET /api/users", "POST /api/auth/login", etc.
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i.test(label) && !showHttpLabels) hideLabel = true;

      return {
        ...edge,
        label: hideLabel ? undefined : edge.label,
        labelStyle: hideLabel ? undefined : {
          ...(edge.labelStyle ?? {}),
          fill: labelColor,
          fontSize: labelFontSize,
        },
      };
    });
  }, [settings.edgeLabels]);

  // Manual compact handler — triggered by user clicking the Compact button
  const handleCompact = useCallback(() => {
    if (isCompacting) return;
    setIsCompacting(true);
    if (compactTimerRef.current) clearTimeout(compactTimerRef.current);

    // Use current nodes/edges from state
    setNodes(currentNodes => {
      const flatNodes = unnestFromGroups(currentNodes);
      const compacted = layoutPreset === 'columns'
        ? compactColumnsNodes(flatNodes)
        : compactNodes(flatNodes, edges);

      // Save compacted positions so they persist across re-renders (e.g. trace clicks)
      // Fingerprint captures the filter state — if it changes, compaction is stale
      const posMap = new Map<string, { x: number; y: number }>();
      for (const n of compacted) posMap.set(n.id, n.position);
      const fingerprint = `${layoutPreset}|${searchQuery}|${searchFilterMode}|${Array.from(activeTypes).sort().join(',')}|${searchDepth}`;
      compactedPositionsRef.current = { positions: posMap, fingerprint };

      return compacted;
    });

    compactTimerRef.current = setTimeout(() => {
      setIsCompacting(false);
      compactTimerRef.current = null;
      fitView({ padding: 0.15, duration: 350 });
    }, 500);
  }, [isCompacting, edges, fitView, setNodes, layoutPreset, searchQuery, searchFilterMode, activeTypes, searchDepth]);

  // Apply filter + trace styles (non-force layouts) — NO auto-compact
  useEffect(() => {
    if (!mergedGraphData || isForceActive) return;

    // If layout data is empty (e.g. during layout transition), clear canvas
    if (layoutNodes.length === 0 && layoutEdges.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // --- Step 1: Filter nodes/edges ---
    let { nodes: styled, edges: styledEdges } = applyFilterStyles(
      layoutNodes, layoutEdges, matchingIds, isFiltering, searchFilterMode,
    );

    // --- Step 2: Restore compacted positions if they exist and match current state ---
    const compactData = compactedPositionsRef.current;
    const currentFingerprint = `${layoutPreset}|${searchQuery}|${searchFilterMode}|${Array.from(activeTypes).sort().join(',')}|${searchDepth}`;
    if (compactData && compactData.fingerprint === currentFingerprint) {
      styled = styled.map(n => {
        const pos = compactData.positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
    } else if (compactData && compactData.fingerprint !== currentFingerprint) {
      // Filter/layout state changed — discard stale compacted positions
      compactedPositionsRef.current = null;
    }

    // --- Step 3: Apply edge label settings ---
    styledEdges = applyEdgeLabelSettings(styledEdges);

    // --- Step 4: Apply edge animation setting (suppress during layout transition) ---
    const shouldAnimate = settings.graph.animateEdges && !layoutTransitionRef.current;
    styledEdges = styledEdges.map(e => ({ ...e, animated: shouldAnimate }));

    // --- Step 5: Click-highlight connected DB tables when an API route is selected ---
    if (highlightedDbNodes.size > 0 && selected) {
      styled = styled.map(node => {
        if (node.type === 'directoryGroup') return node;
        const isSelected = node.id === selected.id;
        const isHighlighted = highlightedDbNodes.has(node.id);
        if (isSelected || isHighlighted) {
          return {
            ...node,
            style: {
              ...node.style,
              opacity: 1,
              boxShadow: isHighlighted
                ? '0 0 16px 4px rgba(51, 103, 145, 0.7)'
                : '0 0 12px 3px rgba(74, 144, 232, 0.6)',
              transition: 'opacity 0.3s, box-shadow 0.3s',
            },
          };
        }
        return {
          ...node,
          style: { ...node.style, opacity: 0.2, transition: 'opacity 0.3s' },
        };
      });
      const highlightNodeIds = new Set([selected.id, ...highlightedDbNodes]);
      styledEdges = styledEdges.map(edge => {
        const connects = highlightNodeIds.has(edge.source) && highlightNodeIds.has(edge.target);
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: connects ? 1 : 0.08,
            strokeWidth: connects ? 3 : (edge.style?.strokeWidth ?? 1),
            transition: 'opacity 0.3s',
          },
          animated: connects ? shouldAnimate : false,
        };
      });
    }

    // --- Step 6: Trace highlighting (style-only, no position changes) ---
    if (flowTracer.isTracing && flowTracer.currentStep) {
      const result = applyTraceStyles(
        styled, styledEdges,
        flowTracer.currentStep.nodeId,
        flowTracer.currentStep.edgeId,
      );
      styled = result.nodes;
      styledEdges = result.edges;
    }

    // --- Step 6: Final safety — remove any orphan edges that reference non-existent nodes ---
    const finalNodeIds = new Set(styled.map(n => n.id));
    styledEdges = styledEdges.filter(e => finalNodeIds.has(e.source) && finalNodeIds.has(e.target));

    setNodes(styled);
    setEdges(styledEdges);
  }, [layoutNodes, layoutEdges, matchingIds, isFiltering, isForceActive,
      searchFilterMode, flowTracer.isTracing, flowTracer.currentStep,
      applyEdgeLabelSettings, layoutPreset, searchQuery, activeTypes, searchDepth,
      settings.graph.animateEdges, highlightedDbNodes, selected]);

  const matchCount = matchingIds.size;

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
      const omniNode = node.data.omniNode as OmniNode;
      setSelected(omniNode);
      setActiveTab('controls');

      // Highlight connected DB tables when clicking an API route node
      if (ROUTE_NODE_TYPES.has(omniNode.type) && mergedGraphData) {
        const connectedDbIds = new Set<string>();
        for (const edge of mergedGraphData.edges) {
          if (edge.source === node.id && (edge.id.startsWith('e-db-') || edge.id.startsWith('e-fk-'))) {
            connectedDbIds.add(edge.target);
            // Also follow FK edges from connected tables
            for (const fkEdge of mergedGraphData.edges) {
              if (fkEdge.id.startsWith('e-fk-') &&
                  (fkEdge.source === edge.target || fkEdge.target === edge.target)) {
                connectedDbIds.add(fkEdge.source);
                connectedDbIds.add(fkEdge.target);
              }
            }
          }
        }
        setHighlightedDbNodes(connectedDbIds);
      } else {
        setHighlightedDbNodes(new Set());
      }
    }
  }, [mergedGraphData]);

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
    setHighlightedDbNodes(new Set());
  }, []);

  /** Toggle method-level expansion for a file node */
  const handleExpandMethods = useCallback((nodeId: string) => {
    setExpandedMethodNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
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

  // Determine if node sliding transitions should be active
  const useTransition = isCompacting && !isForceActive && settings.graph.animateTransitions;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1a1a2e' }}>
      {useTransition && <style>{COMPACT_TRANSITION_CSS}</style>}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          className={useTransition ? 'compact-transition' : ''}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={gifProgress.active ? undefined : onNodeClick}
          onEdgeClick={gifProgress.active ? undefined : onEdgeClick}
          onNodeDrag={gifProgress.active ? undefined : (isForceActive ? forceDrag : undefined)}
          onNodeDragStop={gifProgress.active ? undefined : (isForceActive ? forceDragStop : undefined)}
          onPaneClick={gifProgress.active ? undefined : onPaneClick}
          nodeTypes={nodeTypes}
          panOnDrag={!gifProgress.active}
          zoomOnScroll={!gifProgress.active}
          zoomOnDoubleClick={!gifProgress.active}
          zoomOnPinch={!gifProgress.active}
          nodesDraggable={!gifProgress.active}
          nodesConnectable={false}
          elementsSelectable={!gifProgress.active}
          minZoom={0.05}
          maxZoom={2}
          fitView
        >
          <Background color="#333" gap={16} />
          <Controls />
          {settings.graph.minimapVisible && (
            <MiniMap
              nodeColor={(n) => NODE_COLORS[n.data?.omniNode?.type] ?? '#888'}
              style={{ background: '#0d0d1e' }}
              zoomable
              pannable
              maskColor="rgba(10, 10, 30, 0.7)"
            />
          )}
        </ReactFlow>

        {/* GIF export overlay */}
        {gifProgress.active && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 10, 30, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              pointerEvents: 'all',
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: 56,
                height: 56,
                border: '4px solid rgba(74, 144, 232, 0.2)',
                borderTopColor: '#4a90e8',
                borderRadius: '50%',
                animation: 'omnigraph-spin 0.8s linear infinite',
                marginBottom: 20,
              }}
            />

            {/* Progress text */}
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Exporting to GIF
            </div>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
              {gifProgress.message}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: 240,
                height: 6,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${gifProgress.percent}%`,
                  background: 'linear-gradient(90deg, #4a90e8, #63b3ed)',
                  borderRadius: 3,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
              {gifProgress.percent}%
            </div>
          </div>
        )}

        {/* Spinner keyframes */}
        {gifProgress.active && (
          <style>{`
            @keyframes omnigraph-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        )}
        {/* Keyboard shortcut help overlay */}
        {showShortcutHelp && (
          <div
            onClick={() => setShowShortcutHelp(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 10, 30, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 60,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '24px 32px',
                minWidth: 320,
                boxShadow: '0 8px 32px var(--shadow)',
              }}
            >
              <h3 style={{ color: 'var(--text)', marginBottom: 16, fontSize: 16 }}>
                Keyboard Shortcuts
              </h3>
              {SHORTCUT_LIST.map(({ keys, description }) => (
                <div
                  key={keys}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--divider)',
                  }}
                >
                  <kbd
                    style={{
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: 'var(--text)',
                    }}
                  >
                    {keys}
                  </kbd>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 16 }}>
                    {description}
                  </span>
                </div>
              ))}
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 12, textAlign: 'center' }}>
                Press <kbd style={{ fontSize: 10, padding: '1px 4px', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 3 }}>?</kbd> or click outside to close
              </div>
            </div>
          </div>
        )}
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
        searchInputRef={searchInputRef}
        searchFilterMode={searchFilterMode}
        onSearchFilterModeChange={setSearchFilterMode}
        searchDepth={searchDepth}
        onSearchDepthChange={setSearchDepth}
        activeTypes={activeTypes}
        onTypeToggle={handleTypeToggle}
        availableTypes={availableTypes}
        matchCount={matchCount}
        totalCount={mergedGraphData?.nodes.length ?? 0}
        onCompact={handleCompact}
        isCompacting={isCompacting}
        selectedNode={selected}
        onCloseInspector={() => setSelected(null)}
        onExportPng={exportPng}
        onExportSvg={exportSvg}
        onExportJson={exportJson}
        onExportGif={exportGif}
        // API Client
        apiBaseUrl={apiClient.baseUrl}
        onApiBaseUrlChange={apiClient.setBaseUrl}
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
        // Settings
        settings={settings}
        onUpdateEdgeLabels={updateEdgeLabels}
        onUpdateGraph={updateGraph}
        onUpdateSearch={updateSearch}
        onResetEdgeLabels={resetEdgeLabels}
        onResetGraph={resetGraph}
        onResetSearch={resetSearch}
        onResetAll={resetAll}
        // Database
        dbConnections={db.connections}
        dbActiveConnectionId={db.activeConnectionId}
        dbSchema={db.schema}
        dbSchemaLoading={db.schemaLoading}
        dbSchemaError={db.schemaError}
        dbQueryResult={db.queryResult}
        dbQueryLoading={db.queryLoading}
        dbQueryError={db.queryError}
        dbEnvConnections={db.envConnections}
        dbEnvLoading={db.envLoading}
        onDbAddConnection={db.addConnection}
        onDbUpdateConnection={db.updateConnection}
        onDbRemoveConnection={db.removeConnection}
        onDbConnectWithCredentials={db.connectWithCredentials}
        onDbConnectFromEnv={db.connectFromEnv}
        onDbConnectFromCustomKey={db.connectFromCustomKey}
        onDbDisconnect={db.disconnect}
        onDbLoadSchema={db.loadSchema}
        onDbExecuteQuery={db.executeQuery}
        onDbClearQuery={db.clearQuery}
        // Method expansion
        expandedMethodNodes={expandedMethodNodes}
        onExpandMethods={handleExpandMethods}
        // Theme
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        // Bookmarks
        bookmarks={bookmarks.bookmarks}
        onSaveBookmark={() => {
          const name = `View ${bookmarks.bookmarks.length + 1}`;
          bookmarks.addBookmark({
            name,
            layoutPreset,
            searchQuery,
            searchFilterMode,
            searchDepth,
            activeTypes: Array.from(activeTypes),
          });
        }}
        onLoadBookmark={(bm) => {
          setLayoutPreset(bm.layoutPreset as LayoutPreset);
          setSearchQuery(bm.searchQuery);
          setSearchFilterMode(bm.searchFilterMode as SearchFilterMode);
          setSearchDepth(bm.searchDepth);
          setActiveTypes(new Set(bm.activeTypes));
        }}
        onRemoveBookmark={bookmarks.removeBookmark}
        // Annotations
        annotation={selected ? annotations.getAnnotation(selected.id) : undefined}
        onSetAnnotation={(text) => { if (selected) annotations.setAnnotation(selected.id, text); }}
        annotatedNodeIds={annotations.annotatedNodeIds}
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
