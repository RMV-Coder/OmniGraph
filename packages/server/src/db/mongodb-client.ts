import { MongoClient } from 'mongodb';
import type {
  DatabaseConnectionConfig,
  DatabaseConnectResult,
  DatabaseSchema,
  DatabaseTable,
  DatabaseColumn,
  DatabaseIndex,
  DatabaseQueryResult,
} from '@omnigraph/types';

/** Build a MongoDB connection URI from our config */
function buildMongoUri(config: DatabaseConnectionConfig): string {
  const auth = config.username
    ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
    : '';
  const authSource = config.authSource ? `?authSource=${config.authSource}` : '';
  const tls = config.ssl ? '&tls=true&tlsAllowInvalidCertificates=true' : '';
  const sep = authSource ? '&' : '?';
  return `mongodb://${auth}${config.host}:${config.port}/${config.database}${authSource}${tls ? `${authSource ? '&' : '?'}tls=true&tlsAllowInvalidCertificates=true` : ''}`;
}

/** Connect, run a callback, then always close */
async function withClient<T>(
  config: DatabaseConnectionConfig,
  fn: (client: MongoClient) => Promise<T>,
): Promise<T> {
  const uri = buildMongoUri(config);
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Test a MongoDB connection */
export async function testMongoConnection(
  config: DatabaseConnectionConfig,
): Promise<DatabaseConnectResult> {
  try {
    const version = await withClient(config, async (client) => {
      const admin = client.db().admin();
      const info = await admin.serverInfo();
      return info.version as string;
    });
    return { success: true, serverVersion: `MongoDB ${version}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Infer column types from a sample of documents */
function inferColumnsFromDocs(docs: Record<string, unknown>[]): DatabaseColumn[] {
  const fieldTypes = new Map<string, Set<string>>();
  const fieldNullable = new Map<string, boolean>();

  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (!fieldTypes.has(key)) {
        fieldTypes.set(key, new Set());
        fieldNullable.set(key, false);
      }
      if (value === null || value === undefined) {
        fieldNullable.set(key, true);
      } else if (Array.isArray(value)) {
        fieldTypes.get(key)!.add('array');
      } else if (value instanceof Date) {
        fieldTypes.get(key)!.add('date');
      } else if (typeof value === 'object' && value !== null) {
        // Check for ObjectId
        const v = value as Record<string, unknown>;
        if (v._bsontype === 'ObjectId' || v.constructor?.name === 'ObjectId') {
          fieldTypes.get(key)!.add('ObjectId');
        } else {
          fieldTypes.get(key)!.add('object');
        }
      } else {
        fieldTypes.get(key)!.add(typeof value);
      }
    }
  }

  const columns: DatabaseColumn[] = [];
  for (const [name, types] of fieldTypes) {
    const typeStr = Array.from(types).join(' | ');
    columns.push({
      name,
      type: typeStr || 'unknown',
      nullable: fieldNullable.get(name) ?? true,
      isPrimaryKey: name === '_id',
      defaultValue: null,
    });
  }

  // Sort: _id first, then alphabetical
  columns.sort((a, b) => {
    if (a.name === '_id') return -1;
    if (b.name === '_id') return 1;
    return a.name.localeCompare(b.name);
  });

  return columns;
}

/** Get full schema for a MongoDB database */
export async function getMongoSchema(
  config: DatabaseConnectionConfig,
): Promise<DatabaseSchema> {
  return withClient(config, async (client) => {
    const db = client.db(config.database);
    const collections = await db.listCollections().toArray();

    const tables: DatabaseTable[] = [];
    for (const coll of collections) {
      if (coll.type === 'view') continue; // skip views for now

      const collection = db.collection(coll.name);

      // Sample documents to infer schema
      let sampleDocs: Record<string, unknown>[] = [];
      try {
        sampleDocs = await collection
          .aggregate([{ $sample: { size: 100 } }])
          .toArray() as Record<string, unknown>[];
      } catch {
        // $sample may fail on some collection types; fall back to find
        sampleDocs = await collection
          .find({})
          .limit(100)
          .toArray() as Record<string, unknown>[];
      }

      // Get indexes
      let indexSpecs: DatabaseIndex[] = [];
      try {
        const rawIndexes = await collection.indexes();
        indexSpecs = rawIndexes.map((idx) => ({
          name: idx.name ?? '',
          columns: Object.keys(idx.key ?? {}),
          unique: idx.unique ?? false,
        }));
      } catch { /* some collections may not support listIndexes */ }

      // Get doc count
      let rowCount: number | undefined;
      try {
        rowCount = await collection.estimatedDocumentCount();
      } catch { /* ignore */ }

      tables.push({
        name: coll.name,
        type: 'collection',
        columns: inferColumnsFromDocs(sampleDocs),
        indexes: indexSpecs,
        rowCount,
      });
    }

    // Sort alphabetically
    tables.sort((a, b) => a.name.localeCompare(b.name));

    return {
      engine: 'mongodb' as const,
      database: config.database,
      tables,
    };
  });
}

/** Execute a read-only (find) query against MongoDB */
export async function executeMongoQuery(
  config: DatabaseConnectionConfig,
  queryStr: string,
  limit: number = 100,
): Promise<DatabaseQueryResult> {
  return withClient(config, async (client) => {
    const db = client.db(config.database);
    const start = Date.now();

    // Parse query JSON: { collection: "users", filter: { ... }, sort: { ... }, projection: { ... } }
    let parsed: {
      collection: string;
      filter?: Record<string, unknown>;
      sort?: Record<string, unknown>;
      projection?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(queryStr);
    } catch {
      throw new Error(
        'Invalid query format. Expected JSON: { "collection": "name", "filter": { ... } }',
      );
    }

    if (!parsed.collection) {
      throw new Error('Query must include a "collection" field');
    }

    const collection = db.collection(parsed.collection);
    const clampedLimit = Math.min(limit, 1000);

    let cursor = collection.find(parsed.filter ?? {});
    if (parsed.sort) cursor = cursor.sort(parsed.sort as any);
    if (parsed.projection) cursor = cursor.project(parsed.projection);
    cursor = cursor.limit(clampedLimit);

    const rows = await cursor.toArray() as Record<string, unknown>[];
    const duration = Date.now() - start;

    // Collect all column names from results
    const columnSet = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        columnSet.add(key);
      }
    }

    return {
      columns: Array.from(columnSet),
      rows,
      rowCount: rows.length,
      duration,
    };
  });
}
