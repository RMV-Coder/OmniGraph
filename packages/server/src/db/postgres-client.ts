import { Client } from 'pg';
import type {
  DatabaseConnectionConfig,
  DatabaseConnectResult,
  DatabaseSchema,
  DatabaseTable,
  DatabaseColumn,
  DatabaseIndex,
  DatabaseQueryResult,
} from '@omnigraph/types';

/** Build a pg Client config from our connection config */
function buildPgConfig(config: DatabaseConnectionConfig) {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  };
}

/** Connect, run a callback, then always close */
async function withClient<T>(
  config: DatabaseConnectionConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(buildPgConfig(config));
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Test a PostgreSQL connection */
export async function testPostgresConnection(
  config: DatabaseConnectionConfig,
): Promise<DatabaseConnectResult> {
  try {
    const version = await withClient(config, async (client) => {
      const res = await client.query('SELECT version()');
      return res.rows[0]?.version as string;
    });
    return { success: true, serverVersion: version };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Get full schema for a PostgreSQL database */
export async function getPostgresSchema(
  config: DatabaseConnectionConfig,
): Promise<DatabaseSchema> {
  return withClient(config, async (client) => {
    // Get all tables and views (exclude system schemas)
    const tablesRes = await client.query(`
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    // Get all columns
    const columnsRes = await client.query(`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.udt_name
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `);

    // Get primary keys
    const pkRes = await client.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
    `);

    // Get indexes
    const indexRes = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename, indexname
    `);

    // Get row counts (approximate via pg_stat)
    const countRes = await client.query(`
      SELECT
        schemaname,
        relname,
        n_live_tup
      FROM pg_stat_user_tables
    `);

    // Build pk lookup: schema.table -> Set<column>
    const pkLookup = new Map<string, Set<string>>();
    for (const row of pkRes.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!pkLookup.has(key)) pkLookup.set(key, new Set());
      pkLookup.get(key)!.add(row.column_name);
    }

    // Build count lookup
    const countLookup = new Map<string, number>();
    for (const row of countRes.rows) {
      countLookup.set(`${row.schemaname}.${row.relname}`, Number(row.n_live_tup));
    }

    // Build index lookup
    const indexLookup = new Map<string, DatabaseIndex[]>();
    for (const row of indexRes.rows) {
      const key = `${row.schemaname}.${row.tablename}`;
      if (!indexLookup.has(key)) indexLookup.set(key, []);
      // Parse columns from indexdef (e.g. "CREATE INDEX ... ON ... (col1, col2)")
      const colMatch = row.indexdef?.match(/\(([^)]+)\)/);
      const cols = colMatch ? colMatch[1].split(',').map((c: string) => c.trim()) : [];
      indexLookup.get(key)!.push({
        name: row.indexname,
        columns: cols,
        unique: row.indexdef?.includes('UNIQUE') ?? false,
      });
    }

    // Build column lookup
    const columnLookup = new Map<string, DatabaseColumn[]>();
    for (const row of columnsRes.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!columnLookup.has(key)) columnLookup.set(key, []);
      const pks = pkLookup.get(key);
      let typeName = row.data_type;
      if (typeName === 'character varying' && row.character_maximum_length) {
        typeName = `varchar(${row.character_maximum_length})`;
      } else if (typeName === 'USER-DEFINED') {
        typeName = row.udt_name;
      }
      columnLookup.get(key)!.push({
        name: row.column_name,
        type: typeName,
        nullable: row.is_nullable === 'YES',
        isPrimaryKey: pks?.has(row.column_name) ?? false,
        defaultValue: row.column_default ?? null,
      });
    }

    // Assemble tables
    const tables: DatabaseTable[] = tablesRes.rows.map((row) => {
      const key = `${row.table_schema}.${row.table_name}`;
      return {
        name: row.table_name,
        schema: row.table_schema,
        type: row.table_type === 'VIEW' ? 'view' as const : 'table' as const,
        columns: columnLookup.get(key) ?? [],
        indexes: indexLookup.get(key) ?? [],
        rowCount: countLookup.get(key),
      };
    });

    return {
      engine: 'postgresql' as const,
      database: config.database,
      tables,
    };
  });
}

/** Execute a read-only query against PostgreSQL */
export async function executePostgresQuery(
  config: DatabaseConnectionConfig,
  query: string,
  limit: number = 100,
): Promise<DatabaseQueryResult> {
  return withClient(config, async (client) => {
    const start = Date.now();

    // Enforce read-only transaction
    await client.query('BEGIN READ ONLY');

    try {
      // Add LIMIT if not already present
      const trimmed = query.trim().replace(/;$/, '');
      const hasLimit = /\bLIMIT\b/i.test(trimmed);
      const finalQuery = hasLimit ? trimmed : `${trimmed} LIMIT ${Math.min(limit, 1000)}`;

      const res = await client.query(finalQuery);
      await client.query('COMMIT');

      const duration = Date.now() - start;
      const columns = res.fields?.map((f) => f.name) ?? [];

      return {
        columns,
        rows: res.rows as Record<string, unknown>[],
        rowCount: res.rowCount ?? 0,
        duration,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }
  });
}
