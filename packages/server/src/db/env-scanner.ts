import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseEngine } from '@omnigraph/types';

/** Detected DB connection from an .env file — includes password for server-side use */
export interface DetectedEnvConnection {
  source: string;       // e.g. '.env', '.env.local'
  envKey: string;       // e.g. 'DATABASE_URL', 'MONGO_URI'
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;     // kept server-side only
  hasPassword: boolean;
  ssl?: boolean;
}

/** .env file names to scan, in priority order */
const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
];

/** Known env variable keys that typically contain DB connection strings */
const POSTGRES_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URI',
  'PG_CONNECTION_STRING',
  'DB_URL',
  'DB_CONNECTION_STRING',
  'SUPABASE_DB_URL',
  'DIRECT_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'NEON_DATABASE_URL',
];

const MONGO_KEYS = [
  'MONGODB_URI',
  'MONGO_URI',
  'MONGO_URL',
  'MONGODB_URL',
  'MONGO_CONNECTION_STRING',
  'ATLAS_URI',
];

/** Known env variable patterns for individual fields (host/port/user/pass/db) */
const FIELD_PATTERNS: {
  engine: DatabaseEngine;
  prefix: string;
  hostKeys: string[];
  portKeys: string[];
  userKeys: string[];
  passKeys: string[];
  dbKeys: string[];
}[] = [
  {
    engine: 'postgresql',
    prefix: 'PG',
    hostKeys: ['DB_HOST', 'PG_HOST', 'POSTGRES_HOST', 'PGHOST'],
    portKeys: ['DB_PORT', 'PG_PORT', 'POSTGRES_PORT', 'PGPORT'],
    userKeys: ['DB_USER', 'PG_USER', 'POSTGRES_USER', 'PGUSER', 'DB_USERNAME', 'POSTGRES_USERNAME'],
    passKeys: ['DB_PASSWORD', 'PG_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD', 'DB_PASS'],
    dbKeys: ['DB_NAME', 'PG_DATABASE', 'POSTGRES_DB', 'PGDATABASE', 'DB_DATABASE'],
  },
  {
    engine: 'mongodb',
    prefix: 'MONGO',
    hostKeys: ['MONGO_HOST', 'MONGODB_HOST'],
    portKeys: ['MONGO_PORT', 'MONGODB_PORT'],
    userKeys: ['MONGO_USER', 'MONGODB_USER', 'MONGO_USERNAME'],
    passKeys: ['MONGO_PASSWORD', 'MONGODB_PASSWORD', 'MONGO_PASS'],
    dbKeys: ['MONGO_DB', 'MONGODB_DB', 'MONGO_DATABASE', 'MONGODB_DATABASE'],
  },
];

/**
 * Parse a .env file into key-value pairs.
 * Handles: KEY=VALUE, KEY="VALUE", KEY='VALUE', comments, empty lines
 */
function parseEnvFile(filePath: string): Map<string, string> {
  const vars = new Map<string, string>();
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Strip inline comments (only outside quotes)
      const commentIdx = value.indexOf(' #');
      if (commentIdx > 0) {
        value = value.substring(0, commentIdx).trim();
      }

      if (key && value) {
        vars.set(key, value);
      }
    }
  } catch {
    // File doesn't exist or can't be read — skip silently
  }
  return vars;
}

/**
 * Parse a PostgreSQL connection URI:
 * postgresql://user:password@host:port/database?sslmode=require
 * postgres://user:password@host:port/database
 */
