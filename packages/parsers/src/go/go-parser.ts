import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Go parser — handles .go files.
 *
 * Detects:
 * - Package declarations
 * - Import statements (single and grouped)
 * - Struct definitions
 * - Interface definitions
 * - Function and method definitions with parameters
 * - HTTP handlers (net/http, gin, echo, fiber, chi, mux)
 * - Go module imports resolution via go.mod
 */

const PATTERNS = {
  /** package foo */
  packageDecl: /^package\s+(\w+)/,
  /** import "path" */
  singleImport: /^import\s+"([^"]+)"/,
  /** import ( ... ) — start of grouped import */
  groupedImportStart: /^import\s*\(/,
  /** "path" or alias "path" inside grouped import */
  groupedImportLine: /^\s*(?:\w+\s+)?"([^"]+)"/,
  /** type Foo struct { */
  structDef: /^type\s+(\w+)\s+struct\s*\{/,
  /** type Foo interface { */
  interfaceDef: /^type\s+(\w+)\s+interface\s*\{/,
  /** func Foo(params) returnType { */
  funcDef: /^func\s+(\w+)\s*\(([^)]*)\)/,
  /** func (r *Receiver) Foo(params) returnType { */
  methodDef: /^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\(([^)]*)\)/,
  /** r.GET("/path", handler) — gin */
  ginRoute: /\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any|Handle)\s*\(\s*"([^"]+)"/,
  /** e.GET("/path", handler) — echo */
  echoRoute: /\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*"([^"]+)"/,
  /** http.HandleFunc("/path", handler) */
  httpHandleFunc: /http\.\s*(HandleFunc|Handle)\s*\(\s*"([^"]+)"/,
  /** r.HandleFunc("/path", handler).Methods("GET") — gorilla/mux */
  muxRoute: /\.\s*HandleFunc\s*\(\s*"([^"]+)"/,
  /** fiber: app.Get("/path", handler) */
  fiberRoute: /\.\s*(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*"([^"]+)"/,
  /** chi: r.Get("/path", handler) */
  chiRoute: /\.\s*(Get|Post|Put|Patch|Delete|Head|Options|Handle|Method)\s*\(\s*"([^"]+)"/,
};

/** Known Go HTTP framework imports */
const HTTP_FRAMEWORK_IMPORTS: Record<string, string> = {
  'net/http': 'net-http',
  'github.com/gin-gonic/gin': 'gin',
  'github.com/labstack/echo': 'echo',
  'github.com/labstack/echo/v4': 'echo',
  'github.com/gofiber/fiber': 'fiber',
  'github.com/gofiber/fiber/v2': 'fiber',
  'github.com/go-chi/chi': 'chi',
  'github.com/go-chi/chi/v5': 'chi',
  'github.com/gorilla/mux': 'mux',
};

/** Try resolving a Go import to a local file */
function resolveGoImport(
  rootDir: string | undefined,
  importPath: string,
): string | null {
  if (!rootDir) return null;

  // Only resolve local/relative imports (not standard library or external packages)
  // Local packages: paths that match the module path from go.mod
  // Also try direct directory paths
  const candidate = path.join(rootDir, importPath);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    // Look for any .go file in the directory
    try {
      const files = fs.readdirSync(candidate);
      const goFile = files.find(f => f.endsWith('.go') && !f.endsWith('_test.go'));
      if (goFile) return path.join(candidate, goFile);
    } catch { /* ignore */ }
  }

  return null;
}

export class GoParser implements IParser {
  private rootDir: string | undefined;
  private modulePath: string | undefined;

