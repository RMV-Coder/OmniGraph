import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateFeatureDocs } from '@omnigraph/parsers';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printError, bold, green, dim } from '../lib/format';
import type { OmniGraph } from '@omnigraph/types';

export const docsCommand = new Command('docs')
  .description('Generate per-feature Markdown + Mermaid docs from the graph')
  .option('--out <dir>', 'Output directory (default: <path>/omnigraph-docs)')
  .action((opts, cmd) => {
    const targetPath = cmd.parent?.opts().path ?? '.';
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };

    let graph: OmniGraph;
    try {
      graph = loadGraph(targetPath, json);
    } catch (err) {
      printError(String(err), fmtOpts);
      process.exit(2);
    }

    const outDir = path.resolve(opts.out || path.join(path.resolve(targetPath), 'omnigraph-docs'));
    const files = generateFeatureDocs(graph);

    for (const f of files) {
      const full = path.join(outDir, f.path);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.content, 'utf-8');
    }

    if (json) {
      printOutput({ out: outDir, files: files.map(f => f.path) }, fmtOpts);
      return;
    }

    console.log(`${green('✓')} Wrote ${bold(String(files.length))} files to ${outDir}`);
    for (const f of files) console.log(`  ${dim(f.path)}`);
    console.log(`\nOpen ${bold('README.md')} for the feature map.`);
  });
