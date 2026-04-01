import type { LayoutFunction, LayoutPreset, LayoutInput, LayoutOutput, LayoutOptions } from './types';
import { directoryLayout } from './directoryLayout';
import { hierarchicalLayout } from './hierarchicalLayout';
import { mindmapLayout } from './mindmapLayout';
import { forceLayout } from './forceLayout';
import { gridLayout } from './gridLayout';
import { columnsLayout } from './columnsLayout';

export type { LayoutPreset, LayoutInput, LayoutOutput, LayoutOptions, MindmapDirection } from './types';
export { LAYOUT_PRESETS } from './types';

const layouts: Record<LayoutPreset, LayoutFunction> = {
  directory: directoryLayout,
  hierarchical: hierarchicalLayout,
  columns: columnsLayout,
  mindmap: mindmapLayout,
  force: forceLayout,
  grid: gridLayout,
};

export function applyLayout(preset: LayoutPreset, input: LayoutInput, options?: LayoutOptions): LayoutOutput {
  return layouts[preset](input, options);
}
