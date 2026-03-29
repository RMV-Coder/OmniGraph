import { Router } from 'express';
import * as crypto from 'crypto';
import type {
  DatabaseConnectionConfig,
  DatabaseSessionToken,
  DatabaseConnectResult,
} from '@omnigraph/types';
import {
  testPostgresConnection,
  getPostgresSchema,
  executePostgresQuery,
} from './postgres-client';
import {
  testMongoConnection,
  getMongoSchema,
  executeMongoQuery,
} from './mongodb-client';
import { scanEnvFiles, lookupCustomEnvKey } from './env-scanner';

// ─── Session Store ──────────────────────────────────────────────────
// Credentials are stored ONLY in server memory, keyed by an opaque token.
// Sessions expire after 1 hour of inactivity.

interface Session {
  config: DatabaseConnectionConfig;
  createdAt: number;
  lastUsedAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const sessions = new Map<string, Session>();

/** Generate a cryptographically random session token */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Clean up expired sessions */
function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}

/** Look up a session by token and refresh its TTL */
function getSession(token: string): Session | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastUsedAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastUsedAt = Date.now();
  return session;
}

// Purge every 10 minutes
setInterval(purgeExpiredSessions, 10 * 60 * 1000);

// ─── Validation ─────────────────────────────────────────────────────

/** Validate that a connection config has the required fields */
function validateConfig(config: unknown): config is DatabaseConnectionConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.engine === 'string' &&
    (c.engine === 'postgresql' || c.engine === 'mongodb') &&
    typeof c.host === 'string' &&
    typeof c.port === 'number' &&
    typeof c.database === 'string'
  );
}

// ─── Router ─────────────────────────────────────────────────────────

