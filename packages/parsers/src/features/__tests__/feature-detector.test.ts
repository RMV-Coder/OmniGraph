import { describe, it, expect } from 'vitest';
import { detectFeatures } from '../feature-detector';
import type { OmniGraph, OmniNode, OmniEdge } from '../../types';

// ─── Test helpers ────────────────────────────────────────────────────

function node(
  id: string,
  type = 'typescript-file',
  metadata: Record<string, string> = {},
): OmniNode {
  return { id, type, label: id.split('/').pop() ?? id, metadata: { ...metadata } };
}

function edge(source: string, target: string, label = 'imports'): OmniEdge {
  return { id: `e-${source}->${target}`, source, target, label };
}

function graph(nodes: OmniNode[], edges: OmniEdge[] = []): OmniGraph {
  return { nodes, edges };
}

// ─── Signal 1: route seeds ───────────────────────────────────────────

describe('detectFeatures — route seeding', () => {
  it('names a feature from a route path and marks the entry point', () => {
    const controller = node('src/auth/auth.controller.ts', 'nestjs-controller', { route: '/auth/login' });
    const model = detectFeatures(graph([controller]));

    expect(model.features).toHaveLength(1);
    const f = model.features[0];
    expect(f.slug).toBe('auth');
    expect(f.name).toBe('Authentication');
    expect(f.source).toBe('route');
    expect(f.entryPointIds).toEqual([controller.id]);
    expect(f.stats).toMatchObject({ nodes: 1, routes: 1, entities: 0 });
  });

  it('strips api/version noise segments when deriving the slug', () => {
    const controller = node('src/x/p.controller.ts', 'python-fastapi-route', { route: '/api/v1/payments/charge' });
    const model = detectFeatures(graph([controller]));
    expect(model.features[0].slug).toBe('payments');
    expect(model.features[0].name).toBe('Payments');
  });

  it('keeps a single-node feature when it has a route entry point', () => {
    const controller = node('src/auth/c.ts', 'nestjs-controller', { route: '/auth' });
    const model = detectFeatures(graph([controller]));
    expect(model.features).toHaveLength(1);
    expect(model.ungrouped).toHaveLength(0);
  });
});

// ─── Signal 2: directory seeds ───────────────────────────────────────

describe('detectFeatures — directory seeding', () => {
  it('groups files by a meaningful directory segment', () => {
    const model = detectFeatures(graph([
      node('src/payments/service.ts'),
      node('src/payments/gateway.ts'),
    ]));
    expect(model.features).toHaveLength(1);
    expect(model.features[0].slug).toBe('payments');
    expect(model.features[0].source).toBe('directory');
    expect(model.features[0].stats.nodes).toBe(2);
  });

  it('resolves the feature after a container dir (modules/<feature>)', () => {
    const model = detectFeatures(graph([
      node('packages/api/src/modules/channels/a.ts'),
      node('packages/api/src/modules/channels/b.ts'),
    ]));
    expect(model.features[0].slug).toBe('channels');
  });

  it('does not create features from generic layer dirs', () => {
    const model = detectFeatures(graph([
      node('src/utils/date.ts'),
      node('src/helpers/str.ts'),
    ]));
    expect(model.features).toHaveLength(0);
    expect(model.ungrouped).toHaveLength(2);
  });

  it('marks a feature as mixed when route and directory both name it', () => {
    const model = detectFeatures(graph([
      node('src/auth/auth.controller.ts', 'nestjs-controller', { route: '/auth' }),
      node('src/auth/auth.service.ts', 'nestjs-injectable'),
    ]));
    expect(model.features).toHaveLength(1);
    expect(model.features[0].source).toBe('mixed');
    expect(model.features[0].stats.nodes).toBe(2);
  });
});

// ─── Slug canonicalization (singular/plural merge) ───────────────────

describe('detectFeatures — singular/plural merge', () => {
  it('merges singular and plural slug variants into one feature', () => {
    const model = detectFeatures(graph([
      node('app/api/webhooks/route.ts', 'nextjs-api-route', { route: '/api/webhooks' }),
      node('src/webhook/handler.ts'),
    ]));
    const webhooks = model.features.filter(f => f.name === 'Webhooks');
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].stats.nodes).toBe(2);
  });

  it('displays the natural (more frequent) form, not a forced singular', () => {
    const model = detectFeatures(graph([
      node('src/rooms/list.ts'),
      node('src/rooms/detail.ts'),
    ]));
    expect(model.features[0].slug).toBe('rooms');
    expect(model.features[0].name).toBe('Rooms');
  });

  it('does not over-singularize words ending in ss/us/is', () => {
    const model = detectFeatures(graph([
      node('src/status/a.ts'), node('src/status/b.ts'),
    ]));
    expect(model.features[0].slug).toBe('status');
  });
});

