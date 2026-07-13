// ─── Core Graph Model ────────────────────────────────────────────────

export interface MethodParam {
  name: string;
  /** Type annotation text, when available (TypeScript). e.g. "CreateUserDto" */
  type?: string;
}

export interface MethodInfo {
  name: string;
  line: number;
  endLine: number;
  kind: 'function' | 'method' | 'arrow' | 'getter' | 'setter';
  exported: boolean;
  params: MethodParam[];
  /** Return type annotation text, when available (TypeScript) */
  returnType?: string;
}

export interface OmniNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, string>;
  methods?: MethodInfo[];
}

export interface OmniEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

// ─── Feature Grouping (P0) ───────────────────────────────────────────
// A derived, higher-level view over the graph: nodes are clustered into
// human-meaningful "features" (Authentication, Payments, …) using route
// paths, directory structure, and edge connectivity. Non-invasive —
// membership is also stamped onto each member node's
// `metadata.feature` / `metadata.featureName`.

export interface FeatureGroup {
  /** Stable id, e.g. "feature-auth" */
  id: string;
  /** Display name, e.g. "Authentication" */
  name: string;
  /** Normalized slug the feature was derived from, e.g. "auth" */
  slug: string;
  /** Which signal(s) produced this feature */
  source: 'route' | 'directory' | 'mixed';
  /** Ids of member nodes */
  nodeIds: string[];
  /** Route/controller nodes that named the feature */
  entryPointIds: string[];
  stats: { nodes: number; routes: number; entities: number };
}

export interface FeatureModel {
  features: FeatureGroup[];
  /** High-fan-in nodes shared across ≥2 features (e.g. logger, db client) */
  shared: string[];
  /** Nodes that couldn't be assigned to any feature */
  ungrouped: string[];
}

export interface OmniGraph {
  nodes: OmniNode[];
  edges: OmniEdge[];
  /** Derived feature clustering (attached by detectFeatures in parseDirectory) */
  features?: FeatureModel;
}

// ─── API Debugger ────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ProxyRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string | null;
}

export interface ProxyResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number; // milliseconds
}

// ─── Flow Tracer ─────────────────────────────────────────────────────

export type FlowStepType = 'caller' | 'http-call' | 'route-handler' | 'db-query' | 'db-join' | 'db-result' | 'dependency';

export interface FlowTraceStep {
  nodeId: string;
  label: string;
  description: string;
  edgeId: string | null;
  type: FlowStepType;
}

export interface FlowTrace {
  id: string;
  edgeId: string;
  steps: FlowTraceStep[];
}

// ─── Database Integration ────────────────────────────────────────────

export type DatabaseEngine = 'postgresql' | 'mongodb';

export interface DatabaseConnectionConfig {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  authSource?: string;        // MongoDB auth database (default: 'admin')
}

/**
 * Non-sensitive connection metadata saved in localStorage.
 * Credentials (username/password) are NEVER persisted on the client.
 */
export interface DatabaseSavedConnection {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  ssl?: boolean;
  authSource?: string;
}

/**
 * Server-side session token returned after successful credential submission.
 * The token references credentials stored in server memory only.
 */
export interface DatabaseSessionToken {
  token: string;
  connectionId: string;
}

/** Auto-detected database connection from .env files */
export interface DatabaseEnvConnection {
  source: string;             // e.g. '.env', '.env.local'
  envKey: string;             // e.g. 'DATABASE_URL', 'MONGO_URI'
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  hasPassword: boolean;       // true if password was found (never sent to client)
  ssl?: boolean;
}

export interface DatabaseColumn {
  name: string;
  type: string;               // e.g. 'integer', 'varchar(255)', 'ObjectId'
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
}

export interface DatabaseIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface DatabaseForeignKey {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedSchema?: string;
  referencedColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface DatabaseTable {
  name: string;
  schema?: string;            // PostgreSQL schema (e.g. 'public')
  type?: 'table' | 'view' | 'collection';
  columns: DatabaseColumn[];
  indexes: DatabaseIndex[];
  foreignKeys: DatabaseForeignKey[];
  rowCount?: number;
}

export interface DatabaseSchema {
  engine: DatabaseEngine;
  database: string;
  tables: DatabaseTable[];
}

export interface DatabaseQueryRequest {
  connection: DatabaseConnectionConfig;
  query: string;
  limit?: number;             // default 100, max 1000
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;           // milliseconds
}

export interface DatabaseConnectResult {
  success: boolean;
  error?: string;
  serverVersion?: string;
}

// ─── Future Placeholders ─────────────────────────────────────────────

export interface WebSocketConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  events: string[];
}
