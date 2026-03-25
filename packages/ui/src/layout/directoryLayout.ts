import type { Node } from 'reactflow';
import type { OmniNode } from '../types';
import type { LayoutFunction } from './types';
import { styleNode, styleEdge, getNodeDirectory, NODE_WIDTH, NODE_HEIGHT } from './shared';

const INNER_PADDING = 20;
const GROUP_HEADER_HEIGHT = 32;
const NODE_GAP_X = 20;
const NODE_GAP_Y = 16;
const GROUP_GAP_X = 40;
const GROUP_GAP_Y = 40;
const GROUP_COLS_MAX = 4; // max columns within a group
const OUTER_COLS = 3;    // how many groups per row

interface DirGroup {
  dir: string;
  label: string;
  nodes: OmniNode[];
}

function getRelativeDir(fullDir: string, commonPrefix: string): string {
  let rel = fullDir.substring(commonPrefix.length);
  if (rel.startsWith('/')) rel = rel.substring(1);
  return rel || '.';
}

function findCommonPrefix(dirs: string[]): string {
  if (dirs.length === 0) return '';
  let prefix = dirs[0];
  for (let i = 1; i < dirs.length; i++) {
    while (!dirs[i].startsWith(prefix)) {
      const slash = prefix.lastIndexOf('/');
      if (slash <= 0) return '';
      prefix = prefix.substring(0, slash);
    }
  }
  return prefix;
}

export const directoryLayout: LayoutFunction = ({ nodes, edges }) => {
  // Group nodes by directory
  const groupMap = new Map<string, OmniNode[]>();
  for (const n of nodes) {
    const dir = getNodeDirectory(n);
    if (!groupMap.has(dir)) groupMap.set(dir, []);
    groupMap.get(dir)!.push(n);
  }

  // Build groups sorted by directory name
  const allDirs = Array.from(groupMap.keys());
  const commonPrefix = findCommonPrefix(allDirs);

  const groups: DirGroup[] = allDirs
    .sort()
    .map(dir => ({
      dir,
      label: getRelativeDir(dir, commonPrefix),
      nodes: groupMap.get(dir)!,
    }));

  // Compute dimensions for each group
  function groupDimensions(g: DirGroup) {
    const cols = Math.min(g.nodes.length, GROUP_COLS_MAX);
    const rows = Math.ceil(g.nodes.length / cols);
    const width = cols * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X + INNER_PADDING * 2;
    const height = rows * (NODE_HEIGHT + NODE_GAP_Y) - NODE_GAP_Y + INNER_PADDING * 2 + GROUP_HEADER_HEIGHT;
    return { cols, rows, width, height };
  }

  const flowNodes: Node[] = [];

  // Place groups in a grid of groups
  let groupX = 0;
  let groupY = 0;
  let colIdx = 0;
  let rowMaxHeight = 0;

  for (const group of groups) {
    const dim = groupDimensions(group);

    // Create group node
    const groupId = `group-${group.dir}`;
    flowNodes.push({
      id: groupId,
      type: 'directoryGroup',
      data: { label: group.label },
      position: { x: groupX, y: groupY },
      style: {
        width: dim.width,
        height: dim.height,
      },
    });

    // Place child nodes within the group
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
