import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { printOutput, printError, bold, dim, green } from '../lib/format';

export const methodsCommand = new Command('methods')
  .description('List functions/methods in a file')
  .requiredOption('--file <file>', 'File to analyze')
  .option('--exported', 'Show only exported functions')
  .option('--kind <kind>', 'Filter by kind: function, method, arrow, getter, setter')
  .action(async (opts, cmd) => {
    const targetPath = cmd.parent?.opts().path ?? '.';
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };

    const filePath = path.resolve(targetPath, opts.file);
    if (!fs.existsSync(filePath)) {
      printError(`File not found: ${filePath}`, fmtOpts);
      process.exit(1);
    }

    const ext = path.extname(filePath);
    if (!/\.(ts|tsx|js|jsx)$/.test(ext)) {
      printError(`Unsupported file type: ${ext}. Currently supports .ts, .tsx, .js, .jsx`, fmtOpts);
      process.exit(1);
    }

    // Dynamic import to avoid loading parser at CLI startup
    const { TypeScriptParser } = await import('@omnigraph/parsers');
    const parser = new TypeScriptParser();
    const source = fs.readFileSync(filePath, 'utf-8');
    const result = parser.parse(filePath, source);
    const node = result.nodes?.[0];
    let methods = node?.methods ?? [];

    if (opts.exported) {
      methods = methods.filter(m => m.exported);
    }
    if (opts.kind) {
      methods = methods.filter(m => m.kind === opts.kind);
    }

    if (json) {
      printOutput(methods, fmtOpts);
      return;
    }

    if (methods.length === 0) {
      console.log(dim('No methods/functions found.'));
      return;
    }

    console.log(`\n${bold('FILE:')} ${green(path.relative(targetPath, filePath))}\n`);
    const rows = methods.map(m => ({
      exported: m.exported ? 'yes' : '',
      kind: m.kind,
      name: m.name,
      lines: `${m.line}-${m.endLine}`,
      params: m.params.join(', ') || '()',
    }));
    printOutput(rows, { json: false });
  });
