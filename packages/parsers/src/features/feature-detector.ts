/**
 * Feature detection (P0).
 *
 * Clusters graph nodes into human-meaningful "features" (Authentication,
 * Payments, …) using signals ALREADY present in the graph — no new parsing:
 *
 *   Signal 1 — Route prefixes  : route/controller nodes seed named features
 *                                 from their first meaningful path segment.
 *   Signal 2 — Feature dirs     : unassigned nodes seed from a meaningful
 *                                 directory segment (src/auth/**, modules/x/**).
 *   Signal 3 — Edge propagation : remaining nodes join the feature of their
 *                                 connected neighbors; nodes bridging ≥2
 *                                 features become "shared".
 *
 * Membership is single-primary (v0): each node belongs to at most one feature.
 * The result is returned as a FeatureModel AND stamped onto each member node's
 * `metadata.feature` / `metadata.featureName` (mutates in place).
 */
import type { OmniGraph, OmniNode, FeatureGroup, FeatureModel } from '../types';

/** Node types that expose an HTTP route and can name a feature */
const ROUTE_TYPES = new Set([
  'nestjs-controller', 'nextjs-api-route', 'python-fastapi-route',
  'python-django-view', 'php-laravel-controller', 'php-laravel-route',
  'java-spring-controller', 'go-http-handler', 'rust-http-handler',
]);

/** Node types that represent a data entity/model */
const ENTITY_TYPES = new Set([
  'python-django-model', 'php-laravel-model', 'java-spring-entity',
]);

/** Path segments that never name a feature (routing/versioning noise) */
const STOP_SEGMENTS = new Set([
  '', 'api', 'apis', 'v1', 'v2', 'v3', 'rest', 'graphql', 'public', 'index',
]);

/** Leading directory segments that are structural, not features */
const STRUCT_ROOTS = new Set([
  'src', 'app', 'apps', 'lib', 'libs', 'dist', 'build', 'pkg', 'internal',
  'cmd', 'source', 'server', 'client', 'backend', 'frontend', 'web', 'api',
]);

/** Container dirs whose CHILD segment is the feature (modules/auth → auth) */
const CONTAINER_DIRS = new Set([
  'modules', 'module', 'features', 'feature', 'domains', 'domain',
  'packages', 'services', 'apps',
]);

/** Generic dirs that describe a layer/role, not a feature */
const GENERIC_DIRS = new Set([
  'utils', 'util', 'helpers', 'helper', 'common', 'shared', 'core', 'lib',
  'types', 'config', 'configs', 'constants', 'middleware', 'middlewares',
  'models', 'model', 'controllers', 'controller', 'services', 'service',
  'routes', 'route', 'views', 'view', 'components', 'component', 'hooks',
  'store', 'stores', 'assets', 'styles', 'test', 'tests', '__tests__',
  'node_modules', 'dist', 'build', 'public', 'static', 'vendor',
]);

/** Curated display names; unmapped slugs fall back to prettify() */
const NAME_MAP: Record<string, string> = {
  auth: 'Authentication', authentication: 'Authentication', oauth: 'Authentication',
  login: 'Authentication', signin: 'Authentication', signup: 'Authentication',
  session: 'Sessions', sessions: 'Sessions',
  user: 'Users', users: 'Users', account: 'Accounts', accounts: 'Accounts',
  profile: 'Profiles', profiles: 'Profiles',
  payment: 'Payments', payments: 'Payments', billing: 'Billing',
  checkout: 'Checkout', invoice: 'Invoices', invoices: 'Invoices',
  subscription: 'Subscriptions', subscriptions: 'Subscriptions',
  channel: 'Channels', channels: 'Channels',
  ocr: 'OCR', notification: 'Notifications', notifications: 'Notifications',
  admin: 'Admin', dashboard: 'Dashboard', search: 'Search',
  upload: 'Uploads', uploads: 'Uploads', file: 'Files', files: 'Files',
  webhook: 'Webhooks', webhooks: 'Webhooks',
  product: 'Products', products: 'Products', order: 'Orders', orders: 'Orders',
  cart: 'Cart', message: 'Messaging', messages: 'Messaging', chat: 'Chat',
};

