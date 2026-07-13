import { IParser } from './IParser';
import { TypeScriptParser } from './typescript/typescript-parser';
import { PythonParser } from './python/python-parser';
import { PhpParser } from './php/php-parser';
import { MarkdownParser } from './markdown/markdown-parser';
import { SchemaParser } from './schema/schema-parser';
import { GoParser } from './go/go-parser';
import { RustParser } from './rust/rust-parser';
import { JavaParser } from './java/java-parser';
import { OmniGraph, OmniNode, OmniEdge } from './types';
import { detectHttpCalls, matchRoutes, detectWebSocketEndpoints, matchWebSocketEndpoints } from './cross-network';
import type { HttpCall, WebSocketEndpoint } from './cross-network';
import { detectFeatures } from './features/feature-detector';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';

const pythonParser = new PythonParser();
const phpParser = new PhpParser();
const markdownParser = new MarkdownParser();

const schemaParser = new SchemaParser();
const goParser = new GoParser();
const rustParser = new RustParser();
const javaParser = new JavaParser();

const parsers: IParser[] = [
  new TypeScriptParser(), pythonParser, phpParser, markdownParser,
  schemaParser, goParser, rustParser, javaParser,
];

/**
 * Directories that are never application source and are always skipped,
 * regardless of .gitignore. Covers dependencies, build/cache output,
 * VCS/editor metadata, and agent-tool dirs (e.g. `.claude/worktrees`,
 * which can hold many full repo checkouts and explode the file count).
 */
export const ALWAYS_SKIP = new Set([
  // dependencies & build output
  'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit',
  'coverage', '.turbo', '.cache', '.parcel-cache', '.vercel', '.output',
  // python
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.mypy_cache',
  // VCS, editor & agent tooling
  '.git', '.hg', '.svn', '.idea', '.vscode', '.claude', '.agents',
]);

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
  goParser.setRootDir(dirPath);
  rustParser.setRootDir(dirPath);
  javaParser.setRootDir(dirPath);

  function walk(dir: string, isRoot: boolean): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Skip nested git boundaries (worktrees, submodules, nested clones):
    // parsing another repo's checkout inside this one duplicates the whole
    // tree and can multiply the file count many times over. Never skip the
    // root repo itself.
    if (!isRoot && entries.some(e => e.name === '.git')) return;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

      if (ALWAYS_SKIP.has(entry.name)) continue;
      if (ig.ignores(relativePath + (entry.isDirectory() ? '/' : ''))) continue;

      if (entry.isDirectory()) {
        walk(fullPath, false);
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

  walk(dirPath, true);

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

  // ─── WebSocket Tracing (F38) ──────────────────────────────────────
  // Scan all source files for WebSocket client/server patterns and
  // event emitters/listeners, then match them to create WS edges.
  const wsEndpointsByFile = new Map<string, WebSocketEndpoint[]>();

  for (const [fileId, { filePath, source }] of sourceByFileId) {
    const endpoints = detectWebSocketEndpoints(filePath, source);
    if (endpoints.length > 0) {
      wsEndpointsByFile.set(fileId, endpoints);
    }
  }

  if (wsEndpointsByFile.size > 0) {
    const wsEdges = matchWebSocketEndpoints(wsEndpointsByFile);
    edges.push(...wsEdges);
  }

  // Filter out dangling edges where source or target node doesn't exist
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const graph: OmniGraph = { nodes, edges: validEdges };

  // ─── Feature Grouping (P0) ────────────────────────────────────────
  // Cluster nodes into human-meaningful features and stamp membership
  // onto each node's metadata. Runs last — needs the full node/edge set.
  graph.features = detectFeatures(graph);

  return graph;
}