export function createDbRouter(targetPath: string): Router {
  const router = Router();

  /**
   * POST /api/db/connect — Submit credentials, test connection, get session token
   * Body: { connection: DatabaseConnectionConfig }
   * Returns: { success, token?, serverVersion?, error? }
   *
   * On success, credentials are stored in server memory and an opaque token
   * is returned. The UI uses this token for all subsequent requests.
   * Credentials NEVER need to be stored in localStorage.
   */
  router.post('/connect', async (req, res) => {
    try {
      const { connection } = req.body;
      if (!validateConfig(connection)) {
        res.status(400).json({ success: false, error: 'Invalid connection configuration' });
        return;
      }

      let result: DatabaseConnectResult;
      if (connection.engine === 'postgresql') {
        result = await testPostgresConnection(connection);
      } else if (connection.engine === 'mongodb') {
        result = await testMongoConnection(connection);
      } else {
        res.status(400).json({ success: false, error: `Unsupported engine: ${connection.engine}` });
        return;
      }

      if (result.success) {
        // Store credentials in server memory, return opaque token
        const token = generateToken();
        const now = Date.now();
        sessions.set(token, {
          config: { ...connection },
          createdAt: now,
          lastUsedAt: now,
        });

        res.json({
          ...result,
          token,
          connectionId: connection.id,
        });
      } else {
        res.json(result);
      }
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/db/disconnect — Destroy a session token
   * Body: { token: string }
   */
  router.post('/disconnect', (req, res) => {
    const { token } = req.body;
    if (token && typeof token === 'string') {
      sessions.delete(token);
    }
    res.json({ success: true });
  });

  /**
   * POST /api/db/schema — Get database schema using session token
   * Body: { token: string }
   */
  router.post('/schema', async (req, res) => {
    try {
      const { token } = req.body;
      const session = getSession(token);
      if (!session) {
        res.status(401).json({ error: 'Session expired or invalid. Please reconnect.' });
        return;
      }

      const { config } = session;
      let schema;
      if (config.engine === 'postgresql') {
        schema = await getPostgresSchema(config);
      } else if (config.engine === 'mongodb') {
        schema = await getMongoSchema(config);
      } else {
        res.status(400).json({ error: `Unsupported engine: ${config.engine}` });
        return;
      }

      res.json(schema);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/db/query — Execute a read-only query using session token
   * Body: { token: string, query: string, limit?: number }
   */
  router.post('/query', async (req, res) => {
    try {
      const { token, query, limit } = req.body;
      const session = getSession(token);
      if (!session) {
        res.status(401).json({ error: 'Session expired or invalid. Please reconnect.' });
        return;
      }

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Missing or invalid query' });
        return;
      }

      const rowLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
      const { config } = session;

      let result;
      if (config.engine === 'postgresql') {
        result = await executePostgresQuery(config, query, rowLimit);
      } else if (config.engine === 'mongodb') {
        result = await executeMongoQuery(config, query, rowLimit);
      } else {
        res.status(400).json({ error: `Unsupported engine: ${config.engine}` });
        return;
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /api/db/env — Auto-detect database connections from .env files
   * Scans the target project directory for .env, .env.local, .env.development, etc.
   * Returns connection metadata WITHOUT passwords (passwords stay server-side).
   */
  router.get('/env', (_req, res) => {
    try {
      const detected = scanEnvFiles(targetPath);
      res.json({ connections: detected });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/db/env/connect — Connect using a detected .env connection
   * Body: { envKey: string, source: string }
   * The server reads the actual password from the .env file (never sent to client).
   */
  router.post('/env/connect', async (req, res) => {
    try {
      const { envKey, source } = req.body;
      if (!envKey || !source) {
        res.status(400).json({ success: false, error: 'Missing envKey or source' });
        return;
      }

      // Re-scan to get the full config (with password, server-side only)
      const detected = scanEnvFiles(targetPath);
      const match = detected.find(d => d.envKey === envKey && d.source === source);
      if (!match) {
        res.status(404).json({ success: false, error: 'Environment variable not found' });
        return;
      }

      // Build full connection config with password (stays server-side)
      const config: DatabaseConnectionConfig = {
        id: `env-${source}-${envKey}`,
        name: `${envKey} (${source})`,
        engine: match.engine,
        host: match.host,
        port: match.port,
        database: match.database,
        username: match.username,
        password: match.password, // server-side only, never sent to client
        ssl: match.ssl,
      };

      let result: DatabaseConnectResult;
      if (config.engine === 'postgresql') {
        result = await testPostgresConnection(config);
      } else {
        result = await testMongoConnection(config);
      }

      if (result.success) {
        const token = generateToken();
        const now = Date.now();
        sessions.set(token, { config, createdAt: now, lastUsedAt: now });
        res.json({ ...result, token, connectionId: config.id });
      } else {
        res.json(result);
      }
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/db/env/lookup — Look up a custom env variable name
   * Body: { key: string }
   * Searches all .env files for the given key, tries to parse as a DB URI.
   * Returns the detected connection (without password) or an error.
   */
  router.post('/env/lookup', (req, res) => {
    try {
      const { key } = req.body;
      if (!key || typeof key !== 'string') {
        res.status(400).json({ error: 'Missing "key" field' });
        return;
      }

      const result = lookupCustomEnvKey(targetPath, key);
      if (!result) {
        res.status(404).json({
          error: `Variable "${key}" not found in .env files, or its value is not a recognized database connection string (postgresql:// or mongodb://)`,
        });
        return;
      }

      // Strip password before sending to client
      const { password, ...safe } = result;
      res.json({ connection: safe });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/db/env/connect-custom — Connect using a custom env key
   * Body: { key: string }
   * Like /env/connect but for user-specified variable names.
   */
  router.post('/env/connect-custom', async (req, res) => {
    try {
      const { key } = req.body;
      if (!key || typeof key !== 'string') {
        res.status(400).json({ success: false, error: 'Missing "key" field' });
        return;
      }

      const match = lookupCustomEnvKey(targetPath, key.trim());
      if (!match) {
        res.status(404).json({
          success: false,
          error: `Variable "${key}" not found or not a recognized DB connection string`,
        });
        return;
      }

      const config: DatabaseConnectionConfig = {
        id: `env-${match.source}-${match.envKey}`,
        name: `${match.envKey} (${match.source})`,
        engine: match.engine,
        host: match.host,
        port: match.port,
        database: match.database,
        username: match.username,
        password: match.password,
        ssl: match.ssl,
      };

      let result: DatabaseConnectResult;
      if (config.engine === 'postgresql') {
        result = await testPostgresConnection(config);
      } else {
        result = await testMongoConnection(config);
      }

      if (result.success) {
        const token = generateToken();
        const now = Date.now();
        sessions.set(token, { config, createdAt: now, lastUsedAt: now });
        res.json({ ...result, token, connectionId: config.id });
      } else {
        res.json(result);
      }
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