/** Filename tokens that never identify a feature (layers, roles, verbs) */
const FILENAME_STOP = new Set([
  'test', 'tests', 'spec', 'specs', 'e2e', 'unit', 'integration', 'stories', 'story',
  'api', 'apis', 'db', 'route', 'routes', 'client', 'server', 'page', 'layout',
  'index', 'handler', 'handlers', 'service', 'services', 'controller', 'controllers',
  'model', 'models', 'util', 'utils', 'helper', 'helpers', 'hook', 'hooks',
  'type', 'types', 'config', 'configs', 'constant', 'constants', 'mock', 'mocks',
  'component', 'components', 'provider', 'context', 'main', 'app', 'src', 'lib',
  'core', 'common', 'shared', 'data', 'list', 'detail', 'form', 'modal',
  'get', 'post', 'put', 'patch', 'delete', 'new', 'old',
]);

/** A node is shared once its assigned neighbors span this many features */
const SHARED_SPAN = 2;
/** Max label-propagation rounds */
const MAX_ROUNDS = 4;
/** Directory-only features smaller than this (and route-less) are dissolved */
const MIN_DIR_FEATURE_SIZE = 2;

const SHARED_ID = '__shared';

// ─── Segment helpers ────────────────────────────────────────────────

const HTTP_METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i;

function cleanSegment(seg: string): string {
  return seg.replace(/[[\](){}:*.]/g, '').toLowerCase();
}

/** First meaningful segment of a route path, or null.
 *  Handles method-prefixed and comma-joined routes like
 *  "GET /api/users, POST /api/users" and bare bases like "users". */
function routeSlug(route: string): string | null {
  const first = route.split(',')[0].trim().replace(HTTP_METHOD_RE, '').trim();
  const segments = first.split('/').map(cleanSegment).filter(s => !STOP_SEGMENTS.has(s));
  return segments[0] ?? null;
}

/** Longest shared leading path across all node ids, so absolute ids
 *  (C:/Users/…/repo) are reduced to repo-relative paths. */
function commonPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  let prefix = paths[0];
  for (const p of paths) {
    while (!p.startsWith(prefix)) {
      const slash = prefix.lastIndexOf('/');
      if (slash < 0) return '';
      prefix = prefix.slice(0, slash);
    }
  }
  return prefix;
}

/** Next.js route group like "(dashboard)" — organizational, invisible to
 *  the URL, so it should be skipped rather than named as a feature. */
function isRouteGroup(seg: string): boolean {
  return /^\(.*\)$/.test(seg);
}

/** Feature slug from a repo-relative path's directory, or null.
 *  Descends past structural roots (src, app…), container dirs (packages,
 *  modules…), route groups, AND generic layer dirs (components, __tests__,
 *  services…) to reach the first segment that actually names a feature.
 *  Descending past generic dirs is what reclaims components/<feature>/…
 *  and __tests__/<feature>/… instead of dumping them all as ungrouped. */
function directorySlug(relPath: string): string | null {
  const segs = relPath.split('/').filter(Boolean).slice(0, -1).map(s => s.toLowerCase());
  let i = 0;
  while (i < segs.length && (
    !segs[i] || isRouteGroup(segs[i]) ||
    STRUCT_ROOTS.has(segs[i]) || CONTAINER_DIRS.has(segs[i]) || GENERIC_DIRS.has(segs[i])
  )) i++;
  const candidate = segs[i];
  if (!candidate || STOP_SEGMENTS.has(candidate)) return null;
  return candidate;
}

/** Split a node's filename into lowercase word tokens.
 *  "api-bho-registration.test.ts" → [api, bho, registration]
 *  "KpiTiles.tsx" → [kpi, tiles] */
function tokenizeFilename(id: string): string[] {
  const base = (id.replace(/\\/g, '/').split('/').pop() ?? '')
    .replace(/\.(test|spec|stories|d)\.[a-z0-9]+$/i, '') // strip .test.ts / .d.ts
    .replace(/\.[a-z0-9]+$/i, '');                       // strip remaining extension
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')              // camelCase → words
    .split(/[-_.\s]+/)
    .map(s => s.toLowerCase())
    .filter(Boolean);
}

