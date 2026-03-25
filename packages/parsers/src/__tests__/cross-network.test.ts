import { describe, it, expect } from 'vitest';
import { detectHttpCalls, normalizeUrl, matchRoutes } from '../cross-network';
import type { OmniNode } from '../types';

// ─── HTTP Call Detector ──────────────────────────────────────────────

describe('detectHttpCalls', () => {
  describe('TypeScript / JavaScript patterns', () => {
    it('should detect fetch() calls', () => {
      const source = `
        const res = await fetch('/api/users');
        const data = await res.json();
      `;
      const calls = detectHttpCalls('app.ts', source);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe('/api/users');
    });

    it('should detect fetch() with explicit method', () => {
      const source = `
        fetch('/api/users', { method: 'POST', body: JSON.stringify(data) });
      `;
      const calls = detectHttpCalls('app.ts', source);
      // Should detect both the simple fetch and the method-override pattern
      const postCall = calls.find(c => c.method === 'POST');
      expect(postCall).toBeDefined();
      expect(postCall!.url).toBe('/api/users');
    });

    it('should detect axios.get/post/put/delete calls', () => {
      const source = `
        axios.get('/api/users');
        axios.post('/api/users', { name: 'John' });
        axios.put('/api/users/1', { name: 'Jane' });
        axios.delete('/api/users/1');
      `;
      const calls = detectHttpCalls('service.ts', source);
      expect(calls).toHaveLength(4);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/users' });
      expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/users' });
      expect(calls[2]).toMatchObject({ method: 'PUT', url: '/api/users/1' });
      expect(calls[3]).toMatchObject({ method: 'DELETE', url: '/api/users/1' });
    });

    it('should detect Angular HttpClient calls', () => {
      const source = `
        this.http.get<User[]>('/api/users');
        this.http.post<User>('/api/users', body);
      `;
      const calls = detectHttpCalls('user.service.ts', source);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/users' });
      expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/users' });
    });

    it('should detect jQuery ajax calls', () => {
      const source = `
        $.get('/api/items');
        $.post('/api/items', data);
      `;
      const calls = detectHttpCalls('app.js', source);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/items' });
      expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/items' });
    });

    it('should handle double-quoted strings', () => {
      const source = `axios.get("/api/products");`;
      const calls = detectHttpCalls('api.ts', source);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/products');
    });

    it('should strip full URLs to paths', () => {
      const source = `fetch('http://localhost:3000/api/users');`;
      const calls = detectHttpCalls('app.ts', source);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/users');
    });

    it('should skip relative file imports', () => {
      const source = `fetch('./data.json');`;
      const calls = detectHttpCalls('app.ts', source);
      expect(calls).toHaveLength(0);
    });

    it('should return empty for files with no HTTP calls', () => {
      const source = `const x = 1 + 2;`;
      const calls = detectHttpCalls('util.ts', source);
      expect(calls).toHaveLength(0);
    });
  });

  describe('Python patterns', () => {
    it('should detect requests.get/post calls', () => {
      const source = `
        response = requests.get('/api/users')
        response = requests.post('/api/users', json=data)
      `;
      const calls = detectHttpCalls('client.py', source);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/users' });
      expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/users' });
    });

    it('should detect httpx calls', () => {
      const source = `response = httpx.get('/api/items')`;
      const calls = detectHttpCalls('client.py', source);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/items' });
    });
  });

  describe('PHP patterns', () => {
    it('should detect Laravel Http facade calls', () => {
      const source = `
        $response = Http::get('/api/users');
        $response = Http::post('/api/users', $data);
      `;
      const calls = detectHttpCalls('client.php', source);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/users' });
      expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/users' });
    });

    it('should detect Guzzle-style client calls', () => {
      const source = `$response = $client->get('/api/products');`;
      const calls = detectHttpCalls('service.php', source);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/products' });
    });
  });

  describe('unsupported file types', () => {
    it('should return empty for non-code files', () => {
      expect(detectHttpCalls('readme.md', 'fetch("/api/test")')).toHaveLength(0);
      expect(detectHttpCalls('data.json', '{}')).toHaveLength(0);
    });
  });
});

