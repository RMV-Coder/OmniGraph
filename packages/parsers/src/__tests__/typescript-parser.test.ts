import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../typescript/typescript-parser';

const parser = new TypeScriptParser();

describe('TypeScriptParser.canHandle', () => {
  it('handles .ts files', () => {
    expect(parser.canHandle('foo.ts')).toBe(true);
  });

  it('handles .tsx files', () => {
    expect(parser.canHandle('component.tsx')).toBe(true);
  });

  it('handles .js files', () => {
    expect(parser.canHandle('utils.js')).toBe(true);
  });

  it('handles .jsx files', () => {
    expect(parser.canHandle('component.jsx')).toBe(true);
  });

  it('rejects non-JS/TS files', () => {
    expect(parser.canHandle('style.css')).toBe(false);
    expect(parser.canHandle('data.json')).toBe(false);
    expect(parser.canHandle('readme.md')).toBe(false);
    expect(parser.canHandle('image.png')).toBe(false);
  });
});

describe('TypeScriptParser.parse - basic TypeScript', () => {
  it('creates a node for a simple TS file', () => {
    const source = `const x = 1;\nexport default x;`;
    const result = parser.parse('/project/src/index.ts', source);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes![0]).toMatchObject({
      id: '/project/src/index.ts',
      type: 'typescript-file',
      label: 'index',
    });
  });

  it('creates a node for a JS file with javascript-file type', () => {
    const source = `export function hello() { return "hi"; }`;
    const result = parser.parse('/project/src/utils.js', source);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes![0].type).toBe('javascript-file');
  });

  it('creates a node for a JSX file with javascript-file type', () => {
    const source = `export default function App() { return <div>Hello</div>; }`;
    const result = parser.parse('/project/src/App.jsx', source);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes![0].type).toBe('javascript-file');
  });

  it('returns a fallback node on parse error', () => {
    // Extremely broken syntax that estree can't recover from
    const source = `@@@@this is not code at all {{{{`;
    const result = parser.parse('/project/src/broken.ts', source);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes![0].type).toBe('typescript-file');
    expect(result.edges).toHaveLength(0);
  });
});

describe('TypeScriptParser.parse - NestJS decorators', () => {
  it('detects @Controller with route', () => {
    const source = `
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {}
    `;
    const result = parser.parse('/project/src/users.controller.ts', source);

    expect(result.nodes![0].type).toBe('nestjs-controller');
    expect(result.nodes![0].metadata.route).toBe('users');
  });

  it('detects @Controller without route argument', () => {
    const source = `
      import { Controller } from '@nestjs/common';
      @Controller()
      export class AppController {}
    `;
    const result = parser.parse('/project/src/app.controller.ts', source);

    expect(result.nodes![0].type).toBe('nestjs-controller');
    expect(result.nodes![0].metadata.route).toBe('');
  });

  it('detects @Injectable', () => {
    const source = `
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {}
    `;
    const result = parser.parse('/project/src/users.service.ts', source);

    expect(result.nodes![0].type).toBe('nestjs-injectable');
  });

  it('detects @Module', () => {
    const source = `
      import { Module } from '@nestjs/common';
      @Module({ controllers: [], providers: [] })
      export class AppModule {}
    `;
    const result = parser.parse('/project/src/app.module.ts', source);

    expect(result.nodes![0].type).toBe('nestjs-module');
  });

  it('treats a class without NestJS decorators as typescript-file', () => {
    const source = `
      export class PlainClass {
        doStuff() {}
      }
    `;
    const result = parser.parse('/project/src/plain.ts', source);

    expect(result.nodes![0].type).toBe('typescript-file');
  });
});

describe('TypeScriptParser.parse - import edges', () => {
  it('extracts relative import edges', () => {
    // Use a path where the target actually exists in our fixtures
    const source = `import { UsersService } from './users.service';`;
    const fixturePath = __dirname + '/fixtures/src/users/users.controller.ts';
    const result = parser.parse(fixturePath, source);

    expect(result.edges).toHaveLength(1);
    expect(result.edges![0].label).toBe('imports');
    expect(result.edges![0].source).toContain('users.controller.ts');
    expect(result.edges![0].target).toContain('users.service.ts');
  });

  it('ignores non-relative imports (node_modules)', () => {
    const source = `
      import { Controller } from '@nestjs/common';
      import express from 'express';
    `;
    const result = parser.parse('/project/src/foo.ts', source);

    expect(result.edges).toHaveLength(0);
  });

  it('resolves imports without extension', () => {
    const source = `import { UsersService } from './users.service';`;
    const fixturePath = __dirname + '/fixtures/src/users/users.controller.ts';
    const result = parser.parse(fixturePath, source);

    expect(result.edges).toHaveLength(1);
    expect(result.edges![0].target).toMatch(/users\.service\.ts$/);
  });

  it('resolves index imports', () => {
    const source = `import { formatDate } from './common';`;
    const fixturePath = __dirname + '/fixtures/src/app.module.ts';
    const result = parser.parse(fixturePath, source);

    expect(result.edges).toHaveLength(1);
    expect(result.edges![0].target).toMatch(/common[/\\]index\.ts$/);
  });

  it('drops unresolvable imports (no edge created)', () => {
    const source = `import { foo } from './nonexistent';`;
    const result = parser.parse(__dirname + '/fixtures/src/app.module.ts', source);

    // The import to ./nonexistent should not produce an edge
    const nonexistentEdges = result.edges!.filter(e => e.target.includes('nonexistent'));
    expect(nonexistentEdges).toHaveLength(0);
  });
});
