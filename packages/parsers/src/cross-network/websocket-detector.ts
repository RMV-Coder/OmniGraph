/**
 * WebSocket Detector
 *
 * Scans source files for WebSocket client/server patterns (native WebSocket,
 * socket.io, ws library, python-socketio, websockets, Django Channels,
 * Laravel Broadcasting, Pusher) and extracts endpoint information.
 *
 * This is heuristic-based — it uses regex patterns to detect common WebSocket
 * libraries across TypeScript/JavaScript, Python, and PHP.
 */

import { OmniNode, OmniEdge } from '../types';

export interface WebSocketEndpoint {
  /** Type: 'client' | 'server' | 'event-listener' | 'event-emitter' */
  type: 'client' | 'server' | 'event-listener' | 'event-emitter';
  /** URL for connect calls, event name for on/emit */
  target: string;
  /** Line number */
  line: number;
}

/** Pattern definition for WebSocket detection */
interface WsPattern {
  /** Regex to match. Relevant groups capture the target (URL or event name). */
  pattern: RegExp;
  /** Endpoint type this pattern implies */
  endpointType: WebSocketEndpoint['type'];
  /** Group index for the target string (URL or event name) */
  targetGroup: number;
}

// ─── TypeScript/JavaScript Patterns ─────────────────────────────────

