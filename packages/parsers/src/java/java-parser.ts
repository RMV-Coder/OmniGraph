import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Java parser — handles .java files.
 *
 * Detects:
 * - Package declarations
 * - Import statements
 * - Class, interface, enum, record definitions
 * - Spring annotations (@RestController, @Service, @Repository, @Component, @Entity)
 * - Spring request mappings (@GetMapping, @PostMapping, @RequestMapping)
 * - Method definitions with parameters
 * - Inheritance (extends, implements)
 */

const PATTERNS = {
  /** package com.example.foo; */
  packageDecl: /^package\s+([\w.]+)\s*;/,
  /** import com.example.foo.Bar; or import static com.example.foo.Bar.method; */
  importDecl: /^import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/,
  /** @RestController, @Service, etc. */
  annotation: /^@(\w+)(?:\(([^)]*)\))?/,
  /** @GetMapping("/path") or @RequestMapping(value = "/path", method = RequestMethod.GET) */
  mappingAnnotation: /^@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*\(([^)]*)\)/,
  /** public class Foo extends Bar implements Baz, Qux { */
  classDef: /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s]+))?\s*\{?/,
  /** public interface Foo extends Bar { */
  interfaceDef: /^(?:public\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.,\s]+))?\s*\{?/,
  /** public enum Foo { */
  enumDef: /^(?:public\s+)?enum\s+(\w+)/,
  /** public record Foo(String name, int age) { */
  recordDef: /^(?:public\s+)?record\s+(\w+)/,
  /** public ReturnType methodName(params) { */
  methodDef: /^(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]*>\s+)?(?:[\w.<>\[\],?\s]+?)\s+(\w+)\s*\(([^)]*)\)/,
  /** @Override */
  overrideAnnotation: /^@Override/,
};

/** Spring stereotype annotations and what node type they map to */
const SPRING_STEREOTYPES: Record<string, string> = {
  'RestController': 'java-spring-controller',
  'Controller': 'java-spring-controller',
  'Service': 'java-spring-service',
  'Repository': 'java-spring-repository',
  'Component': 'java-spring-component',
  'Configuration': 'java-spring-config',
  'Entity': 'java-spring-entity',
  'Document': 'java-spring-entity',
  'Table': 'java-spring-entity',
};

/** Spring HTTP method mappings */
const SPRING_MAPPINGS: Record<string, string> = {
  'GetMapping': 'GET',
  'PostMapping': 'POST',
  'PutMapping': 'PUT',
  'PatchMapping': 'PATCH',
  'DeleteMapping': 'DELETE',
  'RequestMapping': '*',
};

/** Extract path from Spring mapping annotation value */
function extractMappingPath(annotationArgs: string): string {
  // Handle: "/path" or value = "/path" or {"/path1", "/path2"}
  const pathMatch = annotationArgs.match(/(?:value\s*=\s*)?["']([^"']+)["']/);
  return pathMatch ? pathMatch[1] : '';
}

/** Extract HTTP method from @RequestMapping */
function extractRequestMethod(annotationArgs: string): string {
  const methodMatch = annotationArgs.match(/method\s*=\s*RequestMethod\.(\w+)/);
  return methodMatch ? methodMatch[1].toUpperCase() : '*';
}

export class JavaParser implements IParser {
  private rootDir: string | undefined;

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  canHandle(filePath: string): boolean {
    return /\.java$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, '.java');
    const edges: OmniEdge[] = [];
    const rawLines = source.split('\n');
    const lines = rawLines.map(l => l.trim());

