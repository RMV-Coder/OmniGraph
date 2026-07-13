import { describe, it, expect } from 'vitest';
import { detectFeatures } from '../feature-detector';
import { generateFeatureDocs } from '../feature-docs';
import type { OmniGraph, OmniNode, OmniEdge } from '../../types';

function node(id: string, type = 'typescript-file', metadata: Record<string, string> = {}): OmniNode {
  return { id, type, label: id.split('/').pop() ?? id, metadata: { ...metadata } };
}
function edge(source: string, target: string, label = 'imports'): OmniEdge {
  return { id: `e-${source}->${target}`, source, target, label };
}

/** Build a small graph with two features (Auth, Payments) where Payments
 *  depends on Auth via a cross-feature import. */
function sampleGraph(): OmniGraph {
  const g: OmniGraph = {
    nodes: [
      node('app/api/auth/route.ts', 'nextjs-api-route', { route: '/api/auth/login' }),
      node('app/api/auth/session.ts'),
      node('app/api/payments/route.ts', 'nextjs-api-route', { route: '/api/payments' }),
      node('app/api/payments/charge.ts'),
    ],
    edges: [
      edge('app/api/auth/route.ts', 'app/api/auth/session.ts'),
      edge('app/api/payments/route.ts', 'app/api/payments/charge.ts'),
      edge('app/api/payments/charge.ts', 'app/api/auth/session.ts'), // payments → auth
    ],
  };
  g.features = detectFeatures(g);
  return g;
}

function find(files: { path: string; content: string }[], p: string) {
  return files.find(f => f.path === p);
}

describe('generateFeatureDocs', () => {
  it('emits an index, a page per feature, and a JSON manifest', () => {
    const files = generateFeatureDocs(sampleGraph());
    expect(find(files, 'README.md')).toBeDefined();
    expect(find(files, 'features.json')).toBeDefined();
    expect(find(files, 'features/auth.md')).toBeDefined();
    expect(find(files, 'features/payment.md')).toBeDefined();
  });

  it('renders the index with a Mermaid feature map and a feature table', () => {
    const readme = find(generateFeatureDocs(sampleGraph()), 'README.md')!.content;
    expect(readme).toContain('# Feature Map');
    expect(readme).toContain('```mermaid');
    expect(readme).toContain('flowchart LR');
    expect(readme).toContain('| Feature | Files | Routes | Depends on |');
    expect(readme).toContain('[Authentication](features/auth.md)');
  });

  it('captures the cross-feature dependency (Payments depends on Authentication)', () => {
    const pay = find(generateFeatureDocs(sampleGraph()), 'features/payment.md')!.content;
    expect(pay).toContain('**Depends on:**');
    expect(pay).toContain('Authentication');
  });

  it('produces a valid, parseable JSON manifest with deps', () => {
    const manifest = JSON.parse(find(generateFeatureDocs(sampleGraph()), 'features.json')!.content);
    expect(manifest.tool).toBe('omnigraph');
    // slug is the natural representative form ("payments"); the doc filename
    // uses the canonical key ("payment").
    const pay = manifest.features.find((f: any) => f.slug === 'payments');
    expect(pay.dependsOn.map((d: any) => d.name)).toContain('Authentication');
    const auth = manifest.features.find((f: any) => f.slug === 'auth');
    expect(auth.usedBy.map((d: any) => d.name)).toContain('Payments');
  });

  it('renders a per-feature flowchart with entry points', () => {
    const auth = find(generateFeatureDocs(sampleGraph()), 'features/auth.md')!.content;
    expect(auth).toContain('## Flow');
    expect(auth).toContain('flowchart TD');
  });

  it('is deterministic across runs', () => {
    const a = JSON.stringify(generateFeatureDocs(sampleGraph()));
    const b = JSON.stringify(generateFeatureDocs(sampleGraph()));
    expect(a).toBe(b);
  });

  it('computes docs even when graph.features is absent (falls back to detect)', () => {
    const g = sampleGraph();
    delete g.features;
    const files = generateFeatureDocs(g);
    expect(find(files, 'README.md')).toBeDefined();
  });
});
