import { Command } from 'commander';
import path from 'path';

export const serveCommand = new Command('serve')
  .description('Start the OmniGraph visualization server')
  .option('--port <port>', 'Port to run the server on', '4000')
  .option('--watch', 'Watch for file changes and auto-refresh the graph')
  .action(async (opts, cmd) => {
    const targetPath = path.resolve(cmd.parent?.opts().path ?? '.');
    const port = parseInt(opts.port, 10);
    const { createServer } = await import('@omnigraph/server');
    createServer(targetPath, port, { watch: opts.watch ?? false });
  });