/** Route slug for a route-type node: metadata first, then path fallback */
function routeNodeSlug(node: OmniNode, relPath: string): string | null {
  const route = node.metadata.route ?? node.metadata.path ?? '';
  const fromRoute = route ? routeSlug(route) : null;
  return fromRoute ?? directorySlug(relPath);
}

function prettify(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Reduce a slug to a singular canonical form so plural/singular variants
 *  (webhook/webhooks, user/users) collapse into one feature. */
function canonical(slug: string): string {
  if (slug.length <= 3) return slug;                              // dm, api, css
  if (/(?:s|z|x|ch|sh)es$/.test(slug)) return slug.slice(0, -2);  // boxes→box
  if (/ies$/.test(slug)) return slug.slice(0, -3) + 'y';          // categories→category
  if (/(?:ss|us|is)$/.test(slug)) return slug;                    // address, status, analysis
  if (/s$/.test(slug)) return slug.slice(0, -1);                  // users→user
  return slug;
}

/** Display name for a feature: curated map first (on canonical or the
 *  natural representative form), else the prettified natural form. */
function displayName(key: string, rep: string): string {
  return NAME_MAP[key] ?? NAME_MAP[rep] ?? prettify(rep);
}

// ─── Detection ──────────────────────────────────────────────────────

export function detectFeatures(graph: OmniGraph): FeatureModel {
  const { nodes, edges } = graph;
  const assignment = new Map<string, string>();  // nodeId → slug
  const sources = new Map<string, 'route' | 'directory' | 'mixed'>();
  const entryPoints = new Map<string, Set<string>>();

  const noteSource = (slug: string, s: 'route' | 'directory') => {
    const prev = sources.get(slug);
    if (!prev) sources.set(slug, s);
    else if (prev !== s) sources.set(slug, 'mixed');
  };

  // Per canonical key, tally the raw slug forms seen so we can display the
  // most natural one (e.g. "Payments" not "Payment") while still merging.
  const rawForms = new Map<string, Map<string, number>>();
  const tallyRaw = (key: string, raw: string) => {
    if (!rawForms.has(key)) rawForms.set(key, new Map());
    const m = rawForms.get(key)!;
    m.set(raw, (m.get(raw) ?? 0) + 1);
  };
  const representative = (key: string): string => {
    const m = rawForms.get(key);
    if (!m) return key;
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  // Deterministic iteration order
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));

  // Reduce absolute node ids (C:/Users/…/repo, /home/…/repo) to repo-relative
  // paths. Only strip when the shared prefix is an ABSOLUTE machine path —
  // already-relative ids are left untouched so STRUCT_ROOTS handling applies.
  const rawPrefix = commonPrefix(nodes.map(n => n.id.replace(/\\/g, '/')));
  const prefix = /^([A-Za-z]:)?\//.test(rawPrefix) ? rawPrefix : '';
  const relPath = (node: OmniNode): string => {
    const norm = node.id.replace(/\\/g, '/');
    const rel = prefix && norm.startsWith(prefix) ? norm.slice(prefix.length) : norm;
    return rel.replace(/^\/+/, '');
  };

  // ── Signal 1: route seeds ──
  for (const node of sortedNodes) {
    if (!ROUTE_TYPES.has(node.type)) continue;
    const raw = routeNodeSlug(node, relPath(node));
    if (!raw) continue;
    const key = canonical(raw);
    assignment.set(node.id, key);
    noteSource(key, 'route');
    tallyRaw(key, raw);
    if (!entryPoints.has(key)) entryPoints.set(key, new Set());
    entryPoints.get(key)!.add(node.id);
  }

  // ── Signal 2: directory seeds (for still-unassigned nodes) ──
  for (const node of sortedNodes) {
    if (assignment.has(node.id)) continue;
    const raw = directorySlug(relPath(node));
    if (!raw) continue;
    const key = canonical(raw);
    assignment.set(node.id, key);
    noteSource(key, 'directory');
    tallyRaw(key, raw);
  }

  // ── Signal 3: edge propagation ──
  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) adjacency.set(n.id, new Set());
  for (const e of edges) {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  }

  const shared = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pending = new Map<string, string>(); // nodeId → slug to assign this round
    for (const node of sortedNodes) {
      if (assignment.has(node.id) || shared.has(node.id)) continue;
      const neighborSlugs = new Map<string, number>();
      for (const nb of adjacency.get(node.id) ?? []) {
        const slug = assignment.get(nb);
        if (slug) neighborSlugs.set(slug, (neighborSlugs.get(slug) ?? 0) + 1);
      }
      if (neighborSlugs.size === 0) continue;
      if (neighborSlugs.size >= SHARED_SPAN) { shared.add(node.id); continue; }
      // Single neighboring feature → join it (deterministic; size === 1)
      pending.set(node.id, neighborSlugs.keys().next().value as string);
    }
    if (pending.size === 0) break;
    for (const [id, slug] of pending) assignment.set(id, slug);
  }

  // ── Dissolve trivial directory-only features ──
  const members = new Map<string, string[]>();
  for (const [id, slug] of assignment) {
    if (!members.has(slug)) members.set(slug, []);
    members.get(slug)!.push(id);
  }
  for (const [slug, ids] of members) {
    const hasRoute = (entryPoints.get(slug)?.size ?? 0) > 0;
    if (!hasRoute && ids.length < MIN_DIR_FEATURE_SIZE) {
      for (const id of ids) assignment.delete(id);
      members.delete(slug);
      sources.delete(slug);
    }
  }

  // ── Signal 4: filename-token matching ──
  // Reclaim still-unassigned nodes whose FILENAME names a feature that
  // already exists (e.g. `api-bho-registration.test.ts` → the Bho feature).
  // High precision: only match surviving feature keys, skip short/generic
  // keys, and require an unambiguous single match.
  const matchableKeys = new Set(
    [...members.keys()].filter(k => k.length >= 3 && !FILENAME_STOP.has(k)),
  );
  if (matchableKeys.size > 0) {
    for (const node of sortedNodes) {
      if (assignment.has(node.id) || shared.has(node.id)) continue;
      const matched = new Set<string>();
      for (const tok of tokenizeFilename(node.id)) {
        if (FILENAME_STOP.has(tok)) continue;
        const key = canonical(tok);
        if (matchableKeys.has(key)) matched.add(key);
      }
      if (matched.size === 1) {
        const key = [...matched][0];
        assignment.set(node.id, key);
        members.get(key)!.push(node.id);
      }
    }
  }

  // ── Build FeatureModel ──
  // `members` is keyed by canonical slug; the public `slug`/`name` use the
  // natural representative form so plural/singular variants stay merged.
  const entityIds = new Set(nodes.filter(n => ENTITY_TYPES.has(n.type)).map(n => n.id));
  const features: FeatureGroup[] = [];
  const featureByKey = new Map<string, FeatureGroup>();
  for (const [key, ids] of members) {
    const rep = representative(key);
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
    const eps = [...(entryPoints.get(key) ?? [])].sort((a, b) => a.localeCompare(b));
    const feature: FeatureGroup = {
      id: `feature-${key}`,
      name: displayName(key, rep),
      slug: rep,
      source: sources.get(key) ?? 'directory',
      nodeIds: sortedIds,
      entryPointIds: eps,
      stats: {
        nodes: sortedIds.length,
        routes: eps.length,
        entities: sortedIds.filter(id => entityIds.has(id)).length,
      },
    };
    features.push(feature);
    featureByKey.set(key, feature);
  }
  features.sort((a, b) => b.stats.nodes - a.stats.nodes || a.name.localeCompare(b.name));

  const assignedIds = new Set(assignment.keys());
  const sharedIds = [...shared].filter(id => !assignedIds.has(id)).sort((a, b) => a.localeCompare(b));
  const ungrouped = nodes
    .filter(n => !assignedIds.has(n.id) && !shared.has(n.id))
    .map(n => n.id)
    .sort((a, b) => a.localeCompare(b));

  // ── Stamp membership onto node metadata (mutates) ──
  for (const node of nodes) {
    const key = assignment.get(node.id);
    const feature = key ? featureByKey.get(key) : undefined;
    if (feature) {
      node.metadata.feature = feature.id;
      node.metadata.featureName = feature.name;
    } else if (shared.has(node.id)) {
      node.metadata.feature = SHARED_ID;
      node.metadata.featureName = 'Shared';
    }
  }

  return { features, shared: sharedIds, ungrouped };
}
