import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Rust parser — handles .rs files.
 *
 * Detects:
 * - Module declarations (mod foo;)
 * - Use statements (use crate::foo::bar;)
 * - Struct and enum definitions
 * - Trait definitions
 * - Impl blocks
 * - Function and method definitions with parameters
 * - HTTP route handlers (Actix-web, Axum, Rocket, Warp)
 */

const PATTERNS = {
  /** mod foo; — external module declaration */
  modDecl: /^(?:pub\s+)?mod\s+(\w+)\s*;/,
  /** mod foo { — inline module */
  modBlock: /^(?:pub\s+)?mod\s+(\w+)\s*\{/,
  /** use crate::foo::bar; or use std::io::Read; */
  useStatement: /^(?:pub\s+)?use\s+([\w:]+(?:::\{[^}]+\}|::\*)?)\s*;/,
  /** struct Foo { or struct Foo; or struct Foo(T); */
  structDef: /^(?:pub\s+)?struct\s+(\w+)/,
  /** enum Foo { */
  enumDef: /^(?:pub\s+)?enum\s+(\w+)/,
  /** trait Foo { */
  traitDef: /^(?:pub\s+)?trait\s+(\w+)/,
  /** impl Foo { or impl Trait for Foo { */
  implBlock: /^impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)/,
  /** fn foo(params) -> ReturnType { */
  funcDef: /^(?:pub(?:\([\w:]+\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
  /** #[get("/path")] — Actix/Rocket attribute */
  routeAttr: /^#\[(get|post|put|patch|delete|head|options)\s*\(\s*"([^"]+)"/i,
  /** .route("/path", web::get().to(handler)) — Actix */
  actixRoute: /\.route\s*\(\s*"([^"]+)"\s*,\s*web::(get|post|put|patch|delete)\s*\(\)/,
  /** .get("/path", handler) — Axum/Warp */
  axumRoute: /\.(get|post|put|patch|delete)\s*\(\s*"([^"]+)"/,
};

/** Known Rust web framework crates */
const FRAMEWORK_CRATES: Record<string, string> = {
  'actix_web': 'actix',
  'actix-web': 'actix',
  'axum': 'axum',
  'rocket': 'rocket',
  'warp': 'warp',
  'tide': 'tide',
};

export class RustParser implements IParser {
  private rootDir: string | undefined;

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  canHandle(filePath: string): boolean {
    return /\.rs$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, '.rs');
    const edges: OmniEdge[] = [];
    const rawLines = source.split('\n');
    const lines = rawLines.map(l => l.trim());

    let nodeType = 'rust-file';
    let framework = '';
    const structs: string[] = [];
    const enums: string[] = [];
    const traits: string[] = [];
    const functions: string[] = [];
    const routes: string[] = [];
    const methodInfos: MethodInfo[] = [];
    let insideImpl = false;
    let pendingRouteAttr: { method: string; path: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('//') || line === '') continue;

      // Route attribute (Actix/Rocket) — applies to the next function
      const routeAttrMatch = line.match(PATTERNS.routeAttr);
      if (routeAttrMatch) {
        pendingRouteAttr = { method: routeAttrMatch[1].toUpperCase(), path: routeAttrMatch[2] };
        continue;
      }

