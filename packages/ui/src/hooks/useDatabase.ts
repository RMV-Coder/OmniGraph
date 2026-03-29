import { useState, useCallback, useEffect } from 'react';
import type {
  DatabaseConnectionConfig,
  DatabaseSavedConnection,
  DatabaseEngine,
  DatabaseSchema,
  DatabaseQueryResult,
  DatabaseEnvConnection,
} from '../types';

// ─── Types ──────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'testing' | 'connected' | 'error';

export interface SavedConnection {
  /** Non-sensitive metadata (persisted in localStorage) */
  saved: DatabaseSavedConnection;
  /** Runtime state (not persisted) */
  status: ConnectionStatus;
  error?: string;
  serverVersion?: string;
  /** Opaque session token from the server (credentials are server-side only) */
  sessionToken?: string;
}

// ─── LocalStorage ───────────────────────────────────────────────────

const STORAGE_KEY = 'omnigraph-db-connections';

/** Load saved connection metadata from localStorage (NO credentials) */
function loadConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as DatabaseSavedConnection[];
    return saved.map((s) => ({ saved: s, status: 'disconnected' as const }));
  } catch {
    return [];
  }
}

/** Persist non-sensitive connection metadata to localStorage */
function saveConnections(connections: SavedConnection[]): void {
  try {
    const metadata = connections.map((c) => c.saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
  } catch { /* ignore */ }
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_PORTS: Record<DatabaseEngine, number> = {
  postgresql: 5432,
  mongodb: 27017,
};

export function defaultConnectionConfig(engine: DatabaseEngine = 'postgresql'): DatabaseSavedConnection {
  return {
    id: crypto.randomUUID(),
    name: '',
    engine,
    host: 'localhost',
    port: DEFAULT_PORTS[engine],
    database: '',
    ssl: false,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useDatabase() {
  const [connections, setConnections] = useState<SavedConnection[]>(loadConnections);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [envConnections, setEnvConnections] = useState<DatabaseEnvConnection[]>([]);
  const [envLoading, setEnvLoading] = useState(false);

  // Persist non-sensitive metadata whenever connections change
  useEffect(() => {
    saveConnections(connections);
  }, [connections]);

  // Auto-detect .env connections on mount
  useEffect(() => {
    setEnvLoading(true);
    fetch('/api/db/env')
      .then((r) => r.json())
      .then((data: { connections: DatabaseEnvConnection[] }) => {
        setEnvConnections(data.connections ?? []);
      })
      .catch(() => {
        setEnvConnections([]);
      })
      .finally(() => setEnvLoading(false));
  }, []);

  // ─── Connection Management ────────────────────────────────────────

  const addConnection = useCallback((saved: DatabaseSavedConnection) => {
    setConnections((prev) => [...prev, { saved, status: 'disconnected' }]);
  }, []);

  const updateConnection = useCallback((id: string, patch: Partial<DatabaseSavedConnection>) => {
    setConnections((prev) =>
      prev.map((c) =>
        c.saved.id === id
          ? { ...c, saved: { ...c.saved, ...patch }, status: 'disconnected' as const, sessionToken: undefined }
          : c,
      ),
    );
  }, []);

  const removeConnection = useCallback((id: string) => {
    // Destroy server session if active
    const conn = connections.find((c) => c.saved.id === id);
    if (conn?.sessionToken) {
      fetch('/api/db/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: conn.sessionToken }),
      }).catch(() => {});
    }
    setConnections((prev) => prev.filter((c) => c.saved.id !== id));
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
      setSchema(null);
      setQueryResult(null);
      setQueryError(null);
    }
  }, [connections, activeConnectionId]);

  // ─── Connect (Manual — credentials sent once, stored server-side) ─

  const connectWithCredentials = useCallback(async (
    id: string,
    username: string,
    password: string,
  ) => {
    const conn = connections.find((c) => c.saved.id === id);
    if (!conn) return;

    setConnections((prev) =>
      prev.map((c) =>
        c.saved.id === id ? { ...c, status: 'testing' as const, error: undefined } : c,
      ),
    );

    const fullConfig: DatabaseConnectionConfig = {
      ...conn.saved,
      username,
      password,
    };

    try {
      const res = await fetch('/api/db/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: fullConfig }),
      });
      const data = await res.json();

      setConnections((prev) =>
        prev.map((c) =>
          c.saved.id === id
            ? {
                ...c,
                status: data.success ? ('connected' as const) : ('error' as const),
                error: data.error,
                serverVersion: data.serverVersion,
                sessionToken: data.token,
              }
            : c,
        ),
      );
    } catch (err) {
      setConnections((prev) =>
        prev.map((c) =>
          c.saved.id === id
            ? { ...c, status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
            : c,
        ),
      );
    }
  }, [connections]);

  // ─── Connect from .env (server reads password from the file) ──────

  const connectFromEnv = useCallback(async (envConn: DatabaseEnvConnection) => {
    // Create a temporary saved connection for the UI
    const id = `env-${envConn.source}-${envConn.envKey}`;
    const saved: DatabaseSavedConnection = {
      id,
      name: `${envConn.envKey} (${envConn.source})`,
      engine: envConn.engine,
      host: envConn.host,
      port: envConn.port,
      database: envConn.database,
      ssl: envConn.ssl,
    };

    // Add to connections list if not already there
    setConnections((prev) => {
      const exists = prev.some((c) => c.saved.id === id);
      if (exists) {
        return prev.map((c) =>
          c.saved.id === id ? { ...c, saved, status: 'testing' as const, error: undefined } : c,
        );
      }
      return [...prev, { saved, status: 'testing' as const }];
    });

    try {
      const res = await fetch('/api/db/env/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envKey: envConn.envKey, source: envConn.source }),
      });
      const data = await res.json();

      setConnections((prev) =>
        prev.map((c) =>
          c.saved.id === id
            ? {
                ...c,
                status: data.success ? ('connected' as const) : ('error' as const),
                error: data.error,
                serverVersion: data.serverVersion,
                sessionToken: data.token,
              }
            : c,
        ),
      );
    } catch (err) {
      setConnections((prev) =>
        prev.map((c) =>
          c.saved.id === id
            ? { ...c, status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
            : c,
        ),
      );
    }
  }, []);

  // ─── Load Schema ──────────────────────────────────────────────────

  const loadSchema = useCallback(async (id: string) => {
    const conn = connections.find((c) => c.saved.id === id);
    if (!conn?.sessionToken) return;

    setActiveConnectionId(id);
    setSchemaLoading(true);
    setSchemaError(null);
    setSchema(null);
    setQueryResult(null);
    setQueryError(null);

    try {
      const res = await fetch('/api/db/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: conn.sessionToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as DatabaseSchema;
      setSchema(data);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : String(err));
    } finally {
      setSchemaLoading(false);
    }
  }, [connections]);

  // ─── Execute Query ────────────────────────────────────────────────

  const executeQuery = useCallback(async (queryStr: string, limit?: number) => {
    const conn = connections.find((c) => c.saved.id === activeConnectionId);
    if (!conn?.sessionToken) {
      setQueryError('No active session. Please connect first.');
      return;
    }

    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: conn.sessionToken,
          query: queryStr,
          limit: limit ?? 100,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as DatabaseQueryResult;
      setQueryResult(data);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
    } finally {
      setQueryLoading(false);
    }
  }, [connections, activeConnectionId]);

  // ─── Connect from custom .env key ──────────────────────────────────

  const connectFromCustomKey = useCallback(async (key: string): Promise<string | null> => {
    const trimmed = key.trim();
    if (!trimmed) return 'Please enter an env variable name';

    try {
      const res = await fetch('/api/db/env/connect-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return data.error || 'Connection failed';
      }

      // Add to connections list
      const id = data.connectionId as string;
      // We need to fetch the connection metadata (without password)
      const lookupRes = await fetch('/api/db/env/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });
      const lookupData = await lookupRes.json();
      const env = lookupData.connection;

      const saved: DatabaseSavedConnection = {
        id,
        name: `${trimmed} (${env?.source ?? '.env'})`,
        engine: env?.engine ?? 'postgresql',
        host: env?.host ?? 'localhost',
        port: env?.port ?? 5432,
        database: env?.database ?? '',
        ssl: env?.ssl,
      };

      setConnections((prev) => {
        const exists = prev.some((c) => c.saved.id === id);
        if (exists) {
          return prev.map((c) =>
            c.saved.id === id
              ? { ...c, saved, status: 'connected' as const, sessionToken: data.token, serverVersion: data.serverVersion }
              : c,
          );
        }
        return [...prev, {
          saved,
          status: 'connected' as const,
          sessionToken: data.token,
          serverVersion: data.serverVersion,
        }];
      });

      return null; // success
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  // ─── Disconnect ───────────────────────────────────────────────────

  const disconnect = useCallback((id: string) => {
    const conn = connections.find((c) => c.saved.id === id);
    if (conn?.sessionToken) {
      fetch('/api/db/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: conn.sessionToken }),
      }).catch(() => {});
    }

    setConnections((prev) =>
      prev.map((c) =>
        c.saved.id === id
          ? { ...c, status: 'disconnected' as const, error: undefined, sessionToken: undefined }
          : c,
      ),
    );
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
      setSchema(null);
      setQueryResult(null);
      setQueryError(null);
    }
  }, [connections, activeConnectionId]);

  const clearQuery = useCallback(() => {
    setQueryResult(null);
    setQueryError(null);
  }, []);

  return {
    // State
    connections,
    activeConnectionId,
    schema,
    schemaLoading,
    schemaError,
    queryResult,
    queryLoading,
    queryError,
    envConnections,
    envLoading,
    // Connection management
    addConnection,
    updateConnection,
    removeConnection,
    connectWithCredentials,
    connectFromEnv,
    connectFromCustomKey,
    disconnect,
    // Schema & query
    loadSchema,
    executeQuery,
    clearQuery,
  };
}
