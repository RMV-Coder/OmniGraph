import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge, MethodInfo } from '../types';
import * as path from 'path';

/**
 * Schema parser — handles OpenAPI/Swagger (.json/.yaml/.yml) and
 * GraphQL (.graphql/.gql) schema files.
 *
 * Detects:
 * - OpenAPI path endpoints with HTTP methods
 * - OpenAPI schema models (components/schemas or definitions)
 * - GraphQL type definitions (type, input, enum, interface)
 * - GraphQL Query/Mutation/Subscription root fields
 */

/** Regex patterns for GraphQL constructs */
const GQL_PATTERNS = {
  /** type Foo { ... } or type Foo implements Bar { ... } */
  typeDef: /^type\s+(\w+)(?:\s+implements\s+[\w\s&,]+)?\s*\{/,
  /** input Foo { ... } */
  inputDef: /^input\s+(\w+)\s*\{/,
  /** enum Foo { ... } */
  enumDef: /^enum\s+(\w+)\s*\{/,
  /** interface Foo { ... } */
  interfaceDef: /^interface\s+(\w+)\s*\{/,
  /** scalar Foo */
  scalarDef: /^scalar\s+(\w+)/,
  /** union Foo = A | B */
  unionDef: /^union\s+(\w+)/,
  /** schema { query: Query, mutation: Mutation } */
  schemaDef: /^schema\s*\{/,
  /** field: Type or field(args): Type */
  field: /^\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*\[?(\w+)/,
};

/** Known OpenAPI file patterns */
function isOpenApiFile(filePath: string, source: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  // Check filename patterns
  if (/^(openapi|swagger|api-spec|api_spec)\b/i.test(base)) return true;
  // Check content for OpenAPI markers
  if (source.includes('"openapi"') || source.includes("'openapi'") || source.includes('openapi:')) return true;
  if (source.includes('"swagger"') || source.includes("'swagger'") || source.includes('swagger:')) return true;
  return false;
}

function isGraphQlFile(filePath: string): boolean {
  return /\.(graphql|gql)$/i.test(filePath);
}

/** Parse a simple YAML-like line for key: value (handles quoted and unquoted) */
function parseYamlLine(line: string): { key: string; value: string; indent: number } | null {
  const match = line.match(/^(\s*)(['"]?)(\w[\w/{}.-]*)(['"]?)\s*:\s*(.*)$/);
  if (!match) return null;
  const indent = match[1].length;
  const key = match[3];
  let value = match[5].trim();
  // Strip quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value, indent };
}

/** Parse OpenAPI JSON spec */
function parseOpenApiJson(filePath: string, source: string): Partial<OmniGraph> {
  const fileId = filePath.replace(/\\/g, '/');
  const label = path.basename(filePath).replace(/\.[^.]+$/, '');
  const nodes: OmniNode[] = [];
  const edges: OmniEdge[] = [];
  const methods: MethodInfo[] = [];

  let spec: any;
  try {
    spec = JSON.parse(source);
  } catch {
    // Not valid JSON, return basic node
    return {
      nodes: [{ id: fileId, type: 'openapi-spec', label, metadata: { filePath, language: 'json' } }],
      edges: [],
    };
  }

  const version = spec.openapi ?? spec.swagger ?? '';
  const title = spec.info?.title ?? label;
  const routes: string[] = [];

  // Parse paths
  const paths = spec.paths ?? {};
  let lineCounter = 1;
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
      const operation = (pathItem as Record<string, any>)[method];
      if (!operation) continue;
      const opId = operation.operationId ?? `${method.toUpperCase()} ${pathStr}`;
      routes.push(`${method.toUpperCase()} ${pathStr}`);
      methods.push({
        name: opId,
        line: lineCounter,
        endLine: lineCounter,
        kind: 'function',
        exported: true,
        params: [],
      });
      lineCounter++;
    }
  }

  // Parse schema models
  const schemas = spec.components?.schemas ?? spec.definitions ?? {};
  const schemaNames = Object.keys(schemas);

  const metadata: Record<string, string> = {
    filePath,
    language: 'json',
    framework: 'openapi',
    route: routes.slice(0, 20).join(', '),
  };
  if (version) metadata.version = version;
  if (title) metadata.title = title;
  if (schemaNames.length > 0) metadata.schemas = schemaNames.slice(0, 20).join(', ');

  const node: OmniNode = {
    id: fileId,
    type: 'openapi-spec',
    label: title,
    metadata,
  };
  if (methods.length > 0) node.methods = methods;
  nodes.push(node);

  return { nodes, edges };
}

/** Parse OpenAPI YAML spec (simplified — handles common structures) */
function parseOpenApiYaml(filePath: string, source: string): Partial<OmniGraph> {
  const fileId = filePath.replace(/\\/g, '/');
  const label = path.basename(filePath).replace(/\.[^.]+$/, '');
  const lines = source.split('\n');
  const methods: MethodInfo[] = [];
  const routes: string[] = [];
  const schemaNames: string[] = [];
  let title = label;
  let version = '';
  let inPaths = false;
  let inSchemas = false;
  let currentPath = '';
  let pathsIndent = -1;
  let schemasIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseYamlLine(lines[i]);
    if (!parsed) continue;
    const { key, value, indent } = parsed;

    // Top-level keys
    if (indent === 0) {
      inPaths = key === 'paths';
      inSchemas = false;
      if (key === 'openapi' || key === 'swagger') version = value;
      pathsIndent = -1;
      schemasIndent = -1;
      continue;
    }

    // Title inside info block
    if (key === 'title' && value) title = value;

    // Detect components/schemas or definitions
    if (key === 'schemas' || key === 'definitions') {
      inSchemas = true;
      schemasIndent = indent;
      inPaths = false;
      continue;
    }

    // Inside paths block
    if (inPaths) {
      // Path entries start with / (e.g., /api/users)
      if (key.startsWith('/') || key.startsWith("'") || key.startsWith('"')) {
        currentPath = key.replace(/['"]/g, '');
        pathsIndent = indent;
        continue;
      }
      // HTTP methods under a path
      if (currentPath && indent > pathsIndent && /^(get|post|put|patch|delete|options|head)$/.test(key)) {
        routes.push(`${key.toUpperCase()} ${currentPath}`);
        // Look ahead for operationId
        let opId = `${key.toUpperCase()} ${currentPath}`;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextParsed = parseYamlLine(lines[j]);
          if (nextParsed && nextParsed.key === 'operationId') {
            opId = nextParsed.value;
            break;
          }
          if (nextParsed && nextParsed.indent <= indent) break;
        }
        methods.push({
          name: opId,
          line: i + 1,
          endLine: i + 1,
          kind: 'function',
          exported: true,
          params: [],
        });
        continue;
      }
    }

    // Inside schemas block — collect schema names
    if (inSchemas && indent === schemasIndent + 2) {
      schemaNames.push(key);
    }
  }

  const metadata: Record<string, string> = {
    filePath,
    language: 'yaml',
    framework: 'openapi',
    route: routes.slice(0, 20).join(', '),
  };
  if (version) metadata.version = version;
  if (title !== label) metadata.title = title;
  if (schemaNames.length > 0) metadata.schemas = schemaNames.slice(0, 20).join(', ');

  const node: OmniNode = {
    id: fileId,
    type: 'openapi-spec',
    label: title,
    metadata,
  };
  if (methods.length > 0) node.methods = methods;

  return { nodes: [node], edges: [] };
}

/** Parse GraphQL schema file */
function parseGraphQl(filePath: string, source: string): Partial<OmniGraph> {
  const fileId = filePath.replace(/\\/g, '/');
  const label = path.basename(filePath).replace(/\.[^.]+$/, '');
  const lines = source.split('\n');
  const methods: MethodInfo[] = [];
  const types: string[] = [];
  const edges: OmniEdge[] = [];

  let currentType = '';
  let isRootType = false;
  let braceDepth = 0;
  let typeStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#') || line === '') continue;

    // Type definitions
    for (const [patternName, regex] of Object.entries(GQL_PATTERNS)) {
      if (patternName === 'field' || patternName === 'schemaDef') continue;
      const match = line.match(regex);
      if (match) {
        currentType = match[1];
        types.push(currentType);
        isRootType = currentType === 'Query' || currentType === 'Mutation' || currentType === 'Subscription';
        typeStartLine = i;

        // Track braces
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        break;
      }
    }

    // Field detection inside root types (Query, Mutation, Subscription)
    if (isRootType && braceDepth > 0) {
      const fieldMatch = line.match(GQL_PATTERNS.field);
      if (fieldMatch) {
        const [, fieldName, returnType] = fieldMatch;
        methods.push({
          name: `${currentType}.${fieldName}`,
          line: i + 1,
          endLine: i + 1,
          kind: 'function',
          exported: true,
          params: [],
        });
      }
    }

    // Track braces for non-definition lines
    if (!Object.values(GQL_PATTERNS).some(r => r !== GQL_PATTERNS.field && line.match(r))) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        isRootType = false;
        currentType = '';
      }
    }
  }

  const metadata: Record<string, string> = {
    filePath,
    language: 'graphql',
    framework: 'graphql',
  };
  if (types.length > 0) metadata.types = types.slice(0, 20).join(', ');

  const node: OmniNode = {
    id: fileId,
    type: 'graphql-schema',
    label,
    metadata,
  };
  if (methods.length > 0) node.methods = methods;

  return { nodes: [node], edges };
}

export class SchemaParser implements IParser {
  canHandle(filePath: string): boolean {
    // GraphQL files
    if (isGraphQlFile(filePath)) return true;

    // JSON/YAML files that look like OpenAPI specs (checked via filename only;
    // content check happens in parse())
    const base = path.basename(filePath).toLowerCase();
    if (/^(openapi|swagger|api-spec|api_spec)\b/.test(base)) return true;

    return false;
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    // GraphQL
    if (isGraphQlFile(filePath)) {
      return parseGraphQl(filePath, source);
    }

    // OpenAPI — determine format
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
      return parseOpenApiJson(filePath, source);
    }
    if (ext === '.yaml' || ext === '.yml') {
      return parseOpenApiYaml(filePath, source);
    }

    // Fallback: try JSON parse
    if (source.trim().startsWith('{')) {
      return parseOpenApiJson(filePath, source);
    }
    return parseOpenApiYaml(filePath, source);
  }
}
