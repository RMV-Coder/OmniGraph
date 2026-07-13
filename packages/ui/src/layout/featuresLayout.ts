import type { Node } from 'reactflow';
import type { OmniNode } from '../types';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge, NODE_WIDTH, NODE_HEIGHT } from './shared';

/**
 * "Group by Feature" layout.
 *
 * Groups nodes into boxes by their detected feature (`metadata.feature` /
 * `metadata.featureName`, stamped by the core feature detector). Nodes with
 * no feature fall into an "Ungrouped" box; the "__shared" marker becomes a
 * "Shared" box. Both catch-alls are placed last.
 *
 * Reuses the existing `directoryGroup` node type so it inherits App.tsx's
 * group-aware hide/dim/compact/trace handling for free.
 */

const INNER_PADDING = 20;
const GROUP_HEADER_HEIGHT = 34;
const NODE_GAP_X = 20;
const NODE_GAP_Y = 16;
const GROUP_GAP_X = 48;
const GROUP_GAP_Y = 48;
const GROUP_COLS_MAX = 8; // max node columns within a feature box
const OUTER_COLS = 4;     // how many feature boxes per row

const SHARED_ID = '__shared';
const UNGROUPED_ID = '__ungrouped';

interface FeatureGroupBucket {
  key: string;
  label: string;
  nodes: OmniNode[];
  /** sort weight: real features by size, catch-alls forced last */
  order: number;
}

/** Square-ish column count so large features don't become tall ribbons */
function colsFor(count: number): number {
  return Math.min(Math.max(1, Math.ceil(Math.sqrt(count))), GROUP_COLS_MAX);
}

export const featuresLayout: LayoutFunction = ({ nodes, edges }) => {
  // ── Bucket nodes by feature ──
  const buckets = new Map<string, FeatureGroupBucket>();
  for (const n of nodes) {
    const key = n.metadata.feature || UNGROUPED_ID;
    const label =
      key === UNGROUPED_ID ? 'Ungrouped' :
      key === SHARED_ID ? 'Shared' :
      (n.metadata.featureName || key);
    if (!buckets.has(key)) buckets.set(key, { key, label, nodes: [], order: 0 });
    buckets.get(key)!.nodes.push(n);
  }

  // ── Order: real features by size desc, then Shared, then Ungrouped ──
  const groups = [...buckets.values()].map(g => ({
    ...g,
    order:
      g.key === UNGROUPED_ID ? Number.POSITIVE_INFINITY :
      g.key === SHARED_ID ? Number.MAX_SAFE_INTEGER :
      -g.nodes.length,
  }));
  groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  function groupDimensions(count: number) {
    const cols = colsFor(count);
    const rows = Math.ceil(count / cols);
    const width = cols * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X + INNER_PADDING * 2;
    const height = rows * (NODE_HEIGHT + NODE_GAP_Y) - NODE_GAP_Y + INNER_PADDING * 2 + GROUP_HEADER_HEIGHT;
    return { cols, width, height };
  }

  const flowNodes: Node[] = [];
  let groupX = 0;
  let groupY = 0;
  let colIdx = 0;
  let rowMaxHeight = 0;

  for (const group of groups) {
    const dim = groupDimensions(group.nodes.length);
    const groupId = `feature-group-${group.key}`;

    flowNodes.push({
      id: groupId,
      type: 'directoryGroup',
      data: { label: `${group.label}  ·  ${group.nodes.length}` },
      position: { x: groupX, y: groupY },
      style: { width: dim.width, height: dim.height },
    });

    group.nodes.forEach((n, i) => {
      const col = i % dim.cols;
      const row = Math.floor(i / dim.cols);
      flowNodes.push({
        ...styleNode(n),
        parentNode: groupId,
        extent: 'parent' as const,
        position: {
          x: INNER_PADDING + col * (NODE_WIDTH + NODE_GAP_X),
          y: GROUP_HEADER_HEIGHT + INNER_PADDING + row * (NODE_HEIGHT + NODE_GAP_Y),
        },
      });
    });

    rowMaxHeight = Math.max(rowMaxHeight, dim.height);
    colIdx++;
    if (colIdx >= OUTER_COLS) {
      colIdx = 0;
      groupX = 0;
      groupY += rowMaxHeight + GROUP_GAP_Y;
      rowMaxHeight = 0;
    } else {
      groupX += dim.width + GROUP_GAP_X;
    }
  }

  return { nodes: flowNodes, edges: edges.map(styleEdge) };
};