  setRootDir(dir: string): void {
    this.rootDir = dir;
    // Try to read go.mod to get module path
    const goModPath = path.join(dir, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf-8');
        const match = content.match(/^module\s+(.+)$/m);
        if (match) this.modulePath = match[1].trim();
      } catch { /* ignore */ }
    }
  }

  canHandle(filePath: string): boolean {
    return /\.go$/.test(filePath) && !filePath.endsWith('_test.go');
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, '.go');
    const edges: OmniEdge[] = [];
    const rawLines = source.split('\n');
    const lines = rawLines.map(l => l.trim());

    let nodeType = 'go-file';
    let packageName = '';
    let framework = '';
    const structs: string[] = [];
    const interfaces: string[] = [];
    const functions: string[] = [];
    const routes: string[] = [];
    const imports: string[] = [];
    const methodInfos: MethodInfo[] = [];
    let inGroupedImport = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('//') || line === '') continue;

      // Package declaration
      const pkgMatch = line.match(PATTERNS.packageDecl);
      if (pkgMatch) {
        packageName = pkgMatch[1];
        if (packageName === 'main') nodeType = 'go-main';
        continue;
      }

      // Grouped import block
      if (PATTERNS.groupedImportStart.test(line)) {
        inGroupedImport = true;
        continue;
      }
      if (inGroupedImport) {
        if (line === ')') {
          inGroupedImport = false;
          continue;
        }
        const impMatch = line.match(PATTERNS.groupedImportLine);
        if (impMatch) {
          const importPath = impMatch[1];
          imports.push(importPath);
          if (HTTP_FRAMEWORK_IMPORTS[importPath]) {
            framework = HTTP_FRAMEWORK_IMPORTS[importPath];
          }
          this.tryResolveImport(importPath, fileId, edges);
        }
        continue;
      }

      // Single import
      const singleMatch = line.match(PATTERNS.singleImport);
      if (singleMatch) {
        imports.push(singleMatch[1]);
        if (HTTP_FRAMEWORK_IMPORTS[singleMatch[1]]) {
          framework = HTTP_FRAMEWORK_IMPORTS[singleMatch[1]];
        }
        this.tryResolveImport(singleMatch[1], fileId, edges);
        continue;
      }

      // Struct definition
      const structMatch = line.match(PATTERNS.structDef);
      if (structMatch) {
        structs.push(structMatch[1]);
        continue;
      }

      // Interface definition
      const ifMatch = line.match(PATTERNS.interfaceDef);
      if (ifMatch) {
        interfaces.push(ifMatch[1]);
        continue;
      }

      // Method definition (with receiver)
      const methodMatch = line.match(PATTERNS.methodDef);
      if (methodMatch) {
        const [, receiver, name, rawParams] = methodMatch;
        functions.push(`${receiver}.${name}`);

        const params = rawParams
          ? rawParams.split(',').map(p => p.trim().split(/\s+/)[0]).filter(Boolean)
          : [];

        const endLine = this.findFuncEnd(rawLines, i);
        methodInfos.push({
          name: `${receiver}.${name}`,
          line: i + 1,
          endLine: endLine + 1,
          kind: 'method',
          exported: name[0] === name[0].toUpperCase(),
          params,
        });
        continue;
      }

      // Function definition
      const funcMatch = line.match(PATTERNS.funcDef);
      if (funcMatch) {
        const [, name, rawParams] = funcMatch;
        functions.push(name);

        const params = rawParams
          ? rawParams.split(',').map(p => p.trim().split(/\s+/)[0]).filter(Boolean)
          : [];

        const endLine = this.findFuncEnd(rawLines, i);
        methodInfos.push({
          name,
          line: i + 1,
          endLine: endLine + 1,
          kind: 'function',
          exported: name[0] === name[0].toUpperCase(),
          params,
        });
        continue;
      }

      // Route detection
      const routePatterns = [
        PATTERNS.ginRoute, PATTERNS.echoRoute, PATTERNS.httpHandleFunc,
        PATTERNS.fiberRoute, PATTERNS.chiRoute,
      ];
      for (const rp of routePatterns) {
        const routeMatch = line.match(rp);
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase();
          const routePath = routeMatch[2];
          routes.push(`${method} ${routePath}`);
          nodeType = 'go-http-handler';
          break;
        }
      }
      const muxMatch = line.match(PATTERNS.muxRoute);
      if (muxMatch) {
        routes.push(`* ${muxMatch[1]}`);
        nodeType = 'go-http-handler';
      }
    }

    const metadata: Record<string, string> = {
      filePath,
      language: 'go',
      route: routes.join(', '),
    };
    if (packageName) metadata.package = packageName;
    if (framework) metadata.framework = framework;
    if (structs.length > 0) metadata.structs = structs.join(', ');
    if (interfaces.length > 0) metadata.interfaces = interfaces.join(', ');
    if (functions.length > 0) metadata.functions = functions.slice(0, 10).join(', ');

    const node: OmniNode = { id: fileId, type: nodeType, label, metadata };
    if (methodInfos.length > 0) node.methods = methodInfos;
    return { nodes: [node], edges };
  }

  private tryResolveImport(importPath: string, fileId: string, edges: OmniEdge[]): void {
    if (!this.rootDir || !this.modulePath) return;
    // Only resolve imports that are under our module path
    if (!importPath.startsWith(this.modulePath)) return;
    const relativePath = importPath.slice(this.modulePath.length + 1); // +1 for /
    const resolved = resolveGoImport(this.rootDir, relativePath);
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

  private findFuncEnd(rawLines: string[], startLine: number): number {
    let braceDepth = 0;
    let foundOpen = false;
    for (let j = startLine; j < rawLines.length; j++) {
      for (const ch of rawLines[j]) {
        if (ch === '{') { braceDepth++; foundOpen = true; }
        if (ch === '}') braceDepth--;
      }
      if (foundOpen && braceDepth <= 0) return j;
    }
    return startLine;
  }
}