// ─── Descending past generic layer dirs ──────────────────────────────

describe('detectFeatures — generic-dir descent', () => {
  it('finds the feature under a generic component dir', () => {
    const model = detectFeatures(graph([
      node('components/dashboard/Card.tsx'),
      node('components/dashboard/KpiTile.tsx'),
    ]));
    const dash = model.features.find(f => f.slug === 'dashboard');
    expect(dash).toBeDefined();
    expect(dash!.stats.nodes).toBe(2);
  });

  it('groups tests under their feature (__tests__/<feature>)', () => {
    const model = detectFeatures(graph([
      node('__tests__/payments/checkout.test.ts'),
      node('__tests__/payments/refund.test.ts'),
    ]));
    const pay = model.features.find(f => f.name === 'Payments');
    expect(pay).toBeDefined();
    expect(pay!.stats.nodes).toBe(2);
  });

  it('skips Next.js route groups to reach the real route segment', () => {
    const model = detectFeatures(graph([
      node('app/(dashboard)/tenant/page.tsx', 'nextjs-page'),
      node('app/(dashboard)/tenant/settings.tsx', 'nextjs-page'),
    ]));
    expect(model.features.find(f => f.slug === 'tenant')).toBeDefined();
    expect(model.features.find(f => f.slug === 'dashboard')).toBeUndefined();
  });

  it('still leaves a file directly in a generic dir ungrouped', () => {
    const model = detectFeatures(graph([node('src/utils/date.ts')]));
    expect(model.features).toHaveLength(0);
    expect(model.ungrouped).toEqual(['src/utils/date.ts']);
  });
});

// ─── Signal 4: filename-token matching ───────────────────────────────

describe('detectFeatures — filename matching (Signal 4)', () => {
  const withBho = (extra: OmniNode[]) => graph([
    node('app/api/bho/route.ts', 'nextjs-api-route', { route: '/api/bho' }),
    node('app/api/bho/[id]/route.ts', 'nextjs-api-route', { route: '/api/bho/:id' }),
    ...extra,
  ]);

  it('reclaims a flat file whose filename names an existing feature', () => {
    const model = detectFeatures(withBho([node('__tests__/api-bho-registration.test.ts')]));
    const bho = model.features.find(f => f.slug === 'bho');
    expect(bho).toBeDefined();
    expect(bho!.nodeIds).toContain('__tests__/api-bho-registration.test.ts');
    expect(model.ungrouped).not.toContain('__tests__/api-bho-registration.test.ts');
  });

  it('does NOT invent a feature — unmatched filenames stay ungrouped', () => {
    const model = detectFeatures(withBho([node('__tests__/telemetry-worker.test.ts')]));
    expect(model.ungrouped).toContain('__tests__/telemetry-worker.test.ts');
  });

  it('skips ambiguous filenames that name two features', () => {
    const model = detectFeatures(graph([
      node('app/api/admin/route.ts', 'nextjs-api-route', { route: '/admin' }),
      node('app/api/users/route.ts', 'nextjs-api-route', { route: '/users' }),
      node('__tests__/admin-users-bridge.test.ts'),
    ]));
    expect(model.ungrouped).toContain('__tests__/admin-users-bridge.test.ts');
  });

  it('ignores short (<3 char) feature keys so they do not vacuum files', () => {
    const model = detectFeatures(graph([
      node('app/db/client.ts'), node('app/db/pool.ts'),   // a "db" feature (key len 2)
      node('__tests__/db-heavy-report.test.ts'),
    ]));
    expect(model.ungrouped).toContain('__tests__/db-heavy-report.test.ts');
  });

  it('matches plural filename tokens to a singular feature key', () => {
    const model = detectFeatures(graph([
      node('app/api/rooms/route.ts', 'nextjs-api-route', { route: '/api/rooms' }),
      node('app/api/rooms/[id]/route.ts', 'nextjs-api-route', { route: '/api/rooms/:id' }),
      node('__tests__/rooms-availability.test.ts'),
    ]));
    const rooms = model.features.find(f => f.slug === 'rooms');
    expect(rooms!.nodeIds).toContain('__tests__/rooms-availability.test.ts');
  });
});

// ─── Signal 3: edge propagation ──────────────────────────────────────

