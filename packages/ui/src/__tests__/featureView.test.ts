import { describe, it, expect } from 'vitest';
import { buildFeatureView } from '../featureView';
import type { OmniGraph } from '../types';

function n(id: string, type: string, feature: string, featureName: string) {
  return { id, type, label: id, metadata: { feature, featureName } };
}

const graph: OmniGraph = {
  nodes: [
    n('a/route.ts', 'nextjs-api-route', 'feature-auth', 'Authentication'),
    n('a/svc.ts', 'typescript-file', 'feature-auth', 'Authentication'),
    n('p/route.ts', 'nextjs-api-route', 'feature-payment', 'Payments'),
    n('p/charge.ts', 'typescript-file', 'feature-payment', 'Payments'),
    n('lib/log.ts', 'typescript-file', '__shared', 'Shared'),
  ],
  edges: [
    { id: 'e1', source: 'a/route.ts', target: 'a/svc.ts', label: 'imports' },
    { id: 'e2', source: 'p/route.ts', target: 'p/charge.ts', label: 'imports' },
    { id: 'e3', source: 'p/charge.ts', target: 'a/svc.ts', label: 'imports' }, // payment → auth
  ],
};

describe('buildFeatureView', () => {
  it('files: returns the graph unchanged, not collapsed', () => {
    const r = buildFeatureView(graph, 'files');
    expect(r.collapsed).toBe(false);
    expect(r.graph.nodes).toHaveLength(5);
  });

  it('features: collapses to one node per feature with dependency edges', () => {
    const r = buildFeatureView(graph, 'features');
    expect(r.collapsed).toBe(true);
    // Two real features (shared excluded)
    expect(r.graph.nodes.map(x => x.id).sort()).toEqual(['fv:feature-auth', 'fv:feature-payment']);
    expect(r.graph.nodes.every(x => x.type === 'feature-summary')).toBe(true);
    expect(r.graph.nodes.find(x => x.id === 'fv:feature-auth')!.label).toBe('Authentication · 2');
    // payment → auth edge (from p/charge → a/svc)
    const edge = r.graph.edges.find(e => e.source === 'fv:feature-payment' && e.target === 'fv:feature-auth');
    expect(edge).toBeDefined();
    expect(edge!.label).toBe('1');
  });

  it('flows: keeps entry points and their immediate neighbors', () => {
    const r = buildFeatureView(graph, 'flows');
    expect(r.collapsed).toBe(false);
    const ids = r.graph.nodes.map(x => x.id).sort();
    // route entry points + their 1-hop neighbors; the disconnected shared util drops out
    expect(ids).toEqual(['a/route.ts', 'a/svc.ts', 'p/charge.ts', 'p/route.ts']);
    expect(r.graph.nodes.find(x => x.id === 'lib/log.ts')).toBeUndefined();
  });
});
