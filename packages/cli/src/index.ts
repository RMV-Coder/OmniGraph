#!/usr/bin/env node
import { Command } from 'commander';
import { graphCommand } from './commands/graph';
import { traceCommand } from './commands/trace';
import { fetchCommand } from './commands/fetch';
import { methodsCommand } from './commands/methods';
import { schemaCommand } from './commands/schema';
import { serveCommand } from './commands/serve';

const program = new Command();

program
  .name('omnigraph')
  .description('Statically analyze a codebase and visualize its dependency graph')
  .version('1.0.0')
  .option('--path <path>', 'Path to the repository to analyze', '.')
  .option('--json', 'Output results as JSON (machine-readable)')
  .option('--watch', 'Watch for file changes and auto-refresh the graph');

// Register subcommands
program.addCommand(graphCommand);
program.addCommand(traceCommand);
program.addCommand(fetchCommand);
program.addCommand(methodsCommand);
program.addCommand(schemaCommand);
program.addCommand(serveCommand);

// Default action: if no subcommand given, start the visualization server
program.action(async (opts) => {
  const path = await import('path');
  const targetPath = path.resolve(opts.path);
  const port = 4000;
  const { createServer } = await import('@omnigraph/server');
  createServer(targetPath, port, { watch: opts.watch ?? false });
});

program.parse(process.argv);
