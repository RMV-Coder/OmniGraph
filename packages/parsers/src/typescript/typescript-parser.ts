import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge } from '../types';
import { parse } from '@typescript-eslint/typescript-estree';
import * as fs from 'fs';
import * as path from 'path';

/** Minimal shape of a decorator node as emitted by typescript-estree */
interface DecoratorNode {
  expression: {
    type: string;
    callee?: { type: string; name: string };
    arguments?: Array<{ type: string; value?: unknown }>;
  };
}

/** Typed interface for AST nodes that may carry decorators */
interface NodeWithDecorators {
  decorators?: DecoratorNode[];
}

/** Type guard to check if a value is a NodeWithDecorators */
function hasDecorators(node: unknown): node is NodeWithDecorators {
  return typeof node === 'object' && node !== null && 'decorators' in node;
}

/** Extracts NestJS node type and route from a list of decorator nodes */
function extractNestJSInfo(
  decorators: DecoratorNode[]
): { nodeType: string; route: string } | null {
  for (const dec of decorators) {
    const expr = dec.expression;
    if (expr.type === 'CallExpression' && expr.callee?.type === 'Identifier') {
      const name = expr.callee.name;
      if (name === 'Controller') {
        const arg = expr.arguments?.[0];
        const route = arg?.type === 'Literal' ? String(arg.value) : '';
        return { nodeType: 'nestjs-controller', route };
      }
      if (name === 'Injectable') return { nodeType: 'nestjs-injectable', route: '' };
      if (name === 'Module') return { nodeType: 'nestjs-module', route: '' };
    }
  }
  return null;
}

// ─── Next.js Detection ─────────────────────────────────────────────

/** HTTP method names that Next.js App Router recognizes as route handlers */
const NEXTJS_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Detect if a file is a Next.js App Router route handler (route.ts/route.js).
 * Returns the route path derived from the filesystem and the exported HTTP methods.
 *
 * Convention: app/api/users/[id]/route.ts → /api/users/:id
 */
function detectNextJSAppRoute(filePath: string, exportedNames: string[]): { nodeType: string; route: string } | null {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized, path.extname(normalized));

  // Must be a route.ts/route.js file
  if (basename !== 'route') return null;

  // Must be inside an `app/` or `src/app/` directory
  const appMatch = normalized.match(/(?:^|\/)(src\/)?app\/(.*?)\/route\.\w+$/);
  if (!appMatch) return null;

  const routeDir = appMatch[2]; // e.g., "api/users/[id]"

  // Convert Next.js dynamic segments to express-style params: [id] → :id, [...slug] → :slug*
  const routePath = '/' + routeDir
    .split('/')
    .map(segment => {
      // Catch-all: [...slug] or [[...slug]]
      if (/^\[\[?\.\.\.\w+\]?\]$/.test(segment)) {
        const name = segment.replace(/[\[\]\.]/g, '');
        return `:${name}*`;
      }
      // Dynamic: [id]
      if (/^\[\w+\]$/.test(segment)) {
        return ':' + segment.slice(1, -1);
      }
      return segment;
    })
    .join('/');

  // Detect which HTTP methods are exported
  const methods = exportedNames.filter(n => NEXTJS_HTTP_METHODS.includes(n));

  if (methods.length === 0) {
    // File is named route.ts but no HTTP method exports detected — treat as generic API route
    return { nodeType: 'nextjs-api-route', route: routePath };
  }

  // Build route metadata in "METHOD /path" format (comma-separated)
  const routeEntries = methods.map(m => `${m} ${routePath}`).join(', ');
  return { nodeType: 'nextjs-api-route', route: routeEntries };
}

/**
 * Detect Next.js Pages Router API routes: pages/api/users/[id].ts
 * Convention: pages/api/... → /api/...
 */
function detectNextJSPagesApiRoute(filePath: string, hasDefaultExport: boolean): { nodeType: string; route: string } | null {
  if (!hasDefaultExport) return null;

  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized, path.extname(normalized));

  // Must be inside a `pages/api/` or `src/pages/api/` directory
  const pagesMatch = normalized.match(/(?:^|\/)(src\/)?pages\/api\/(.*?)(\.\w+)$/);
  if (!pagesMatch) return null;

  let routeSegments = pagesMatch[2]; // e.g., "users/[id]"

  // Handle index files: pages/api/index.ts → /api
  if (basename === 'index') {
    routeSegments = routeSegments.replace(/\/?index$/, '');
  }

  const segments = routeSegments
    .split('/')
    .filter(Boolean)
    .map(segment => {
      if (/^\[\[?\.\.\.\w+\]?\]$/.test(segment)) {
        const name = segment.replace(/[\[\]\.]/g, '');
        return `:${name}*`;
      }
      if (/^\[\w+\]$/.test(segment)) {
        return ':' + segment.slice(1, -1);
      }
      return segment;
    });

  const routePath = segments.length > 0 ? '/api/' + segments.join('/') : '/api';

  return { nodeType: 'nextjs-api-route', route: routePath };
}

/**
 * Detect Next.js App Router page components (page.tsx/page.jsx).
 * Convention: app/dashboard/page.tsx → nextjs-page
 */
