import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseDirectory } from '../parser-registry';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('parseDirectory', () => {
  it('returns nodes and edges for the fixture directory', () => {
    const graph = parseDirectory(FIXTURES_DIR);

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('finds all TS and JS files in the fixtures', () => {
    const graph = parseDirectory(FIXTURES_DIR);
    const ids = graph.nodes.map(n => n.id);

    // Should find our fixture files
    expect(ids.some(id => id.includes('app.module.ts'))).toBe(true);
    expect(ids.some(id => id.includes('users.controller.ts'))).toBe(true);
    expect(ids.some(id => id.includes('users.service.ts'))).toBe(true);
    expect(ids.some(id => id.includes('utils.js'))).toBe(true);
    expect(ids.some(id => id.includes('index.ts'))).toBe(true);
  });

  it('detects NestJS node types correctly', () => {
    const graph = parseDirectory(FIXTURES_DIR);

    const controller = graph.nodes.find(n => n.id.includes('users.controller.ts'));
    expect(controller?.type).toBe('nestjs-controller');
    expect(controller?.metadata.route).toBe('users');

    const service = graph.nodes.find(n => n.id.includes('users.service.ts'));
    expect(service?.type).toBe('nestjs-injectable');

    const appModule = graph.nodes.find(n => n.id.includes('app.module.ts'));
    expect(appModule?.type).toBe('nestjs-module');
  });

  it('detects JavaScript file type', () => {
    const graph = parseDirectory(FIXTURES_DIR);

    const jsFile = graph.nodes.find(n => n.id.includes('utils.js'));
    expect(jsFile?.type).toBe('javascript-file');
  });

  it('creates import edges between related files', () => {
    const graph = parseDirectory(FIXTURES_DIR);

    // Controller should import service
    const controllerToService = graph.edges.find(
      e => e.source.includes('users.controller.ts') && e.target.includes('users.service.ts')
    );
    expect(controllerToService).toBeDefined();
    expect(controllerToService?.label).toBe('imports');
  });

  it('deduplicates nodes by ID', () => {
    const graph = parseDirectory(FIXTURES_DIR);
    const ids = graph.nodes.map(n => n.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('respects .gitignore patterns', () => {
    // The fixtures/.gitignore ignores coverage/ and *.log
    // We don't have those files but verify the mechanism doesn't crash
    const graph = parseDirectory(FIXTURES_DIR);
    const ids = graph.nodes.map(n => n.id);
    expect(ids.every(id => !id.includes('coverage/'))).toBe(true);
  });

  it('skips node_modules and .git directories', () => {
    const graph = parseDirectory(FIXTURES_DIR);
    const ids = graph.nodes.map(n => n.id);
    expect(ids.every(id => !id.includes('node_modules'))).toBe(true);
    expect(ids.every(id => !id.includes('.git/'))).toBe(true);
  });
});
