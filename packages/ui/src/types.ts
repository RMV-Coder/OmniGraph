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