      // Use statement
      const useMatch = line.match(PATTERNS.useStatement);
      if (useMatch) {
        const usePath = useMatch[1];
        // Detect framework imports
        for (const [crate, fw] of Object.entries(FRAMEWORK_CRATES)) {
          if (usePath.includes(crate.replace('-', '_'))) {
            framework = fw;
            break;
          }
        }
        // Resolve crate:: imports to local files
        if (usePath.startsWith('crate::')) {
          const resolved = this.resolveCrateImport(filePath, usePath);
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

      // Module declarations
      const modMatch = line.match(PATTERNS.modDecl);
      if (modMatch) {
        const modName = modMatch[1];
        const resolved = this.resolveModDecl(filePath, modName);
        if (resolved) {
          const targetId = resolved.replace(/\\/g, '/');
          edges.push({
            id: `e-${fileId}->${targetId}`,
            source: fileId,
            target: targetId,
            label: 'declares',
          });
        }
        continue;
      }

      // Struct definition
      const structMatch = line.match(PATTERNS.structDef);
      if (structMatch) {
        structs.push(structMatch[1]);
        continue;
      }

      // Enum definition
      const enumMatch = line.match(PATTERNS.enumDef);
      if (enumMatch) {
        enums.push(enumMatch[1]);
        continue;
      }

      // Trait definition
      const traitMatch = line.match(PATTERNS.traitDef);
      if (traitMatch) {
        traits.push(traitMatch[1]);
        continue;
      }

      // Impl block
      const implMatch = line.match(PATTERNS.implBlock);
      if (implMatch) {
        insideImpl = true;
        continue;
      }

      // Function definition
      const funcMatch = line.match(PATTERNS.funcDef);
      if (funcMatch) {
        const [, name, rawParams] = funcMatch;
        functions.push(name);

        // Handle pending route attribute
        if (pendingRouteAttr) {
          routes.push(`${pendingRouteAttr.method} ${pendingRouteAttr.path}`);
          nodeType = 'rust-http-handler';
          pendingRouteAttr = null;
        }

        const params: string[] = [];
        if (rawParams.trim()) {
          for (const p of rawParams.split(',')) {
            const paramName = p.trim().split(':')[0].trim().replace(/^&?\s*mut\s+/, '');
            if (paramName && paramName !== 'self' && paramName !== '&self' && paramName !== '&mut self') {
              params.push(paramName);
            }
          }
        }

        const endLine = this.findFuncEnd(rawLines, i);
        const isPublic = lines[i].startsWith('pub');
        methodInfos.push({
          name,
          line: i + 1,
          endLine: endLine + 1,
          kind: insideImpl ? 'method' : 'function',
          exported: isPublic,
          params,
        });
        continue;
      } else {
        pendingRouteAttr = null; // Clear if non-function follows attribute
      }

      // Inline route patterns
      const actixMatch = line.match(PATTERNS.actixRoute);
      if (actixMatch) {
        routes.push(`${actixMatch[2].toUpperCase()} ${actixMatch[1]}`);
        nodeType = 'rust-http-handler';
        continue;
      }
      const axumMatch = line.match(PATTERNS.axumRoute);
      if (axumMatch) {
        routes.push(`${axumMatch[1].toUpperCase()} ${axumMatch[2]}`);
        nodeType = 'rust-http-handler';
        continue;
      }

      // Track brace depth for impl blocks
      if (insideImpl) {
        let depth = 0;
        for (const ch of rawLines[i]) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        if (depth < 0) insideImpl = false;
      }
    }

    const metadata: Record<string, string> = {
      filePath,
      language: 'rust',
      route: routes.join(', '),
    };
    if (framework) metadata.framework = framework;
    if (structs.length > 0) metadata.structs = structs.join(', ');
    if (enums.length > 0) metadata.enums = enums.join(', ');
    if (traits.length > 0) metadata.traits = traits.join(', ');
    if (functions.length > 0) metadata.functions = functions.slice(0, 10).join(', ');

    const node: OmniNode = { id: fileId, type: nodeType, label, metadata };
    if (methodInfos.length > 0) node.methods = methodInfos;
    return { nodes: [node], edges };
  }

  /** Resolve a `mod foo;` to a file path: foo.rs or foo/mod.rs */
  private resolveModDecl(fromFile: string, modName: string): string | null {
    const dir = path.dirname(fromFile);
    // Try sibling: dir/foo.rs
    const sibling = path.join(dir, `${modName}.rs`);
    if (fs.existsSync(sibling)) return sibling;
    // Try directory: dir/foo/mod.rs
    const nested = path.join(dir, modName, 'mod.rs');
    if (fs.existsSync(nested)) return nested;
    return null;
  }

  /** Resolve a `use crate::foo::bar` to a file path */
  private resolveCrateImport(fromFile: string, usePath: string): string | null {
    if (!this.rootDir) return null;
    // Strip "crate::" prefix and split
    const parts = usePath.replace(/^crate::/, '').split('::');
    // Remove the last part if it's a specific item (function/type)
    // Try the full path first, then progressively shorter
    for (let len = parts.length; len >= 1; len--) {
      const subParts = parts.slice(0, len);
      const relativePath = subParts.join('/');

      // Try src/<path>.rs
      const srcCandidate = path.join(this.rootDir, 'src', `${relativePath}.rs`);
      if (fs.existsSync(srcCandidate)) return srcCandidate;

      // Try src/<path>/mod.rs
      const modCandidate = path.join(this.rootDir, 'src', relativePath, 'mod.rs');
      if (fs.existsSync(modCandidate)) return modCandidate;
    }
    return null;
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
