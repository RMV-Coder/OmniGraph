import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge } from '../types';
import { parse } from '@typescript-eslint/typescript-estree';
import * as path from 'path';

/** Minimal shape of a decorator node as emitted by typescript-estree */
interface DecoratorNode {
  expression: {
    type: string;
    callee?: { type: string; name: string };
    arguments?: Array<{ type: string; value?: unknown }>;
  };
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

export class TypeScriptParser implements IParser {
  canHandle(filePath: string): boolean {
    return /\.(ts|tsx)$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, path.extname(filePath));

    let ast: ReturnType<typeof parse>;
    try {
      ast = parse(source, { jsx: true, errorRecovery: true });
    } catch {
      return {
        nodes: [{ id: fileId, type: 'typescript-file', label, metadata: { filePath, route: '' } }],
        edges: [],
      };
    }

    const edges: OmniEdge[] = [];
    let nodeType = 'typescript-file';
    let route = '';

    for (const stmt of ast.body) {
      // Extract relative imports
      if (stmt.type === 'ImportDeclaration') {
        const src = stmt.source.value as string;
        if (src.startsWith('./') || src.startsWith('../')) {
          let targetId = path.normalize(
            path.join(path.dirname(filePath), src)
          ).replace(/\\/g, '/');
          if (!path.extname(targetId)) targetId += '.ts';
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'imports',
          });
        }
      }

      // Detect NestJS decorators on exported or top-level class declarations
      const isExportedClass =
        stmt.type === 'ExportNamedDeclaration' &&
        stmt.declaration?.type === 'ClassDeclaration';
      const isTopLevelClass = stmt.type === 'ClassDeclaration';

      if (isExportedClass || isTopLevelClass) {
        const decorators = ((stmt as unknown as { decorators?: DecoratorNode[] }).decorators) ?? [];
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
