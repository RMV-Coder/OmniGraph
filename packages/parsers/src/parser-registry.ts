import { IParser } from './IParser';
import { TypeScriptParser } from './typescript/typescript-parser';
import { PythonParser } from './python/python-parser';
import { PhpParser } from './php/php-parser';
import { MarkdownParser } from './markdown/markdown-parser';
import { OmniGraph, OmniNode, OmniEdge } from './types';
import { detectHttpCalls, matchRoutes } from './cross-network';
import type { HttpCall } from './cross-network';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

const pythonParser = new PythonParser();
const phpParser = new PhpParser();
const markdownParser = new MarkdownParser();

const parsers: IParser[] = [new TypeScriptParser(), pythonParser, phpParser, markdownParser];

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

  // Collect source contents for cross-network analysis
  const sourceByFileId = new Map<string, { filePath: string; source: string }>();

  // Pass root directory to parsers that need it for import resolution
  pythonParser.setRootDir(dirPath);
  phpParser.setRootDir(dirPath);
  markdownParser.setRootDir(dirPath);

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

        // Store source for cross-network detection
        const fileId = fullPath.replace(/\\/g, '/');
        sourceByFileId.set(fileId, { filePath: fullPath, source });
      }
    }
  }

  walk(dirPath);

  // ─── Cross-Network Tracing (F12) ──────────────────────────────────
  // Scan all source files for HTTP client calls and match them to
  // backend route handlers to create cross-network edges.
  const httpCallsByFile = new Map<string, HttpCall[]>();

  for (const [fileId, { filePath, source }] of sourceByFileId) {
    const calls = detectHttpCalls(filePath, source);
    if (calls.length > 0) {
      httpCallsByFile.set(fileId, calls);
    }
  }

  if (httpCallsByFile.size > 0) {
    const crossNetwork = matchRoutes(nodes, httpCallsByFile);
    edges.push(...crossNetwork.edges);
  }

  // Filter out dangling edges where source or target node doesn't exist
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  return { nodes, edges: validEdges };
}
