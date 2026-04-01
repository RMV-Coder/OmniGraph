import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
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

/** Try to resolve a base path to an actual file (with extension / index fallback) */
function tryResolveFile(base: string): string | null {
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

/** Resolve a relative import to an actual file path on disk */
function resolveImport(fromFile: string, importPath: string): string | null {
  const base = path.normalize(path.join(path.dirname(fromFile), importPath));
  return tryResolveFile(base);
}

// ─── tsconfig Path Alias Resolution ─────────────────────────────────

interface TsConfigPaths {
  baseUrl: string;             // Absolute directory path
  patterns: Array<{
    prefix: string;            // e.g. '@/' or '@components/'
    directories: string[];     // Resolved absolute directories to search
  }>;
}

/** Cache: project root → parsed paths (or null if no tsconfig) */
const tsConfigCache = new Map<string, TsConfigPaths | null>();

/** Find the project root by walking up from a file to find tsconfig.json */
function findProjectRoot(fromFile: string): string | null {
  let dir = path.dirname(fromFile);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Parse tsconfig.json compilerOptions.paths + baseUrl */
function loadTsConfigPaths(projectRoot: string): TsConfigPaths | null {
  if (tsConfigCache.has(projectRoot)) return tsConfigCache.get(projectRoot)!;

  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  try {
    let raw = fs.readFileSync(tsconfigPath, 'utf-8');
    // Strip single-line and multi-line comments (tsconfig supports them)
    raw = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const config = JSON.parse(raw);
    const compilerOptions = config.compilerOptions;
    if (!compilerOptions) {
      tsConfigCache.set(projectRoot, null);
      return null;
    }

    const baseUrl = compilerOptions.baseUrl
      ? path.resolve(projectRoot, compilerOptions.baseUrl)
      : projectRoot;

    const pathsObj: Record<string, string[]> = compilerOptions.paths ?? {};
    const patterns: TsConfigPaths['patterns'] = [];

    for (const [pattern, mappings] of Object.entries(pathsObj)) {
      // Pattern like "@/*" → prefix "@/", mapping like ["./src/*"]
      const prefix = pattern.replace(/\*$/, '');
      const directories = (mappings as string[]).map(m => {
        const dir = m.replace(/\*$/, '');
        return path.resolve(baseUrl, dir);
      });
      patterns.push({ prefix, directories });
    }

    // Common convention: if no explicit paths but baseUrl is set,
    // non-relative imports resolve from baseUrl
    const result: TsConfigPaths = { baseUrl, patterns };
    tsConfigCache.set(projectRoot, result);
    return result;
  } catch {
    tsConfigCache.set(projectRoot, null);
    return null;
  }
}

/**
 * Resolve an aliased import like '@/lib/db/users' using tsconfig paths.
 * Falls back to baseUrl resolution if no paths match.
 */
function resolveAliasImport(fromFile: string, importPath: string): string | null {
  const projectRoot = findProjectRoot(fromFile);
  if (!projectRoot) return null;

  const config = loadTsConfigPaths(projectRoot);
  if (!config) return null;

  // Try explicit path patterns first (e.g. "@/*" → "src/*")
  for (const { prefix, directories } of config.patterns) {
    if (importPath.startsWith(prefix)) {
      const rest = importPath.slice(prefix.length);
      for (const dir of directories) {
        const candidate = path.normalize(path.join(dir, rest));
        const resolved = tryResolveFile(candidate);
        if (resolved) return resolved;
      }
    }
  }

  // Fallback: try resolving from baseUrl directly
  const fromBaseUrl = path.normalize(path.join(config.baseUrl, importPath));
  return tryResolveFile(fromBaseUrl);
}

/**
 * Check if an import specifier is a node_module package (not a path alias).
 * Known packages start with a lowercase letter or @scope/package.
 * Path aliases typically use @/ ~/ # or other non-standard prefixes.
 */
function isNodeModule(specifier: string): boolean {
  // Scoped packages: @nestjs/common, @types/node, etc. (but NOT @/ or @components/)
  if (specifier.startsWith('@')) {
    // @scope/package has a letter after @, then /, then a letter — no path separators after the package name
    // @/ is a path alias (shorthand)
    if (specifier.length < 2 || specifier[1] === '/') return false;
    // @nestjs/common → scoped package; @components/Button → could be alias
    // Heuristic: known scopes are lowercase and short (< 20 chars before /)
    const slashIdx = specifier.indexOf('/');
    if (slashIdx === -1) return true; // @something with no slash → treat as package
    const scope = specifier.slice(1, slashIdx);
    // If scope contains path-like patterns, it's an alias
    if (scope.includes('.') || scope.includes('~')) return false;
    // If the part after @scope/ contains a /, it's likely a deep import from an alias
    const afterScope = specifier.slice(slashIdx + 1);
    if (afterScope.includes('/')) return false;
    return true;
  }

  // Bare specifiers: react, express, fs, path
  // Must start with a letter and not contain path prefixes like ~ or #
  if (/^[a-z]/i.test(specifier) && !specifier.includes('/')) return true;

  // Packages with subpath: react/jsx-runtime, express/lib/router
  if (/^[a-z][a-z0-9.-]*\//i.test(specifier)) return true;

  // Aliases like ~/ #/ etc. are NOT node modules
  return false;
}

/** Extract parameter names from AST param nodes */
function extractParams(params: any[] | undefined): string[] {
  if (!params) return [];
  return params.map((p: any) => {
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern' && p.left?.name) return p.left.name;
    if (p.type === 'RestElement' && p.argument?.name) return `...${p.argument.name}`;
    if (p.type === 'ObjectPattern') return '{ ... }';
    if (p.type === 'ArrayPattern') return '[ ... ]';
    return '?';
  });
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
      // Extract imports (relative + aliased)
      if (stmt.type === 'ImportDeclaration') {
        const src = stmt.source.value as string;
        let resolved: string | null = null;

        if (src.startsWith('./') || src.startsWith('../')) {
          // Relative import
          resolved = resolveImport(filePath, src);
        } else if (!src.startsWith('.') && !isNodeModule(src)) {
          // Non-relative, non-node_module → likely a path alias (@/, ~/, etc.)
          resolved = resolveAliasImport(filePath, src);
        }

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

    // ─── Method Extraction ─────────────────────────────────────────
    const methods: MethodInfo[] = [];

    for (const stmt of ast.body) {
      // Top-level function declarations
      if (stmt.type === 'FunctionDeclaration' && stmt.id) {
        methods.push({
          name: stmt.id.name,
          line: stmt.loc?.start.line ?? 0,
          endLine: stmt.loc?.end.line ?? 0,
          kind: 'function',
          exported: false,
          params: extractParams(stmt.params),
        });
      }

      // Exported function declarations
      if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
        const decl = stmt.declaration as any;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          methods.push({
            name: decl.id.name,
            line: decl.loc?.start.line ?? 0,
            endLine: decl.loc?.end.line ?? 0,
            kind: 'function',
            exported: true,
            params: extractParams(decl.params),
          });
        }
        // Exported arrow functions: export const foo = () => {}
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') && d.id?.name) {
              methods.push({
                name: d.id.name,
                line: d.loc?.start.line ?? 0,
                endLine: d.loc?.end.line ?? 0,
                kind: 'arrow',
                exported: true,
                params: extractParams(d.init.params),
              });
            }
          }
        }
      }

      // Non-exported arrow functions in variable declarations
      if (stmt.type === 'VariableDeclaration') {
        for (const d of (stmt as any).declarations) {
          if (d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') && d.id?.name) {
            methods.push({
              name: d.id.name,
              line: d.loc?.start.line ?? 0,
              endLine: d.loc?.end.line ?? 0,
              kind: 'arrow',
              exported: false,
              params: extractParams(d.init.params),
            });
          }
        }
      }

      // Default export function
      if (stmt.type === 'ExportDefaultDeclaration') {
        const decl = stmt.declaration as any;
        if (decl.type === 'FunctionDeclaration') {
          methods.push({
            name: decl.id?.name ?? 'default',
            line: decl.loc?.start.line ?? 0,
            endLine: decl.loc?.end.line ?? 0,
            kind: 'function',
            exported: true,
            params: extractParams(decl.params),
          });
        }
      }

      // Class methods
      const classDecl = stmt.type === 'ClassDeclaration' ? stmt :
        (stmt.type === 'ExportNamedDeclaration' && (stmt.declaration as any)?.type === 'ClassDeclaration')
          ? stmt.declaration : null;

      if (classDecl) {
        const body = (classDecl as any).body?.body ?? [];
        for (const member of body) {
          if (member.type === 'MethodDefinition' && member.key?.name) {
            methods.push({
              name: member.key.name,
              line: member.loc?.start.line ?? 0,
              endLine: member.loc?.end.line ?? 0,
              kind: member.kind === 'get' ? 'getter' : member.kind === 'set' ? 'setter' : 'method',
              exported: stmt.type === 'ExportNamedDeclaration',
              params: extractParams(member.value?.params),
            });
          }
        }
      }
    }

    const node: OmniNode = {
      id: fileId,
      type: nodeType,
      label,
      metadata: { filePath, route },
      methods: methods.length > 0 ? methods : undefined,
    };

    return { nodes: [node], edges };
  }
}
