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

// ─── Next.js Detection ──────────────────────────────────────────────

describe('TypeScriptParser.parse - Next.js App Router route handlers', () => {
  it('detects App Router route.ts with exported GET and POST', () => {
    const source = `
      import { NextResponse } from 'next/server';
      export async function GET() {
        return NextResponse.json({ users: [] });
      }
      export async function POST(request: Request) {
        return NextResponse.json({}, { status: 201 });
      }
    `;
    const result = parser.parse('/project/src/app/api/users/route.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toContain('GET /api/users');
    expect(result.nodes![0].metadata.route).toContain('POST /api/users');
  });

  it('detects App Router route with dynamic segments [id]', () => {
    const source = `
      export async function GET(req: Request, { params }: { params: { id: string } }) {
        return Response.json({ id: params.id });
      }
      export async function DELETE(req: Request) {
        return new Response(null, { status: 204 });
      }
    `;
    const result = parser.parse('/project/src/app/api/users/[id]/route.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toContain('GET /api/users/:id');
    expect(result.nodes![0].metadata.route).toContain('DELETE /api/users/:id');
  });

  it('detects App Router route with catch-all segments [...slug]', () => {
    const source = `
      export async function GET() { return Response.json({}); }
    `;
    const result = parser.parse('/project/app/api/docs/[...slug]/route.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toContain('/api/docs/:slug*');
  });

  it('detects App Router route without src/ prefix', () => {
    const source = `
      export async function GET() { return Response.json({}); }
    `;
    const result = parser.parse('/project/app/api/health/route.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toContain('GET /api/health');
  });

  it('detects route.js files (not just .ts)', () => {
    const source = `
      export async function GET() { return Response.json({}); }
    `;
    const result = parser.parse('/project/app/api/status/route.js', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
  });

  it('does not detect route.ts outside of app/ directory', () => {
    const source = `
      export async function GET() { return Response.json({}); }
    `;
    const result = parser.parse('/project/lib/route.ts', source);

    expect(result.nodes![0].type).toBe('typescript-file');
  });

  it('handles route.ts with exported const handlers (arrow functions)', () => {
    const source = `
      export const GET = async () => {
        return Response.json({ ok: true });
      };
      export const POST = async (req: Request) => {
        return Response.json({});
      };
    `;
    const result = parser.parse('/project/src/app/api/items/route.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toContain('GET /api/items');
    expect(result.nodes![0].metadata.route).toContain('POST /api/items');
  });
});

describe('TypeScriptParser.parse - Next.js Pages Router API routes', () => {
  it('detects pages/api route with default export', () => {
    const source = `
      import type { NextApiRequest, NextApiResponse } from 'next';
      export default function handler(req: NextApiRequest, res: NextApiResponse) {
        res.status(200).json({ ok: true });
      }
    `;
    const result = parser.parse('/project/pages/api/posts/[id].ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toBe('/api/posts/:id');
  });

  it('detects pages/api index route', () => {
    const source = `
      export default function handler(req, res) {
        res.json({ ok: true });
      }
    `;
    const result = parser.parse('/project/pages/api/index.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toBe('/api');
  });

  it('detects pages/api in src/ directory', () => {
    const source = `
      export default function handler(req, res) { res.json({}); }
    `;
    const result = parser.parse('/project/src/pages/api/users.ts', source);

    expect(result.nodes![0].type).toBe('nextjs-api-route');
    expect(result.nodes![0].metadata.route).toBe('/api/users');
  });

  it('does not detect pages/api without default export', () => {
    const source = `
      export function helper() { return 'not a handler'; }
    `;
    const result = parser.parse('/project/pages/api/utils.ts', source);

    expect(result.nodes![0].type).toBe('typescript-file');
  });
});

describe('TypeScriptParser.parse - Next.js pages and layouts', () => {
  it('detects App Router page.tsx', () => {
    const source = `
      export default function DashboardPage() {
        return <div>Dashboard</div>;
      }
    `;
    const result = parser.parse('/project/src/app/dashboard/page.tsx', source);

    expect(result.nodes![0].type).toBe('nextjs-page');
    expect(result.nodes![0].metadata.route).toBe('/dashboard');
  });

  it('detects App Router layout.tsx', () => {
    const source = `
      export default function RootLayout({ children }) {
        return <html><body>{children}</body></html>;
      }
    `;
    const result = parser.parse('/project/src/app/layout.tsx', source);

    expect(result.nodes![0].type).toBe('nextjs-layout');
  });

  it('detects page with dynamic route segments', () => {
    const source = `
      export default function UserProfile({ params }: { params: { id: string } }) {
        return <div>User {params.id}</div>;
      }
    `;
    const result = parser.parse('/project/app/users/[id]/page.tsx', source);

    expect(result.nodes![0].type).toBe('nextjs-page');
    expect(result.nodes![0].metadata.route).toBe('/users/:id');
  });

  it('does not detect page.tsx outside of app/ directory', () => {
    const source = `export default function Page() { return <div/>; }`;
    const result = parser.parse('/project/components/page.tsx', source);

    expect(result.nodes![0].type).toBe('typescript-file');
  });
});
