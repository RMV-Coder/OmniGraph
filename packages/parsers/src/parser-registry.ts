import { IParser } from './IParser';
import { TypeScriptParser } from './typescript/typescript-parser';
import { PythonParser } from './python/python-parser';
import { PhpParser } from './php/php-parser';
import { OmniGraph, OmniNode, OmniEdge } from './types';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

const pythonParser = new PythonParser();
const phpParser = new PhpParser();

const parsers: IParser[] = [new TypeScriptParser(), pythonParser, phpParser];

/** Always skip these directories regardless of .gitignore */
const ALWAYS_SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

/** Load and merge .gitignore files from the root directory */
function loadGitignore(rootDir: string): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }
  return ig;
}

export function parseDirectory(dirPath: string): OmniGraph {
  const nodes: OmniNode[] = [];
  const edges: OmniEdge[] = [];
  const seen = new Set<string>();
  const ig = loadGitignore(dirPath);

  // Pass root directory to parsers that need it for import resolution
  pythonParser.setRootDir(dirPath);
  phpParser.setRootDir(dirPath);

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

      if (ALWAYS_SKIP.has(entry.name)) continue;
      if (ig.ignores(relativePath + (entry.isDirectory() ? '/' : ''))) continue;

      if (entry.isDirectory()) {
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

  // Filter out dangling edges where source or target node doesn't exist
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  return { nodes, edges: validEdges };
}