describe('detectFeatures — edge propagation', () => {
  it('pulls an unassigned file into the feature of its sole neighbor', () => {
    const model = detectFeatures(graph(
      [
        node('src/auth/auth.controller.ts', 'nestjs-controller', { route: '/auth' }),
        node('src/lib/jwt.ts'), // structural dir → not directory-seeded
      ],
      [edge('src/auth/auth.controller.ts', 'src/lib/jwt.ts')],
    ));
    const auth = model.features.find(f => f.slug === 'auth');
    expect(auth?.nodeIds).toContain('src/lib/jwt.ts');
    expect(model.ungrouped).not.toContain('src/lib/jwt.ts');
  });

  it('routes a node bridging two features into the shared bucket', () => {
    const model = detectFeatures(graph(
      [
        node('src/auth/a.controller.ts', 'nestjs-controller', { route: '/auth' }),
        node('src/payments/p.controller.ts', 'nestjs-controller', { route: '/payments' }),
        node('src/lib/logger.ts'),
      ],
      [
        edge('src/auth/a.controller.ts', 'src/lib/logger.ts'),
        edge('src/payments/p.controller.ts', 'src/lib/logger.ts'),
      ],
    ));
    expect(model.shared).toContain('src/lib/logger.ts');
    for (const f of model.features) expect(f.nodeIds).not.toContain('src/lib/logger.ts');
  });
});

// ─── Buckets & dissolving ────────────────────────────────────────────

describe('detectFeatures — buckets', () => {
  it('dissolves a trivial directory-only feature into ungrouped', () => {
    const model = detectFeatures(graph([node('src/widget/one.ts')]));
    expect(model.features).toHaveLength(0);
    expect(model.ungrouped).toEqual(['src/widget/one.ts']);
  });

  it('leaves disconnected generic files ungrouped', () => {
    const model = detectFeatures(graph([node('src/utils/misc.ts')]));
    expect(model.features).toHaveLength(0);
    expect(model.shared).toHaveLength(0);
    expect(model.ungrouped).toEqual(['src/utils/misc.ts']);
  });

  it('counts entity-type nodes in feature stats', () => {
    const model = detectFeatures(graph([
      node('src/users/users.controller.ts', 'nestjs-controller', { route: '/users' }),
      node('src/users/user.model.ts', 'php-laravel-model'),
    ]));
    const users = model.features.find(f => f.slug === 'users');
    expect(users?.stats.entities).toBe(1);
  });
});

// ─── Metadata stamping ───────────────────────────────────────────────

describe('detectFeatures — metadata stamping', () => {
  it('stamps feature id/name onto member nodes and leaves ungrouped nodes bare', () => {
    const controller = node('src/auth/c.ts', 'nestjs-controller', { route: '/auth' });
    const lonely = node('src/utils/x.ts');
    detectFeatures(graph([controller, lonely]));

    expect(controller.metadata.feature).toBe('feature-auth');
    expect(controller.metadata.featureName).toBe('Authentication');
    expect(lonely.metadata.feature).toBeUndefined();
    expect(lonely.metadata.featureName).toBeUndefined();
  });

  it('stamps shared nodes with the shared marker', () => {
    const nodes = [
      node('src/auth/a.controller.ts', 'nestjs-controller', { route: '/auth' }),
      node('src/payments/p.controller.ts', 'nestjs-controller', { route: '/payments' }),
      node('src/lib/logger.ts'),
    ];
    detectFeatures(graph(nodes, [
      edge('src/auth/a.controller.ts', 'src/lib/logger.ts'),
      edge('src/payments/p.controller.ts', 'src/lib/logger.ts'),
    ]));
    const logger = nodes.find(n => n.id === 'src/lib/logger.ts')!;
    expect(logger.metadata.feature).toBe('__shared');
    expect(logger.metadata.featureName).toBe('Shared');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────

describe('detectFeatures — determinism', () => {
  const build = (): OmniGraph => graph(
    [
      node('src/auth/auth.controller.ts', 'nestjs-controller', { route: '/auth/login' }),
      node('src/auth/auth.service.ts', 'nestjs-injectable'),
      node('src/payments/pay.controller.ts', 'nestjs-controller', { route: '/payments' }),
      node('src/payments/pay.service.ts', 'nestjs-injectable'),
      node('src/lib/logger.ts'),
      node('src/lib/jwt.ts'),
      node('src/utils/misc.ts'),
    ],
    [
      edge('src/auth/auth.controller.ts', 'src/auth/auth.service.ts'),
      edge('src/auth/auth.service.ts', 'src/lib/jwt.ts'),
      edge('src/auth/auth.controller.ts', 'src/lib/logger.ts'),
      edge('src/payments/pay.controller.ts', 'src/lib/logger.ts'),
    ],
  );

  it('produces identical output across runs', () => {
    const a = detectFeatures(build());
    const b = detectFeatures(build());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts features by size descending', () => {
    const model = detectFeatures(build());
    const sizes = model.features.map(f => f.stats.nodes);
    const sorted = [...sizes].sort((x, y) => y - x);
    expect(sizes).toEqual(sorted);
  });
});
