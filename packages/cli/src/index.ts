#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { createServer } from '@omnigraph/server';

const program = new Command();

program
  .name('omnigraph')
  .description('Statically analyze a codebase and visualize its dependency graph')
  .version('1.0.0')
  .requiredOption('--path <path>', 'Path to the repository to analyze')
  .option('--port <port>', 'Port to run the server on', '3000')
  .action((options) => {
    const targetPath = path.resolve(options.path);
    const port = parseInt(options.port, 10);
    createServer(targetPath, port);
  });

program.parse(process.argv);