const TS_JS_PATTERNS: WsPattern[] = [
  // new WebSocket('ws://...' or 'wss://...')
  {
    pattern: /\bnew\s+WebSocket\s*\(\s*['"`](wss?:\/\/[^'"`]+)['"`]/g,
    endpointType: 'client',
    targetGroup: 1,
  },
  // io('http://...') or io('ws://...') — socket.io client
  {
    pattern: /\bio\s*\(\s*['"`]((?:https?|wss?):\/\/[^'"`]+)['"`]/g,
    endpointType: 'client',
    targetGroup: 1,
  },
  // io.connect('...')  — socket.io client
  {
    pattern: /\bio\s*\.\s*connect\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'client',
    targetGroup: 1,
  },
  // new Server(...) — socket.io server
  {
    pattern: /\bnew\s+Server\s*\(\s*(?:\w+|{[^}]*})\s*(?:,\s*{[^}]*})?\s*\)/g,
    endpointType: 'server',
    targetGroup: 0, // no URL group — use placeholder
  },
  // createServer(...) — socket.io server
  {
    pattern: /\bcreateServer\s*\(/g,
    endpointType: 'server',
    targetGroup: 0,
  },
  // new ws.Server(...) or new WebSocketServer(...)
  {
    pattern: /\bnew\s+(?:ws\.Server|WebSocketServer)\s*\(/g,
    endpointType: 'server',
    targetGroup: 0,
  },
  // socket.on('event', ...) — socket.io event listener
  {
    pattern: /\bsocket\s*\.\s*on\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-listener',
    targetGroup: 1,
  },
  // socket.emit('event', ...) — socket.io event emitter
  {
    pattern: /\bsocket\s*\.\s*emit\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-emitter',
    targetGroup: 1,
  },
];

// ─── Python Patterns ────────────────────────────────────────────────

const PYTHON_PATTERNS: WsPattern[] = [
  // socketio.AsyncServer() or socketio.Server()
  {
    pattern: /\bsocketio\s*\.\s*(?:Async)?Server\s*\(/g,
    endpointType: 'server',
    targetGroup: 0,
  },
  // websockets.connect('ws://...')
  {
    pattern: /\bwebsockets\s*\.\s*connect\s*\(\s*['"`](wss?:\/\/[^'"`]+)['"`]/g,
    endpointType: 'client',
    targetGroup: 1,
  },
  // websockets.serve(...)
  {
    pattern: /\bwebsockets\s*\.\s*serve\s*\(/g,
    endpointType: 'server',
    targetGroup: 0,
  },
  // async_to_sync(channel_layer.send)(...) — Django Channels
  {
    pattern: /\basync_to_sync\s*\(\s*channel_layer\s*\.\s*send\s*\)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-emitter',
    targetGroup: 1,
  },
  // channel_layer.send('channel', ...) or channel_layer.group_send('group', ...)
  {
    pattern: /\bchannel_layer\s*\.\s*(?:group_)?send\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-emitter',
    targetGroup: 1,
  },
  // @sio.on('event') or @sio.event — python-socketio event handler
  {
    pattern: /\b@\s*sio\s*\.\s*on\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-listener',
    targetGroup: 1,
  },
  // sio.emit('event', ...) — python-socketio event emitter
  {
    pattern: /\bsio\s*\.\s*emit\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'event-emitter',
    targetGroup: 1,
  },
];

// ─── PHP Patterns ───────────────────────────────────────────────────

const PHP_PATTERNS: WsPattern[] = [
  // broadcast(new EventName(...)) — Laravel Broadcasting
  {
    pattern: /\bbroadcast\s*\(\s*new\s+(\w+)\s*\(/g,
    endpointType: 'event-emitter',
    targetGroup: 1,
  },
  // Broadcast::channel('channel-name', ...) — Laravel channel registration
  {
    pattern: /\bBroadcast\s*::\s*channel\s*\(\s*['"`]([^'"`]+)['"`]/g,
    endpointType: 'server',
    targetGroup: 1,
  },
  // new Pusher(...) — Pusher client
  {
    pattern: /\bnew\s+Pusher\s*\(/g,
    endpointType: 'client',
    targetGroup: 0,
  },
];

/** Detect the language family from file extension */
function getLanguage(filePath: string): 'ts' | 'py' | 'php' | null {
  if (/\.(ts|tsx|js|jsx)$/i.test(filePath)) return 'ts';
  if (/\.py$/i.test(filePath)) return 'py';
  if (/\.php$/i.test(filePath)) return 'php';
  return null;
}

/**
 * Compute the line number at a given character index in source.
 */
function lineAt(source: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Normalize a WebSocket URL for comparison:
 * - Strip protocol and host
 * - Lowercase
 */
export function normalizeWsUrl(url: string): string {
  let normalized = url;
  // Strip protocol + host
  normalized = normalized.replace(/^(?:wss?|https?):\/\/[^/]*/, '');
  // Strip template expressions
  normalized = normalized.replace(/^\$\{[^}]+\}/, '');
  if (!normalized || normalized === '/') return url.toLowerCase();
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  normalized = normalized.replace(/\/+$/, '') || '/';
  return normalized.toLowerCase();
}

/**
 * Scan a source file for WebSocket endpoints.
 *
 * @param filePath - The file path (used to determine language)
 * @param source - The file content
 * @returns Array of detected WebSocket endpoints
 */
export function detectWebSocketEndpoints(
  filePath: string,
  source: string,
): WebSocketEndpoint[] {
  const lang = getLanguage(filePath);
  if (!lang) return [];

  let patterns: WsPattern[];
  switch (lang) {
    case 'ts':
      patterns = TS_JS_PATTERNS;
      break;
    case 'py':
      patterns = PYTHON_PATTERNS;
      break;
    case 'php':
      patterns = PHP_PATTERNS;
      break;
  }

  const endpoints: WebSocketEndpoint[] = [];

  for (const { pattern, endpointType, targetGroup } of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(source)) !== null) {
      const rawTarget = targetGroup > 0 ? match[targetGroup] : null;
      // Skip if we expected a target but didn't get one
      if (targetGroup > 0 && !rawTarget) continue;

      const target =
        rawTarget != null
          ? endpointType === 'client'
            ? normalizeWsUrl(rawTarget)
            : rawTarget
          : 'websocket-server';

      endpoints.push({
        type: endpointType,
        target,
        line: lineAt(source, match.index),
      });
    }
  }

  return endpoints;
}

/**
 * Match WebSocket clients to servers, and event emitters to event listeners
 * across files, producing cross-network edges.
 */
export function matchWebSocketEndpoints(
  wsEndpointsByFile: Map<string, WebSocketEndpoint[]>,
): OmniEdge[] {
  const edges: OmniEdge[] = [];
  const seenEdges = new Set<string>();

  // Collect servers and event-listeners by their target for lookup
  const servers: { fileId: string; endpoint: WebSocketEndpoint }[] = [];
  const listenersByEvent = new Map<
    string,
    { fileId: string; endpoint: WebSocketEndpoint }[]
  >();

  for (const [fileId, endpoints] of wsEndpointsByFile) {
    for (const ep of endpoints) {
      if (ep.type === 'server') {
        servers.push({ fileId, endpoint: ep });
      } else if (ep.type === 'event-listener') {
        const key = ep.target.toLowerCase();
        if (!listenersByEvent.has(key)) {
          listenersByEvent.set(key, []);
        }
        listenersByEvent.get(key)!.push({ fileId, endpoint: ep });
      }
    }
  }

  // Match clients -> servers
  for (const [clientFileId, endpoints] of wsEndpointsByFile) {
    for (const ep of endpoints) {
      if (ep.type === 'client') {
        // Connect each client to all known servers (in different files)
        for (const server of servers) {
          if (server.fileId === clientFileId) continue;
          const edgeId = `e-ws-${clientFileId}->${server.fileId}`;
          if (!seenEdges.has(edgeId)) {
            seenEdges.add(edgeId);
            edges.push({
              id: edgeId,
              source: clientFileId,
              target: server.fileId,
              label: `ws: connect`,
            });
          }
        }
      }

      // Match emitters -> listeners by event name
      if (ep.type === 'event-emitter') {
        const key = ep.target.toLowerCase();
        const listeners = listenersByEvent.get(key);
        if (listeners) {
          for (const listener of listeners) {
            if (listener.fileId === clientFileId) continue;
            const edgeId = `e-ws-${clientFileId}->${listener.fileId}`;
            if (!seenEdges.has(edgeId)) {
              seenEdges.add(edgeId);
              edges.push({
                id: edgeId,
                source: clientFileId,
                target: listener.fileId,
                label: `ws: ${ep.target}`,
              });
            }
          }
        }
      }
    }
  }

  return edges;
}