function parsePostgresUri(uri: string): Omit<DetectedEnvConnection, 'source' | 'envKey'> | null {
  try {
    // Normalize protocol for URL parser
    const normalized = uri.replace(/^postgres:\/\//, 'postgresql://');
    if (!normalized.startsWith('postgresql://')) return null;

    const url = new URL(normalized);
    return {
      engine: 'postgresql',
      host: url.hostname || 'localhost',
      port: parseInt(url.port, 10) || 5432,
      database: url.pathname.replace(/^\//, '') || 'postgres',
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      hasPassword: !!url.password,
      ssl: url.searchParams.get('sslmode') === 'require' ||
           url.searchParams.get('ssl') === 'true' ||
           undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a MongoDB connection URI:
 * mongodb://user:password@host:port/database?authSource=admin
 * mongodb+srv://user:password@cluster.example.com/database
 */
function parseMongoUri(uri: string): Omit<DetectedEnvConnection, 'source' | 'envKey'> | null {
  try {
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) return null;

    const url = new URL(uri);
    return {
      engine: 'mongodb',
      host: url.hostname || 'localhost',
      port: parseInt(url.port, 10) || 27017,
      database: url.pathname.replace(/^\//, '') || 'test',
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      hasPassword: !!url.password,
      ssl: url.searchParams.get('tls') === 'true' ||
           url.searchParams.get('ssl') === 'true' ||
           uri.startsWith('mongodb+srv://') ||
           undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Scan the target project's .env files for database connection strings.
 * Returns detected connections with passwords (for server-side use only).
 * The API endpoint strips passwords before sending to the client.
 */
export function scanEnvFiles(targetPath: string): DetectedEnvConnection[] {
  const results: DetectedEnvConnection[] = [];
  const seen = new Set<string>(); // dedupe by envKey+value hash

  for (const envFile of ENV_FILES) {
    const filePath = path.join(targetPath, envFile);
    if (!fs.existsSync(filePath)) continue;

    const vars = parseEnvFile(filePath);

    // Check for connection string URLs
    for (const key of POSTGRES_KEYS) {
      const value = vars.get(key);
      if (!value) continue;
      const parsed = parsePostgresUri(value);
      if (!parsed) continue;

      const dedupeKey = `${key}:${parsed.host}:${parsed.port}:${parsed.database}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      results.push({ ...parsed, source: envFile, envKey: key });
    }

    for (const key of MONGO_KEYS) {
      const value = vars.get(key);
      if (!value) continue;
      const parsed = parseMongoUri(value);
      if (!parsed) continue;

      const dedupeKey = `${key}:${parsed.host}:${parsed.port}:${parsed.database}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      results.push({ ...parsed, source: envFile, envKey: key });
    }

    // Check for individual field patterns (DB_HOST, DB_PORT, etc.)
    for (const pattern of FIELD_PATTERNS) {
      const host = pattern.hostKeys.find(k => vars.has(k));
      const db = pattern.dbKeys.find(k => vars.has(k));
      if (!host || !db) continue; // need at least host + database

      const dedupeKey = `${pattern.engine}:${vars.get(host!)}:${vars.get(db!)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const portKey = pattern.portKeys.find(k => vars.has(k));
      const userKey = pattern.userKeys.find(k => vars.has(k));
      const passKey = pattern.passKeys.find(k => vars.has(k));
      const defaultPort = pattern.engine === 'postgresql' ? 5432 : 27017;

      results.push({
        source: envFile,
        envKey: host!, // use the host key as the identifier
        engine: pattern.engine,
        host: vars.get(host!) || 'localhost',
        port: portKey ? parseInt(vars.get(portKey)!, 10) || defaultPort : defaultPort,
        database: vars.get(db!) || '',
        username: userKey ? vars.get(userKey)! : '',
        password: passKey ? vars.get(passKey)! : '',
        hasPassword: !!passKey && !!vars.get(passKey!),
      });
    }
  }

  return results;
}

/**
 * Look up a custom env variable key across all .env files in the target project.
 * Attempts to parse the value as a PostgreSQL or MongoDB connection URI.
 * Returns the parsed connection (with password, server-side only) or null.
 */
export function lookupCustomEnvKey(
  targetPath: string,
  customKey: string,
): DetectedEnvConnection | null {
  const trimmedKey = customKey.trim();
  if (!trimmedKey) return null;

  for (const envFile of ENV_FILES) {
    const filePath = path.join(targetPath, envFile);
    if (!fs.existsSync(filePath)) continue;

    const vars = parseEnvFile(filePath);
    const value = vars.get(trimmedKey);
    if (!value) continue;

    // Try parsing as PostgreSQL URI
    const pg = parsePostgresUri(value);
    if (pg) {
      return { ...pg, source: envFile, envKey: trimmedKey };
    }

    // Try parsing as MongoDB URI
    const mongo = parseMongoUri(value);
    if (mongo) {
      return { ...mongo, source: envFile, envKey: trimmedKey };
    }

    // Not a recognized connection string format
    return null;
  }

  return null;
}