function detectNextJSPage(filePath: string): { nodeType: string; route: string } | null {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized, path.extname(normalized));

  if (basename !== 'page') return null;

  const appMatch = normalized.match(/(?:^|\/)(src\/)?app\/(.*?)\/page\.\w+$/);
  if (!appMatch) return null;

  const routeDir = appMatch[2];
  const routePath = '/' + routeDir
    .split('/')
    .map(segment => {
      if (/^\[\[?\.\.\.\w+\]?\]$/.test(segment)) {
        const name = segment.replace(/[\[\]\.]/g, '');
        return `:${name}*`;
      }
      if (/^\[\w+\]$/.test(segment)) {
        return ':' + segment.slice(1, -1);
      }
      return segment;
    })
    .join('/');

  return { nodeType: 'nextjs-page', route: routePath };
}

/**
 * Detect Next.js App Router layout components (layout.tsx/layout.jsx).
 */
function detectNextJSLayout(filePath: string): { nodeType: string; route: string } | null {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized, path.extname(normalized));

  if (basename !== 'layout') return null;

  // Match app/layout.tsx (root) or app/something/layout.tsx (nested)
  const appMatch = normalized.match(/(?:^|\/)(src\/)?app\/(.+\/)?layout\.\w+$/);
  if (!appMatch) return null;

  return { nodeType: 'nextjs-layout', route: '' };
}

// ─── Shared Utilities ──────────────────────────────────────────────

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Resolve a relative import to an actual file path on disk */
function resolveImport(fromFile: string, importPath: string): string | null {
  const base = path.normalize(path.join(path.dirname(fromFile), importPath));

  // If import already has an extension and exists, use it directly
  if (path.extname(base) && fs.existsSync(base)) return base;

  // Try appending extensions: ./foo → ./foo.ts, ./foo.tsx, etc.
  for (const ext of RESOLVE_EXTENSIONS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }

  // Try index files: ./foo → ./foo/index.ts, etc.
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (fs.existsSync(indexPath)) return indexPath;
  }

  return null;
}

// ─── Parser ────────────────────────────────────────────────────────

export class TypeScriptParser implements IParser {
  canHandle(filePath: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, path.extname(filePath));

    let ast: ReturnType<typeof parse>;
    try {
      ast = parse(source, { jsx: true, errorRecovery: true });
    } catch {
      const fallbackType = /\.(js|jsx)$/.test(filePath) ? 'javascript-file' : 'typescript-file';
      return {
        nodes: [{ id: fileId, type: fallbackType, label, metadata: { filePath, route: '' } }],
        edges: [],
      };
    }

    const edges: OmniEdge[] = [];
    const isJS = /\.(js|jsx)$/.test(filePath);
    let nodeType = isJS ? 'javascript-file' : 'typescript-file';
    let route = '';

    // Track exported names for Next.js detection
    const exportedNames: string[] = [];
    let hasDefaultExport = false;

    for (const stmt of ast.body) {
      // Extract relative imports
      if (stmt.type === 'ImportDeclaration') {
        const src = stmt.source.value as string;
        if (src.startsWith('./') || src.startsWith('../')) {
          const resolved = resolveImport(filePath, src);
          if (resolved) {
            const targetId = resolved.replace(/\\/g, '/');
            edges.push({
              id: `e-${fileId}->${targetId}`,
              source: fileId,
              target: targetId,
              label: 'imports',
            });
          }
        }
      }

      // Track named exports for Next.js App Router detection
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.declaration) {
          const decl = stmt.declaration as unknown as Record<string, unknown>;
          if (decl.type === 'FunctionDeclaration' && decl.id && typeof (decl.id as unknown as Record<string, unknown>).name === 'string') {
            exportedNames.push((decl.id as unknown as Record<string, unknown>).name as string);
          }
          if (decl.type === 'VariableDeclaration' && Array.isArray(decl.declarations)) {
            for (const d of decl.declarations as unknown as Array<Record<string, unknown>>) {
              if (d.id && typeof (d.id as unknown as Record<string, unknown>).name === 'string') {
                exportedNames.push((d.id as unknown as Record<string, unknown>).name as string);
              }
            }
          }
        }
        if (stmt.specifiers) {
          for (const spec of stmt.specifiers) {
            if (spec.exported && typeof spec.exported.name === 'string') {
              exportedNames.push(spec.exported.name);
            }
          }
        }
      }

      // Track default exports (for Pages Router API routes)
      if (stmt.type === 'ExportDefaultDeclaration') {
        hasDefaultExport = true;
      }

      // Detect NestJS decorators on exported or top-level class declarations
      let classNode: unknown = null;
      if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'ClassDeclaration') {
        classNode = stmt.declaration;
      } else if (stmt.type === 'ClassDeclaration') {
        classNode = stmt;
      }

      if (classNode) {
        // Decorators can be on the class node or on the export statement
        const decorators = hasDecorators(classNode)
          ? (classNode.decorators ?? [])
          : hasDecorators(stmt)
            ? (stmt.decorators ?? [])
            : [];
        const nestInfo = extractNestJSInfo(decorators);
        if (nestInfo) {
          nodeType = nestInfo.nodeType;
          route = nestInfo.route;
        }
      }
    }

    // ─── Next.js Detection (only if NestJS wasn't detected) ───────
    if (nodeType === 'typescript-file' || nodeType === 'javascript-file') {
      // Priority: App Router route → Pages Router API → Page → Layout
      const nextResult =
        detectNextJSAppRoute(filePath, exportedNames) ??
        detectNextJSPagesApiRoute(filePath, hasDefaultExport) ??
        detectNextJSPage(filePath) ??
        detectNextJSLayout(filePath);

      if (nextResult) {
        nodeType = nextResult.nodeType;
        route = nextResult.route;
      }
    }

    const node: OmniNode = {
      id: fileId,
      type: nodeType,
      label,
      metadata: { filePath, route },
    };

    return { nodes: [node], edges };
  }
}