    let nodeType = 'java-file';
    let packageName = '';
    let framework = '';
    const classes: string[] = [];
    const functions: string[] = [];
    const routes: string[] = [];
    const imports: string[] = [];
    const methodInfos: MethodInfo[] = [];
    let classBasePath = ''; // @RequestMapping at class level
    let insideClass = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line === '') continue;

      // Package declaration
      const pkgMatch = line.match(PATTERNS.packageDecl);
      if (pkgMatch) {
        packageName = pkgMatch[1];
        continue;
      }

      // Import
      const importMatch = line.match(PATTERNS.importDecl);
      if (importMatch) {
        const importPath = importMatch[1];
        imports.push(importPath);

        // Detect Spring framework
        if (importPath.startsWith('org.springframework')) {
          framework = 'spring';
        }

        // Try resolving local imports
        const resolved = this.resolveImport(importPath);
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

      // Spring stereotype annotations (must come before class def)
      const annotationMatch = line.match(PATTERNS.annotation);
      if (annotationMatch) {
        const annoName = annotationMatch[1];
        if (SPRING_STEREOTYPES[annoName]) {
          nodeType = SPRING_STEREOTYPES[annoName];
          framework = 'spring';
        }
        // Class-level @RequestMapping
        if (annoName === 'RequestMapping' && annotationMatch[2]) {
          classBasePath = extractMappingPath(annotationMatch[2]);
        }
      }

      // Spring mapping annotations (method-level routes)
      const mappingMatch = line.match(PATTERNS.mappingAnnotation);
      if (mappingMatch) {
        const [, mappingType, args] = mappingMatch;
        let method = SPRING_MAPPINGS[mappingType] ?? '*';
        const routePath = extractMappingPath(args);
        if (mappingType === 'RequestMapping') {
          method = extractRequestMethod(args);
        }
        const fullPath = classBasePath && routePath
          ? `${classBasePath}${routePath.startsWith('/') ? '' : '/'}${routePath}`
          : routePath || classBasePath;
        if (fullPath) {
          routes.push(`${method} ${fullPath}`);
        }
        continue;
      }

      // Class definition
      const classMatch = line.match(PATTERNS.classDef);
      if (classMatch) {
        classes.push(classMatch[1]);
        insideClass = true;
        continue;
      }

      // Interface
      const ifMatch = line.match(PATTERNS.interfaceDef);
      if (ifMatch) {
        classes.push(ifMatch[1]);
        continue;
      }

      // Enum
      const enumMatch = line.match(PATTERNS.enumDef);
      if (enumMatch) {
        classes.push(enumMatch[1]);
        continue;
      }

      // Record
      const recordMatch = line.match(PATTERNS.recordDef);
      if (recordMatch) {
        classes.push(recordMatch[1]);
        continue;
      }

      // Method definition
      if (line.match(PATTERNS.overrideAnnotation)) continue;
      const methodMatch = line.match(PATTERNS.methodDef);
      if (methodMatch) {
        const [, name, rawParams] = methodMatch;
        functions.push(name);

        const params: string[] = [];
        if (rawParams.trim()) {
          for (const p of rawParams.split(',')) {
            const parts = p.trim().split(/\s+/);
            // Last part is the param name (after type annotation)
            const paramName = parts[parts.length - 1];
            if (paramName) params.push(paramName);
          }
        }

        const endLine = this.findMethodEnd(rawLines, i);
        const isPublic = line.startsWith('public');
        methodInfos.push({
          name,
          line: i + 1,
          endLine: endLine + 1,
          kind: insideClass ? 'method' : 'function',
          exported: isPublic,
          params,
        });
        continue;
      }
    }

    const metadata: Record<string, string> = {
      filePath,
      language: 'java',
      route: routes.join(', '),
    };
    if (packageName) metadata.package = packageName;
    if (framework) metadata.framework = framework;
    if (classes.length > 0) metadata.classes = classes.join(', ');
    if (functions.length > 0) metadata.functions = functions.slice(0, 10).join(', ');

    const node: OmniNode = { id: fileId, type: nodeType, label, metadata };
    if (methodInfos.length > 0) node.methods = methodInfos;
    return { nodes: [node], edges };
  }

  /** Try to resolve a Java import to a local file */
  private resolveImport(importPath: string): string | null {
    if (!this.rootDir) return null;
    // Strip wildcard imports
    const cleanPath = importPath.replace(/\.\*$/, '');
    const relativePath = cleanPath.replace(/\./g, '/') + '.java';

    // Common Java source directories
    const srcDirs = ['src/main/java', 'src', 'app/src/main/java', ''];
    for (const srcDir of srcDirs) {
      const candidate = srcDir
        ? path.join(this.rootDir, srcDir, relativePath)
        : path.join(this.rootDir, relativePath);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private findMethodEnd(rawLines: string[], startLine: number): number {
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
