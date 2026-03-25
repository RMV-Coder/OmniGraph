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

    const node: OmniNode = {
      id: fileId,
      type: nodeType,
      label,
      metadata: { filePath, route },
    };

    return { nodes: [node], edges };
  }
}
