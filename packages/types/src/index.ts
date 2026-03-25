// ─── Core Graph Model ────────────────────────────────────────────────

export interface OmniNode {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, string>;
}

export interface OmniEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface OmniGraph {
  nodes: OmniNode[];
  edges: OmniEdge[];
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

export type FlowStepType = 'caller' | 'http-call' | 'route-handler' | 'dependency';

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

// ─── Future Placeholders ─────────────────────────────────────────────

export interface WebSocketConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  events: string[];
}

export type DatabaseEngine = 'mysql' | 'postgresql' | 'mongodb';

export interface DatabaseQuery {
  id: string;
  nodeId: string;
  engine: DatabaseEngine;
  query: string;
  table: string | null;
}
