/**
 * Route Matcher
 *
 * Builds a route index from all parsed OmniNodes that have route metadata,
 * then matches HTTP client calls to their backend route handlers to create
 * cross-network edges.
 *
 * Matching strategy:
 * 1. Exact path match (e.g., /api/users → /api/users)
 * 2. Suffix match (e.g., /api/users → /users on a controller prefixed with /api)
 * 3. Parameterized match (e.g., /api/users/123 → /api/users/:id)
 */

import { OmniNode, OmniEdge } from '../types';
import { HttpCall, normalizeUrl } from './http-call-detector';

/** A single route handler indexed for matching */
interface RouteEntry {
  /** The node that defines this route */
  nodeId: string;
  /** HTTP method (GET, POST, etc.) or '*' for all */
  method: string;
  /** Normalized route path */
  path: string;
  /** Path segments for pattern matching */
  segments: string[];
}

/** Build a route index from all OmniNodes that declare routes */
function buildRouteIndex(nodes: OmniNode[]): RouteEntry[] {
  const entries: RouteEntry[] = [];

  for (const node of nodes) {
    const route = node.metadata.route;
    if (!route) continue;

    // Route metadata can be a single path or comma-separated "METHOD /path" entries
    const parts = route.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      // Try to parse "GET /path" format
      const methodPathMatch = part.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);

      let method: string;
      let routePath: string;

      if (methodPathMatch) {
        method = methodPathMatch[1].toUpperCase();
        routePath = methodPathMatch[2];
      } else {
        // It's just a path (e.g., NestJS @Controller('users'))
        method = '*';
        routePath = part;
      }

      // Normalize the route path
      let normalized = routePath.toLowerCase().trim();
      if (!normalized.startsWith('/')) normalized = '/' + normalized;
      normalized = normalized.replace(/\/+$/, '') || '/';

      entries.push({
        nodeId: node.id,
        method,
        path: normalized,
        segments: normalized.split('/').filter(Boolean),
      });
    }
  }

  return entries;
}

/**
 * Check if a URL path matches a route path, supporting:
 * - Exact match
 * - Parameterized segments (:id, {id}, <id>)
 * - Wildcard method matching
 */
function pathMatches(urlSegments: string[], routeSegments: string[]): boolean {
  if (urlSegments.length !== routeSegments.length) return false;

  for (let i = 0; i < urlSegments.length; i++) {
    const routeSeg = routeSegments[i];
    const urlSeg = urlSegments[i];

    // Parameterized segment matches anything
    if (
      routeSeg.startsWith(':') ||
      routeSeg.startsWith('{') ||
      routeSeg.startsWith('<')
    ) {
      continue;
    }

    if (routeSeg !== urlSeg) return false;
  }

  return true;
}

/**
 * Check if a URL is a suffix of a route (e.g., controller prefix matching).
 * Example: URL "/users" matches route "/api/users" if we consider the suffix.
 * But more commonly: URL "/api/users" matches controller route "/users" when
 * the controller has prefix "/api".
 */
function suffixMatches(urlSegments: string[], routeSegments: string[]): boolean {
  if (urlSegments.length === 0 || routeSegments.length === 0) return false;
  if (urlSegments.length < routeSegments.length) {
    // URL is shorter — check if route ends with URL segments
    const offset = routeSegments.length - urlSegments.length;
    return urlSegments.every((seg, i) => {
      const routeSeg = routeSegments[offset + i];
      return routeSeg === seg || routeSeg.startsWith(':') || routeSeg.startsWith('{');
    });
  } else {
    // URL is longer — check if URL ends with route segments
    const offset = urlSegments.length - routeSegments.length;
    return routeSegments.every((seg, i) => {
      const urlSeg = urlSegments[offset + i];
      return seg === urlSeg || seg.startsWith(':') || seg.startsWith('{');
    });
  }
}

export interface CrossNetworkResult {
  edges: OmniEdge[];
  /** Summary of matches for debugging */
  matchCount: number;
}

/**
 * Match HTTP calls from source files against backend route handlers.
 *
 * @param nodes - All parsed OmniNodes (includes both frontend and backend files)
 * @param httpCallsByFile - Map from file ID to detected HTTP calls in that file
 * @returns New cross-network edges linking callers to route handlers
 */
export function matchRoutes(
  nodes: OmniNode[],
  httpCallsByFile: Map<string, HttpCall[]>,
): CrossNetworkResult {
  const routeIndex = buildRouteIndex(nodes);
  const edges: OmniEdge[] = [];
  const seenEdges = new Set<string>();

  // For each file that makes HTTP calls, try to match them to route handlers
  for (const [fileId, calls] of httpCallsByFile) {
    for (const call of calls) {
      const urlSegments = call.url.split('/').filter(Boolean);

      for (const entry of routeIndex) {
        // Skip self-references
        if (entry.nodeId === fileId) continue;

        // Method must match (or one side is wildcard)
        if (
          call.method !== '*' &&
          entry.method !== '*' &&
          call.method !== entry.method
        ) {
          continue;
        }

        // Try exact match first
        let matched = pathMatches(urlSegments, entry.segments);

        // Try suffix matching if exact fails
        if (!matched && urlSegments.length > 0 && entry.segments.length > 0) {
          matched = suffixMatches(urlSegments, entry.segments);
        }

        if (matched) {
          const edgeId = `e-http-${fileId}->${entry.nodeId}`;
          if (!seenEdges.has(edgeId)) {
            seenEdges.add(edgeId);
            const methodLabel = call.method !== '*' ? call.method : entry.method !== '*' ? entry.method : 'HTTP';
            edges.push({
              id: edgeId,
              source: fileId,
              target: entry.nodeId,
              label: `${methodLabel} ${call.url}`,
            });
          }
        }
      }
    }
  }

  return { edges, matchCount: edges.length };
}
