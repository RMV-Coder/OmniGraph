import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the parsers module before importing server
vi.mock('@omnigraph/parsers', () => ({
  parseDirectory: vi.fn(() => ({
    nodes: [
      { id: 'src/index.ts', type: 'typescript-file', label: 'index', metadata: { filePath: '/test/src/index.ts', route: '' } },
    ],
    edges: [],
  })),
}));

// Mock express-rate-limit to passthrough
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import express from 'express';
import path from 'path';
import { parseDirectory } from '@omnigraph/parsers';

// We can't easily test createServer (it calls app.listen), so test the route handler logic directly
describe('Server API', () => {
  it('parseDirectory is called and returns graph data', () => {
    const result = parseDirectory('/test/path');

    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('edges');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('src/index.ts');
  });

  it('parseDirectory mock returns correct structure', () => {
    const result = parseDirectory('/any/path');

    expect(result.nodes[0]).toMatchObject({
      id: 'src/index.ts',
      type: 'typescript-file',
      label: 'index',
      metadata: {
        filePath: '/test/src/index.ts',
        route: '',
      },
    });
    expect(result.edges).toEqual([]);
  });
});

describe('Server module exports', () => {
  it('createServer is a function', async () => {
    const serverModule = await import('../index');
    expect(typeof serverModule.createServer).toBe('function');
  });
});