// ─── URL Normalization ───────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('should strip protocol and host', () => {
    expect(normalizeUrl('http://localhost:3000/api/users')).toBe('/api/users');
    expect(normalizeUrl('https://example.com/api/items')).toBe('/api/items');
  });

  it('should ensure leading slash', () => {
    expect(normalizeUrl('api/users')).toBe('/api/users');
  });

  it('should remove trailing slash', () => {
    expect(normalizeUrl('/api/users/')).toBe('/api/users');
  });

  it('should lowercase', () => {
    expect(normalizeUrl('/API/Users')).toBe('/api/users');
  });

  it('should strip template variables at start', () => {
    expect(normalizeUrl('${BASE_URL}/api/users')).toBe('/api/users');
  });
});

// ─── Route Matcher ───────────────────────────────────────────────────

describe('matchRoutes', () => {
  const backendNodes: OmniNode[] = [
    {
      id: '/project/src/users/users.controller.ts',
      type: 'nestjs-controller',
      label: 'users.controller',
      metadata: { filePath: '/project/src/users/users.controller.ts', route: 'users' },
    },
    {
      id: '/project/app/routers/items.py',
      type: 'python-fastapi-route',
      label: 'items',
      metadata: { filePath: '/project/app/routers/items.py', route: 'GET /api/items, POST /api/items' },
    },
    {
      id: '/project/routes/web.php',
      type: 'php-laravel-route',
      label: 'web',
      metadata: { filePath: '/project/routes/web.php', route: 'GET /products, POST /products' },
    },
  ];

  it('should match exact route paths', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/src/frontend/api.ts', [
      { method: 'GET', url: '/api/items', line: 5 },
    ]);

    const result = matchRoutes([...backendNodes], calls);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);

    const itemsEdge = result.edges.find(e => e.target === '/project/app/routers/items.py');
    expect(itemsEdge).toBeDefined();
    expect(itemsEdge!.source).toBe('/project/src/frontend/api.ts');
    expect(itemsEdge!.label).toContain('GET');
  });

  it('should match suffix routes (NestJS controller prefix)', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/src/frontend/users.ts', [
      { method: 'GET', url: '/users', line: 10 },
    ]);

    const result = matchRoutes([...backendNodes], calls);
    const usersEdge = result.edges.find(e => e.target === '/project/src/users/users.controller.ts');
    expect(usersEdge).toBeDefined();
  });

  it('should not create self-referencing edges', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/app/routers/items.py', [
      { method: 'GET', url: '/api/items', line: 1 },
    ]);

    const result = matchRoutes([...backendNodes], calls);
    const selfEdge = result.edges.find(
      e => e.source === '/project/app/routers/items.py' && e.target === '/project/app/routers/items.py',
    );
    expect(selfEdge).toBeUndefined();
  });

  it('should not match when methods conflict', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/src/frontend/api.ts', [
      { method: 'DELETE', url: '/products', line: 5 },
    ]);

    const result = matchRoutes([...backendNodes], calls);
    // /products only has GET and POST defined, DELETE should not match
    const productEdge = result.edges.find(e => e.target === '/project/routes/web.php');
    expect(productEdge).toBeUndefined();
  });

  it('should deduplicate edges', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/src/frontend/api.ts', [
      { method: 'GET', url: '/api/items', line: 5 },
      { method: 'GET', url: '/api/items', line: 15 }, // duplicate call
    ]);

    const result = matchRoutes([...backendNodes], calls);
    const itemsEdges = result.edges.filter(e => e.target === '/project/app/routers/items.py');
    expect(itemsEdges).toHaveLength(1);
  });

  it('should return zero matches for no HTTP calls', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    const result = matchRoutes([...backendNodes], calls);
    expect(result.edges).toHaveLength(0);
    expect(result.matchCount).toBe(0);
  });

  it('should match wildcard method routes', () => {
    const calls = new Map<string, { method: string; url: string; line: number }[]>();
    calls.set('/project/src/frontend/api.ts', [
      { method: '*', url: '/users', line: 5 }, // unknown method
    ]);

    // NestJS controller route is also '*' (just a path, no method)
    const result = matchRoutes([...backendNodes], calls);
    const usersEdge = result.edges.find(e => e.target === '/project/src/users/users.controller.ts');
    expect(usersEdge).toBeDefined();
  });
});
