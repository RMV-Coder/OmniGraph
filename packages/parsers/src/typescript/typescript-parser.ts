import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge } from '../types';
import { parse } from '@typescript-eslint/typescript-estree';
import * as path from 'path';

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
      // Extract imports
      if (stmt.type === 'ImportDeclaration') {
        const src = stmt.source.value as string;
        if (src.startsWith('./') || src.startsWith('../')) {
          let targetId = path.normalize(
            path.join(path.dirname(filePath), src)
          ).replace(/\\/g, '/');
          // Add .ts extension if no extension
          if (!path.extname(targetId)) targetId += '.ts';
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'imports',
          });
        }
      }

      // Detect NestJS class decorators on exported class declarations
      if (
        stmt.type === 'ExportNamedDeclaration' &&
        stmt.declaration?.type === 'ClassDeclaration'
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decorators = (stmt as any).decorators ?? [];
        for (const dec of decorators) {
          const expr = dec.expression;
          if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
            const name = expr.callee.name as string;
            if (name === 'Controller') {
              nodeType = 'nestjs-controller';
              const arg = expr.arguments[0];
              if (arg?.type === 'Literal') route = String(arg.value);
            } else if (name === 'Injectable') {
              nodeType = 'nestjs-injectable';
            } else if (name === 'Module') {
              nodeType = 'nestjs-module';
            }
          }
        }
      }

      // Also handle class declarations at top level (without export)
      if (stmt.type === 'ClassDeclaration') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decorators = (stmt as any).decorators ?? [];
        for (const dec of decorators) {
          const expr = dec.expression;
          if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
            const name = expr.callee.name as string;
            if (name === 'Controller') {
              nodeType = 'nestjs-controller';
              const arg = expr.arguments[0];
              if (arg?.type === 'Literal') route = String(arg.value);
            } else if (name === 'Injectable') {
              nodeType = 'nestjs-injectable';
            } else if (name === 'Module') {
              nodeType = 'nestjs-module';
            }
          }
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
