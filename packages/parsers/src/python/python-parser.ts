import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Python parser — handles .py files.
 *
 * Detects:
 * - Standard imports (import x, from x import y)
 * - Relative imports (from . import x, from ..pkg import y)
 * - FastAPI decorators (@app.get, @router.post, etc.)
 * - Flask decorators (@app.route, @blueprint.route)
 * - Django class-based views (extends View/APIView/ViewSet)
 * - Python class definitions and function definitions
 */

/** Recognized FastAPI/Flask HTTP method decorators */
const FASTAPI_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

/** Regex patterns for Python constructs */
const PATTERNS = {
  /** from x import y  OR  from x import (y, z) — captures module path */
  fromImport: /^from\s+(\.{0,3}[\w.]*)\s+import\s+/,
  /** import x.y.z — captures module path */
  plainImport: /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/,
  /** @something.method("/path") — captures object, method, and route */
  decorator: /^@(\w+)\.(route|get|post|put|delete|patch|options|head)\s*\(\s*["']([^"']*)["']/,
  /** @something.method(...) without route string */
  decoratorNoRoute: /^@(\w+)\.(route|get|post|put|delete|patch|options|head)\s*\(/,
  /** class Foo(Bar, Baz): — captures class name and bases */
  classDef: /^class\s+(\w+)\s*\(([^)]*)\)\s*:/,
  /** class Foo: — no bases */
  classDefSimple: /^class\s+(\w+)\s*:/,
  /** def foo(): — captures function name */
  funcDef: /^(?:async\s+)?def\s+(\w+)\s*\(/,
  /** def foo(param1, param2: str): — captures function name and params */
  funcDefFull: /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/,
};

/** Django base classes that indicate a view */
const DJANGO_VIEW_BASES = new Set([
  'View', 'TemplateView', 'ListView', 'DetailView', 'CreateView',
  'UpdateView', 'DeleteView', 'FormView', 'RedirectView',
  'APIView', 'GenericAPIView', 'ViewSet', 'ModelViewSet',
  'ReadOnlyModelViewSet', 'GenericViewSet',
]);

/** Resolve a relative Python import to a file path */
function resolvePythonImport(
  fromFile: string,
  modulePath: string,
  rootDir?: string,
): string | null {
  // Relative imports: from .foo import bar, from ..foo import bar
  if (modulePath.startsWith('.')) {
    const dots = modulePath.match(/^(\.+)/)?.[1].length ?? 0;
    const rest = modulePath.slice(dots).replace(/\./g, '/');
    let baseDir = path.dirname(fromFile);
    for (let i = 1; i < dots; i++) {
      baseDir = path.dirname(baseDir);
    }
    const basePath = rest ? path.join(baseDir, rest) : baseDir;
    return tryResolvePython(basePath);
  }

  // Absolute imports: try relative to the file's root
  const parts = modulePath.replace(/\./g, '/');

  // Try from the directory containing the file (common for local packages)
  if (rootDir) {
    const fromRoot = path.join(rootDir, parts);
    const resolved = tryResolvePython(fromRoot);
    if (resolved) return resolved;
  }

  // Try from the file's parent directories
  let dir = path.dirname(fromFile);
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, parts);
    const resolved = tryResolvePython(candidate);
    if (resolved) return resolved;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/** Try to resolve a base path to a Python file or package __init__.py */
function tryResolvePython(basePath: string): string | null {
  // Direct file: foo.py
  if (fs.existsSync(basePath + '.py')) return basePath + '.py';
  // Package: foo/__init__.py
  const initPath = path.join(basePath, '__init__.py');
  if (fs.existsSync(initPath)) return initPath;
  // Already a .py file
  if (basePath.endsWith('.py') && fs.existsSync(basePath)) return basePath;
  return null;
}

export class PythonParser implements IParser {
  private rootDir: string | undefined;

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  canHandle(filePath: string): boolean {
    return /\.py$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, '.py');
    const edges: OmniEdge[] = [];
    const rawLines = source.split('\n');
    const lines = rawLines.map(l => l.trimStart());

    let nodeType = 'python-file';
    const routes: string[] = [];
    let framework = '';
    const classes: string[] = [];
    const functions: string[] = [];
    const imports: string[] = [];
    const methodInfos: MethodInfo[] = [];

    // Track whether we are inside a class body (for method vs function distinction)
    let insideClass = false;
    let classIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rawLine = rawLines[i];
      const currentIndent = rawLine.length - rawLine.trimStart().length;

      // Skip comments and blank lines
      if (line.startsWith('#') || line === '') continue;

      // Track class scope by indentation: if we were inside a class and
      // encounter a non-empty line at the same or lesser indentation as the
      // class definition, we have left the class body.
      if (insideClass && currentIndent <= classIndent) {
        insideClass = false;
        classIndent = -1;
      }

      // --- Import detection ---
      const fromMatch = line.match(PATTERNS.fromImport);
      if (fromMatch) {
        const modulePath = fromMatch[1];
        imports.push(modulePath);

        const resolved = resolvePythonImport(filePath, modulePath, this.rootDir);
        if (resolved) {
          const targetId = resolved.replace(/\\/g, '/');
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'imports',
          });
        }
        continue;
      }

      const plainMatch = line.match(PATTERNS.plainImport);
      if (plainMatch) {
        const modulePaths = plainMatch[1].split(',').map(m => m.trim());
        for (const modulePath of modulePaths) {
          imports.push(modulePath);
          const resolved = resolvePythonImport(filePath, modulePath, this.rootDir);
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
        continue;
      }

      // --- Decorator detection (FastAPI/Flask) ---
      const decMatch = line.match(PATTERNS.decorator);
      if (decMatch) {
        const [, , method, routePath] = decMatch;
        if (FASTAPI_METHODS.has(method) || method === 'route') {
          nodeType = 'python-fastapi-route';
          routes.push(`${method.toUpperCase()} ${routePath}`);
          framework = 'fastapi';
        }
        continue;
      }

      const decNoRouteMatch = line.match(PATTERNS.decoratorNoRoute);
      if (decNoRouteMatch) {
        const [, , method] = decNoRouteMatch;
        if (FASTAPI_METHODS.has(method) || method === 'route') {
          nodeType = 'python-fastapi-route';
          framework = 'fastapi';
        }
        continue;
      }

      // --- Class detection ---
      const classMatch = line.match(PATTERNS.classDef);
      if (classMatch) {
        const [, className, bases] = classMatch;
        classes.push(className);
        insideClass = true;
        classIndent = currentIndent;
        const baseNames = bases.split(',').map(b => b.trim());

        // Django view detection
        for (const base of baseNames) {
          if (DJANGO_VIEW_BASES.has(base)) {
            nodeType = 'python-django-view';
            framework = 'django';
            break;
          }
        }

        // Django model detection
        if (baseNames.includes('Model') || baseNames.includes('models.Model')) {
          if (nodeType === 'python-file') {
            nodeType = 'python-django-model';
            framework = 'django';
          }
        }
        continue;
      }

      const classSimpleMatch = line.match(PATTERNS.classDefSimple);
      if (classSimpleMatch) {
        classes.push(classSimpleMatch[1]);
        insideClass = true;
        classIndent = currentIndent;
        continue;
      }

      // --- Function / method detection ---
      const funcFullMatch = line.match(PATTERNS.funcDefFull);
      const funcMatch = line.match(PATTERNS.funcDef);
      if (funcMatch) {
        const funcName = funcMatch[1];
        functions.push(funcName);

        // Extract parameters
        const params: string[] = [];
        if (funcFullMatch) {
          const rawParams = funcFullMatch[2];
          if (rawParams.trim()) {
            for (const p of rawParams.split(',')) {
              const paramName = p.trim()
                .replace(/\s*[:=].*$/, '')   // strip type annotations and defaults
                .replace(/^\*{1,2}/, '');     // strip * and ** prefixes
              if (paramName && paramName !== 'self' && paramName !== 'cls') {
                params.push(paramName);
              }
            }
          }
        }

        // Estimate endLine: scan forward for next def/class at same or lesser indent, or EOF
        const defIndent = currentIndent;
        let endLine = i; // default to same line
        for (let j = i + 1; j < rawLines.length; j++) {
          const nextRaw = rawLines[j];
          const nextTrimmed = nextRaw.trimStart();
          if (nextTrimmed === '' || nextTrimmed.startsWith('#')) continue;
          const nextIndent = nextRaw.length - nextTrimmed.length;
          if (nextIndent <= defIndent && (nextTrimmed.match(/^(?:async\s+)?def\s/) || nextTrimmed.match(/^class\s/))) {
            // endLine is the last content line before this new def/class
            endLine = j - 1;
            // Walk back past blank/comment lines
            while (endLine > i && rawLines[endLine].trim() === '') {
              endLine--;
            }
            break;
          }
          endLine = j;
        }

        const kind: MethodInfo['kind'] = insideClass ? 'method' : 'function';
        const exported = !funcName.startsWith('_');

        methodInfos.push({
          name: funcName,
          line: i + 1,        // 1-based
          endLine: endLine + 1, // 1-based
          kind,
          exported,
          params,
        });
        continue;
      }
    }

    const route = routes.join(', ');
    const metadata: Record<string, string> = {
      filePath,
      route,
      language: 'python',
    };
    if (framework) metadata.framework = framework;
    if (classes.length > 0) metadata.classes = classes.join(', ');
    if (functions.length > 0) metadata.functions = functions.slice(0, 10).join(', ');

    const node: OmniNode = { id: fileId, type: nodeType, label, metadata };
    if (methodInfos.length > 0) {
      node.methods = methodInfos;
    }
    return { nodes: [node], edges };
  }
}
