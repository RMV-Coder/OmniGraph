import type { Node, Edge } from 'reactflow';
import type { OmniNode, OmniEdge } from '../types';

export type LayoutPreset = 'directory' | 'hierarchical' | 'mindmap' | 'force' | 'grid';

export type MindmapDirection = 'LR' | 'RL';

export interface LayoutOptions {
  mindmapDirection?: MindmapDirection;
}

export interface LayoutInput {
  nodes: OmniNode[];
  edges: OmniEdge[];
}

export interface LayoutOutput {
  nodes: Node[];
  edges: Edge[];
}

export type LayoutFunction = (input: LayoutInput, options?: LayoutOptions) => LayoutOutput;

export const LAYOUT_PRESETS: { key: LayoutPreset; label: string }[] = [
  { key: 'directory', label: 'Group by Directory' },
  { key: 'hierarchical', label: 'Hierarchical' },
  { key: 'mindmap', label: 'Mind Map' },
  { key: 'force', label: 'Force-Directed' },
  { key: 'grid', label: 'Grid' },
];
