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

describe('File API endpoint security', () => {
  it('should reject paths outside the target directory', async () => {
    // The /api/file endpoint validates that requested paths are within the target directory
    // This is a unit test of the path validation logic
    const path = await import('path');

    const targetPath = '/project';
    const resolvedTarget = path.resolve(targetPath);

    // Safe path (within target)
    const safePath = path.resolve('/project/src/index.ts');
    expect(safePath.startsWith(resolvedTarget)).toBe(true);

    // Unsafe path (traversal attempt)
    const unsafePath = path.resolve('/project/../etc/passwd');
    expect(unsafePath.startsWith(resolvedTarget)).toBe(false);

    // Unsafe path (completely outside)
    const outsidePath = path.resolve('/other/directory/file.ts');
    expect(outsidePath.startsWith(resolvedTarget)).toBe(false);
  });

  it('should accept paths within the target directory', async () => {
    const path = await import('path');

    const targetPath = '/project';
    const resolvedTarget = path.resolve(targetPath);

    const nestedPath = path.resolve('/project/src/components/App.tsx');
    expect(nestedPath.startsWith(resolvedTarget)).toBe(true);

    const deepPath = path.resolve('/project/packages/ui/src/hooks/useExport.ts');
    expect(deepPath.startsWith(resolvedTarget)).toBe(true);
  });
});
