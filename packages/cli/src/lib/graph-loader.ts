/**
 * Shared graph loading utility.
 * Calls parseDirectory() and caches the result for the process lifetime.
 */
import { parseDirectory } from '@omnigraph/parsers';
import type { OmniGraph } from '@omnigraph/types';
import path from 'path';

let cached: { targetPath: string; graph: OmniGraph } | null = null;

export function loadGraph(targetPath: string, silent = false): OmniGraph {
  const resolved = path.resolve(targetPath);
  if (cached && cached.targetPath === resolved) return cached.graph;

  if (!silent) {
    process.stderr.write(`Parsing ${resolved}...\n`);
  }

  const graph = parseDirectory(resolved);

  if (!silent) {
    process.stderr.write(`Found ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`);
  }

  cached = { targetPath: resolved, graph };
  return graph;
}
