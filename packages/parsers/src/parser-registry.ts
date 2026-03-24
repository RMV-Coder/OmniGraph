import { IParser } from './IParser';
import { TypeScriptParser } from './typescript/typescript-parser';
import { OmniGraph, OmniNode, OmniEdge } from './types';
import * as fs from 'fs';
import * as path from 'path';

const parsers: IParser[] = [new TypeScriptParser()];

export function parseDirectory(dirPath: string): OmniGraph {
  const nodes: OmniNode[] = [];
  const edges: OmniEdge[] = [];
  const seen = new Set<string>();

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', '.next', 'build'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const parser = parsers.find(p => p.canHandle(fullPath));
        if (!parser) continue;
        const source = fs.readFileSync(fullPath, 'utf-8');
        const partial = parser.parse(fullPath, source);
        if (partial.nodes) {
          for (const n of partial.nodes) {
            if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id); }
          }
        }
        if (partial.edges) edges.push(...partial.edges);
      }
    }
  }

  walk(dirPath);
  return { nodes, edges };
}
