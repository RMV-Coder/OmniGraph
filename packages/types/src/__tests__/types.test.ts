import { describe, it, expect } from 'vitest';
import type { OmniNode, OmniEdge, OmniGraph } from '../index';

describe('@omnigraph/types', () => {
  it('OmniNode interface is usable', () => {
    const node: OmniNode = {
      id: 'src/index.ts',
      type: 'typescript-file',
      label: 'index',
      metadata: { filePath: '/project/src/index.ts', route: '' },
    };

    expect(node.id).toBe('src/index.ts');
    expect(node.type).toBe('typescript-file');
    expect(node.label).toBe('index');
    expect(node.metadata.filePath).toBe('/project/src/index.ts');
  });

  it('OmniEdge interface is usable', () => {
    const edge: OmniEdge = {
      id: 'e-a->b',
      source: 'a',
      target: 'b',
      label: 'imports',
    };

    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
  });

  it('OmniGraph interface is usable', () => {
    const graph: OmniGraph = {
      nodes: [
        { id: 'a', type: 'typescript-file', label: 'a', metadata: {} },
      ],
      edges: [
        { id: 'e-a->b', source: 'a', target: 'b', label: 'imports' },
      ],
    };

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(1);
  });

  it('exports are importable at runtime', async () => {
    // Verify the module actually exports something (not just types)
    const mod = await import('../index');
    expect(mod).toBeDefined();
  });
});
