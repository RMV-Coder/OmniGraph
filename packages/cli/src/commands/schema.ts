import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printError, bold, dim, green, cyan, yellow } from '../lib/format';

export const schemaCommand = new Command('schema')
  .description('Inspect database schema from graph analysis or live connection')
  .option('--table <name>', 'Show details for a specific table')
  .option('--tables', 'List all detected database tables')
  .option('--fk', 'Show foreign key relationships')
  .option('--columns <table>', 'Show columns for a table')
  .action((opts, cmd) => {
    const targetPath = cmd.parent?.opts().path ?? '.';
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };

    // Load the graph to find db:// nodes
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
