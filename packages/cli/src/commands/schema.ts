import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printError, bold, dim, green, cyan, yellow } from '../lib/format';
import type {
  DatabaseConnectionConfig,
  DatabaseSchema,
  DatabaseTable,
} from '@omnigraph/types';

/** Parse a connection string into a DatabaseConnectionConfig */
function parseConnectionString(
  connStr: string,
  engine: 'postgresql' | 'mongodb',
): DatabaseConnectionConfig {
  try {
    const url = new URL(connStr);
    return {
      id: 'cli-live',
      name: 'CLI Live Connection',
      engine,
      host: url.hostname || 'localhost',
      port: Number(url.port) || (engine === 'mongodb' ? 27017 : 5432),
      database: url.pathname.replace(/^\//, '') || '',
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      ssl: url.searchParams.get('ssl') === 'true' || url.searchParams.get('sslmode') === 'require',
    };
  } catch {
    throw new Error(`Invalid connection string: ${connStr}`);
  }
}

/** Build a DatabaseConnectionConfig from CLI options */
function buildConnectionConfig(opts: Record<string, string | undefined>): DatabaseConnectionConfig {
  const engine = (opts.engine ?? 'postgresql') as 'postgresql' | 'mongodb';

  if (opts.connectionString) {
    return parseConnectionString(opts.connectionString, engine);
  }

  return {
    id: 'cli-live',
    name: 'CLI Live Connection',
    engine,
    host: opts.host ?? 'localhost',
    port: Number(opts.dbPort) || (engine === 'mongodb' ? 27017 : 5432),
    database: opts.database ?? '',
    username: opts.user ?? '',
    password: opts.password ?? '',
    ssl: false,
  };
}

/** Display schema from a live database connection */
async function liveSchema(
  config: DatabaseConnectionConfig,
  opts: Record<string, string | boolean | undefined>,
  fmtOpts: { json: boolean },
): Promise<void> {
  let schema: DatabaseSchema;

  try {
    if (config.engine === 'postgresql') {
      // Dynamic import — path resolved through package exports
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getPostgresSchema } = require(require.resolve('@omnigraph/server').replace(/dist[/\\]index\.js$/, 'dist/db/postgres-client.js'));
      schema = await getPostgresSchema(config);
    } else if (config.engine === 'mongodb') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getMongoSchema } = require(require.resolve('@omnigraph/server').replace(/dist[/\\]index\.js$/, 'dist/db/mongodb-client.js'));
      schema = await getMongoSchema(config);
    } else {
      printError(`Unsupported engine: ${config.engine}. Use 'postgresql' or 'mongodb'.`, fmtOpts);
      process.exit(1);
    }
  } catch (err) {
    printError(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`, fmtOpts);
    process.exit(1);
  }

  // Single table detail
  if (opts.table) {
    const tableName = opts.table as string;
    const table = schema.tables.find(t => t.name === tableName);
    if (!table) {
      printError(`Table not found: ${tableName}`, fmtOpts);
      process.exit(1);
    }
    if (fmtOpts.json) {
      printOutput(table, fmtOpts);
    } else {
      printLiveTable(table);
    }
    return;
  }

  // Show columns for a specific table
  if (opts.columns) {
    const tableName = opts.columns as string;
    const table = schema.tables.find(t => t.name === tableName);
    if (!table) {
      printError(`Table not found: ${tableName}`, fmtOpts);
      process.exit(1);
    }
    if (fmtOpts.json) {
      printOutput(table.columns, fmtOpts);
    } else {
      console.log(`\n${bold('Columns for')} ${green(table.name)} (${table.columns.length}):\n`);
      for (const col of table.columns) {
        const pk = col.isPrimaryKey ? ` ${yellow('PK')}` : '';
        const nullable = col.nullable ? dim(' NULL') : '';
        const def = col.defaultValue ? dim(` default=${col.defaultValue}`) : '';
        console.log(`  ${cyan(col.name)} ${dim(col.type)}${pk}${nullable}${def}`);
      }
      console.log();
    }
    return;
  }

  // Show FK relationships
  if (opts.fk) {
    const allFks = schema.tables.flatMap(t =>
      t.foreignKeys.map(fk => ({
        table: t.name,
        column: fk.columns.join(', '),
        references: `${fk.referencedTable}(${fk.referencedColumns.join(', ')})`,
        name: fk.name,
      })),
    );
    if (fmtOpts.json) {
      printOutput(allFks, fmtOpts);
    } else if (allFks.length === 0) {
      console.log(dim('No foreign key relationships found.'));
    } else {
      console.log(`\n${bold('Foreign Key Relationships')} (${allFks.length}):\n`);
      for (const fk of allFks) {
        console.log(`  ${green(fk.table)}.${cyan(fk.column)} ${dim('→')} ${green(fk.references)}`);
      }
      console.log();
    }
    return;
  }

  // Default: list all tables
  if (fmtOpts.json) {
    printOutput(schema.tables.map(t => ({
      name: t.name,
      type: t.type,
      columns: t.columns.length,
      indexes: t.indexes.length,
      foreignKeys: t.foreignKeys.length,
      rowCount: t.rowCount,
    })), fmtOpts);
  } else {
    console.log(`\n${bold(`${schema.engine} — ${schema.database}`)} (${schema.tables.length} tables):\n`);
    const rows = schema.tables.map(t => ({
      name: t.name,
      type: t.type ?? 'table',
      columns: t.columns.length,
      rows: t.rowCount ?? '?',
      FKs: t.foreignKeys.length,
    }));
    printOutput(rows, { json: false });
    console.log();
  }
}

/** Pretty-print a single live table */
function printLiveTable(table: DatabaseTable): void {
  console.log(`\n${bold('TABLE:')} ${green(table.name)}`);
  if (table.schema) console.log(`${dim('Schema:')} ${table.schema}`);
  if (table.type) console.log(`${dim('Type:')} ${table.type}`);
  if (table.rowCount !== undefined) console.log(`${dim('Rows:')} ~${table.rowCount}`);

  if (table.columns.length > 0) {
    console.log(`\n${bold('Columns')} (${table.columns.length}):`);
    for (const col of table.columns) {
      const pk = col.isPrimaryKey ? ` ${yellow('PK')}` : '';
      const nullable = col.nullable ? dim(' NULL') : '';
      console.log(`  ${cyan(col.name)} ${dim(col.type)}${pk}${nullable}`);
    }
  }

  if (table.indexes.length > 0) {
    console.log(`\n${bold('Indexes')} (${table.indexes.length}):`);
    for (const idx of table.indexes) {
      const uniq = idx.unique ? yellow(' UNIQUE') : '';
      console.log(`  ${idx.name} (${idx.columns.join(', ')})${uniq}`);
    }
  }

  if (table.foreignKeys.length > 0) {
    console.log(`\n${bold('Foreign Keys')} (${table.foreignKeys.length}):`);
    for (const fk of table.foreignKeys) {
      console.log(`  ${cyan(fk.columns.join(', '))} ${dim('→')} ${green(fk.referencedTable)}(${fk.referencedColumns.join(', ')})`);
    }
  }
  console.log();
}

export const schemaCommand = new Command('schema')
  .description('Inspect database schema from graph analysis or live connection')
  .option('--table <name>', 'Show details for a specific table')
  .option('--tables', 'List all detected database tables')
  .option('--fk', 'Show foreign key relationships')
  .option('--columns <table>', 'Show columns for a table')
  .option('--live', 'Connect to a live database instead of using the graph')
  .option('--engine <engine>', 'Database engine: postgresql or mongodb (default: postgresql)')
  .option('--host <host>', 'Database host (default: localhost)')
  .option('--db-port <port>', 'Database port (default: 5432 for pg, 27017 for mongo)')
  .option('--database <name>', 'Database name')
  .option('--user <username>', 'Database username')
  .option('--password <password>', 'Database password')
  .option('--connection-string <uri>', 'Full connection URI (overrides host/port/user/password)')
  .action(async (opts, cmd) => {
    const targetPath = cmd.parent?.opts().path ?? '.';
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };

    // Live mode: connect directly to a database
    if (opts.live) {
      if (!opts.database && !opts.connectionString) {
        printError('--live requires --database <name> or --connection-string <uri>', fmtOpts);
        process.exit(1);
      }
      const config = buildConnectionConfig(opts);
      await liveSchema(config, opts, fmtOpts);
      return;
    }

    // Static mode: load graph from filesystem
    let graph;
    try {
      graph = loadGraph(targetPath, json);
    } catch (err) {
      printError(String(err), fmtOpts);
      process.exit(2);
    }

    // Extract DB nodes from the graph
    const dbNodes = graph.nodes.filter(n => n.id.startsWith('db://'));
    const dbEdges = graph.edges.filter(e => e.id.startsWith('e-fk-') || e.id.startsWith('e-db-'));

    if (dbNodes.length === 0) {
      printError('No database tables found in the graph. Run the server with a database connection first to populate schema.', fmtOpts);
      process.exit(1);
    }

    // Single table detail
    if (opts.table) {
      const table = dbNodes.find(n =>
        n.label === opts.table ||
        n.id === `db://${opts.table}` ||
        n.id.endsWith(`/${opts.table}`),
      );
      if (!table) {
        printError(`Table not found: ${opts.table}`, fmtOpts);
        process.exit(1);
      }

      const fkOut = dbEdges.filter(e => e.source === table.id && e.id.startsWith('e-fk-'));
      const fkIn = dbEdges.filter(e => e.target === table.id && e.id.startsWith('e-fk-'));
      const codeRefs = graph.edges.filter(e => e.target === table.id && e.id.startsWith('e-db-'));

      if (json) {
        printOutput({
          table: table.label,
          id: table.id,
          metadata: table.metadata,
          foreignKeysOut: fkOut.map(e => ({ label: e.label, target: e.target })),
          foreignKeysIn: fkIn.map(e => ({ label: e.label, source: e.source })),
          referencedBy: codeRefs.map(e => ({ label: e.label, source: e.source })),
        }, fmtOpts);
        return;
      }

      console.log(`\n${bold('TABLE:')} ${green(table.label)}`);
      console.log(`${dim('ID:')} ${table.id}`);
      for (const [k, v] of Object.entries(table.metadata)) {
        if (v) console.log(`${dim(k + ':')} ${v}`);
      }

      if (fkOut.length > 0) {
        console.log(`\n${bold('References')} (${fkOut.length}):`);
        for (const e of fkOut) {
          console.log(`  ${cyan('→')} ${e.label} → ${e.target.replace('db://', '')}`);
        }
      }
      if (fkIn.length > 0) {
        console.log(`\n${bold('Referenced by')} (${fkIn.length}):`);
        for (const e of fkIn) {
          console.log(`  ${cyan('←')} ${e.source.replace('db://', '')} → ${e.label}`);
        }
      }
      if (codeRefs.length > 0) {
        console.log(`\n${bold('Code references')} (${codeRefs.length}):`);
        for (const e of codeRefs) {
          console.log(`  ${yellow('⇐')} ${e.source}`);
        }
      }
      console.log();
      return;
    }

    // Show FK relationships
    if (opts.fk) {
      const fkEdges = dbEdges.filter(e => e.id.startsWith('e-fk-'));
      if (json) {
        printOutput(fkEdges.map(e => ({
          source: e.source.replace('db://', ''),
          label: e.label,
          target: e.target.replace('db://', ''),
        })), fmtOpts);
        return;
      }

      if (fkEdges.length === 0) {
        console.log(dim('No foreign key relationships found.'));
        return;
      }

      console.log(`\n${bold('Foreign Key Relationships')} (${fkEdges.length}):\n`);
      for (const e of fkEdges) {
        const src = e.source.replace('db://', '');
        const tgt = e.target.replace('db://', '');
        console.log(`  ${green(src)} ${dim('→')} ${e.label} ${dim('→')} ${green(tgt)}`);
      }
      console.log();
      return;
    }

    // Default: list all tables
    if (json) {
      printOutput(dbNodes.map(n => ({
        name: n.label,
        id: n.id,
        type: n.type,
        ...n.metadata,
      })), fmtOpts);
      return;
    }

    console.log(`\n${bold('Database Tables')} (${dbNodes.length}):\n`);
    const rows = dbNodes.map(n => ({
      name: n.label,
      type: n.metadata.engine ?? n.type,
      columns: n.metadata.columnCount ?? '?',
      schema: n.metadata.schema ?? '',
    }));
    printOutput(rows, { json: false });
    console.log();
  });
