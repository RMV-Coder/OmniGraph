import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * PHP parser — handles .php files.
 *
 * Detects:
 * - use statements (use App\Http\Controllers\FooController;)
 * - require/include/require_once/include_once
 * - Laravel controllers (extends Controller)
 * - Laravel middleware (extends Middleware / implements Middleware)
 * - Laravel models (extends Model / extends Eloquent)
 * - Laravel route definitions in route files
 * - Namespace declarations
 * - Class definitions with inheritance
 */

/** Regex patterns for PHP constructs */
const PATTERNS = {
  /** use App\Http\Controllers\FooController; */
  useStatement: /^use\s+([\w\\]+)(?:\s+as\s+\w+)?;/,
  /** require 'file.php'; require_once 'file.php'; include 'file.php'; include_once 'file.php'; */
  requireInclude: /^(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]\s*\)?\s*;/,
  /** require __DIR__ . '/file.php'; */
  requireDir: /^(?:require|include)(?:_once)?\s*\(?\s*__DIR__\s*\.\s*['"]([^'"]+)['"]\s*\)?\s*;/,
  /** namespace App\Http\Controllers; */
  namespace: /^namespace\s+([\w\\]+)\s*;/,
  /** class Foo extends Bar implements Baz, Qux */
  classDef: /^(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w\\]+))?(?:\s+implements\s+([\w\\,\s]+))?/,
  /** interface Foo extends Bar */
  interfaceDef: /^interface\s+(\w+)(?:\s+extends\s+([\w\\,\s]+))?/,
  /** trait Foo */
  traitDef: /^trait\s+(\w+)/,
  /** use SomeTrait; (inside class body) */
  useTrait: /^\s+use\s+(\w[\w\\]*(?:\s*,\s*\w[\w\\]*)*)\s*;/,
  /** Route::get('/path', [Controller::class, 'method']); */
  laravelRoute: /Route::(get|post|put|delete|patch|options|any|match|resource|apiResource)\s*\(\s*['"]([^'"]*)['"]/,
  /** public function foo() */
  methodDef: /^(?:public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\(/,
  /** public function foo(string $a, int $b = 0) — captures visibility, name, params */
  methodDefFull: /^(public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
  /** function foo($a, $b) — standalone (no visibility) */
  funcDefFull: /^function\s+(\w+)\s*\(([^)]*)\)/,
};

/** Laravel base classes that indicate controller */
const LARAVEL_CONTROLLER_BASES = new Set([
  'Controller', 'BaseController', 'ResourceController',
  'FormRequest', 'Request',
]);

/** Laravel model base classes */
const LARAVEL_MODEL_BASES = new Set([
  'Model', 'Eloquent', 'Authenticatable', 'Pivot',
]);

/** Laravel middleware indicators */
const LARAVEL_MIDDLEWARE_BASES = new Set([
  'Middleware', 'FormRequest',
]);

/** Resolve a PHP require/include to an actual file */
function resolvePhpInclude(
  fromFile: string,
  includePath: string,
): string | null {
  // Relative path from the current file
  const resolved = path.resolve(path.dirname(fromFile), includePath);
  if (fs.existsSync(resolved)) return resolved;

  // Try adding .php extension
  if (!resolved.endsWith('.php') && fs.existsSync(resolved + '.php')) {
    return resolved + '.php';
  }

  return null;
}

/** Resolve a PHP use statement (namespace) to a file path using PSR-4 conventions */
function resolveUseStatement(
  rootDir: string | undefined,
  fqcn: string,
): string | null {
  if (!rootDir) return null;

  // Convert namespace to path: App\Http\Controllers\UserController → App/Http/Controllers/UserController.php
  const relativePath = fqcn.replace(/\\/g, '/') + '.php';

  // Common PSR-4 source directories
  const srcDirs = ['src', 'app', 'lib', ''];
  for (const srcDir of srcDirs) {
    const candidate = srcDir
      ? path.join(rootDir, srcDir, relativePath)
      : path.join(rootDir, relativePath);
    if (fs.existsSync(candidate)) return candidate;

    // Try without the top-level namespace (e.g., App\Foo → Foo.php in src/)
    const parts = relativePath.split('/');
    if (parts.length > 1) {
      const withoutTop = parts.slice(1).join('/');
      const altCandidate = srcDir
        ? path.join(rootDir, srcDir, withoutTop)
        : path.join(rootDir, withoutTop);
      if (fs.existsSync(altCandidate)) return altCandidate;
    }
  }

  return null;
}

export class PhpParser implements IParser {
  private rootDir: string | undefined;

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  canHandle(filePath: string): boolean {
    return /\.php$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, '.php');
    const edges: OmniEdge[] = [];
    const rawLines = source.split('\n');
    const lines = rawLines.map(l => l.trim());

    let nodeType = 'php-file';
    let namespace = '';
    let route = '';
    let framework = '';
    const classes: string[] = [];
    const methods: string[] = [];
    const useStatements: string[] = [];
    const methodInfos: MethodInfo[] = [];
    let isRouteFile = false;
    let insideClass = false;

    // Detect if this is a Laravel route file
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (/\/routes\//.test(normalizedPath)) {
      isRouteFile = true;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and empty lines
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line === '' || line === '<?php') {
        continue;
      }

      // --- Namespace ---
      const nsMatch = line.match(PATTERNS.namespace);
      if (nsMatch) {
        namespace = nsMatch[1];
        continue;
      }

      // --- Use statements (namespace imports, not trait use) ---
      const useMatch = line.match(PATTERNS.useStatement);
      if (useMatch) {
        const fqcn = useMatch[1];
        useStatements.push(fqcn);

        const resolved = resolveUseStatement(this.rootDir, fqcn);
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

      // --- Require/include ---
      const reqDirMatch = line.match(PATTERNS.requireDir);
      if (reqDirMatch) {
        // __DIR__ . '/file.php' — the captured path is relative to the file's directory
        // Strip leading slash/backslash since it's relative to __DIR__, not filesystem root
        const includePath = reqDirMatch[1].replace(/^[/\\]/, '');
        const resolved = resolvePhpInclude(filePath, includePath);
        if (resolved) {
          const targetId = resolved.replace(/\\/g, '/');
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'requires',
          });
        }
        continue;
      }

      const reqMatch = line.match(PATTERNS.requireInclude);
      if (reqMatch) {
        const resolved = resolvePhpInclude(filePath, reqMatch[1]);
        if (resolved) {
          const targetId = resolved.replace(/\\/g, '/');
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'requires',
          });
        }
        continue;
      }

      // --- Class definition ---
      const classMatch = line.match(PATTERNS.classDef);
      if (classMatch) {
        const [, className, extendsClass] = classMatch;
        classes.push(className);
        insideClass = true;

        if (extendsClass) {
          const baseName = extendsClass.split('\\').pop() ?? extendsClass;

          if (LARAVEL_CONTROLLER_BASES.has(baseName)) {
            nodeType = 'php-laravel-controller';
            framework = 'laravel';
          } else if (LARAVEL_MODEL_BASES.has(baseName)) {
            nodeType = 'php-laravel-model';
            framework = 'laravel';
          } else if (LARAVEL_MIDDLEWARE_BASES.has(baseName)) {
            nodeType = 'php-laravel-middleware';
            framework = 'laravel';
          }
        }
        continue;
      }

      // --- Interface ---
      const ifMatch = line.match(PATTERNS.interfaceDef);
      if (ifMatch) {
        classes.push(ifMatch[1]);
        continue;
      }

      // --- Trait ---
      const traitMatch = line.match(PATTERNS.traitDef);
      if (traitMatch) {
        classes.push(traitMatch[1]);
        continue;
      }

      // --- Laravel routes ---
      const routeMatch = line.match(PATTERNS.laravelRoute);
      if (routeMatch) {
        const [, httpMethod, routePath] = routeMatch;
        if (isRouteFile) {
          nodeType = 'php-laravel-route';
          framework = 'laravel';
        }
        route = route
          ? `${route}, ${httpMethod.toUpperCase()} ${routePath}`
          : `${httpMethod.toUpperCase()} ${routePath}`;
        continue;
      }

      // --- Method / function detection with MethodInfo ---
      const methodFullMatch = line.match(PATTERNS.methodDefFull);
      const methodMatch = line.match(PATTERNS.methodDef);
      const funcFullMatch = !methodMatch ? line.match(PATTERNS.funcDefFull) : null;

      if (methodMatch || funcFullMatch) {
        let funcName: string;
        let params: string[] = [];
        let exported = true;

        if (methodFullMatch) {
          const [, visibility, name, rawParams] = methodFullMatch;
          funcName = name;
          exported = visibility === 'public';
          if (rawParams.trim()) {
            for (const p of rawParams.split(',')) {
              // Extract $variable name, strip type hints and defaults
              const varMatch = p.match(/\$(\w+)/);
              if (varMatch) params.push('$' + varMatch[1]);
            }
          }
        } else if (funcFullMatch) {
          funcName = funcFullMatch[1];
          const rawParams = funcFullMatch[2];
          if (rawParams.trim()) {
            for (const p of rawParams.split(',')) {
              const varMatch = p.match(/\$(\w+)/);
              if (varMatch) params.push('$' + varMatch[1]);
            }
          }
        } else {
          funcName = methodMatch![1];
        }

        methods.push(funcName);

        // Estimate endLine by scanning for next function/class or closing brace pattern
        let endLine = i;
        let braceDepth = 0;
        let foundOpen = false;
        for (let j = i; j < rawLines.length; j++) {
          const rawLine = rawLines[j];
          for (const ch of rawLine) {
            if (ch === '{') { braceDepth++; foundOpen = true; }
            if (ch === '}') braceDepth--;
          }
          if (foundOpen && braceDepth <= 0) {
            endLine = j;
            break;
          }
          endLine = j;
        }

        const kind: MethodInfo['kind'] = insideClass ? 'method' : 'function';
        methodInfos.push({
          name: funcName,
          line: i + 1,
          endLine: endLine + 1,
          kind,
          exported,
          params,
        });
        continue;
      }
    }

    const metadata: Record<string, string> = {
      filePath,
      route,
      language: 'php',
    };
    if (namespace) metadata.namespace = namespace;
    if (framework) metadata.framework = framework;
    if (classes.length > 0) metadata.classes = classes.join(', ');
    if (methods.length > 0) metadata.methods = methods.slice(0, 10).join(', ');

    const node: OmniNode = { id: fileId, type: nodeType, label, metadata };
    if (methodInfos.length > 0) {
      node.methods = methodInfos;
    }
    return { nodes: [node], edges };
  }
}
