import { Command } from 'commander';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printError, bold, dim, green, yellow, blue, cyan } from '../lib/format';
import type { OmniGraph, OmniEdge, FlowStepType } from '@omnigraph/types';

const STEP_SYMBOLS: Record<string, string> = {
  caller: '[caller]',
  'http-call': '[http-call]',
  'route-handler': '[route]',
  'db-query': '[db-query]',
  'db-join': '[db-join]',
  'db-result': '[db-result]',
  dependency: '[dep]',
};

const STEP_COLORS: Record<string, (s: string) => string> = {
  caller: blue,
  'http-call': yellow,
  'route-handler': green,
  'db-query': cyan,
  'db-join': cyan,
  'db-result': green,
  dependency: dim,
};

interface TraceStep {
  step: number;
  type: FlowStepType;
  nodeId: string;
  label: string;
  description: string;
  edgeLabel?: string;
}

export const traceCommand = new Command('trace')
  .description('Trace data flow from a component through API to database')
  .requiredOption('--from <file>', 'Starting file or node ID')
  .option('--depth <n>', 'Max traversal depth', '5')
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

    const fromQuery = opts.from.replace(/\\/g, '/');
    const startNode = graph.nodes.find(n =>
      n.id === fromQuery ||
      n.id.endsWith(fromQuery) ||
      n.id.endsWith('/' + fromQuery) ||
      n.label === opts.from,
    );

    if (!startNode) {
      printError(`Node not found: ${opts.from}`, fmtOpts);
      process.exit(1);
    }

    const maxDepth = parseInt(opts.depth, 10);
    const steps = buildTrace(graph, startNode.id, maxDepth);

    if (json) {
      printOutput(steps, fmtOpts);
      return;
    }

    // Human-readable trace output
    console.log(`\n${bold('TRACE:')} ${green(startNode.label)} ${dim(`(${startNode.type})`)}\n`);

    for (const step of steps) {
      const colorFn = STEP_COLORS[step.type] ?? dim;
      const symbol = STEP_SYMBOLS[step.type] ?? `[${step.type}]`;
      const stepNum = String(step.step).padStart(2);
      console.log(`${stepNum}. ${colorFn(symbol.padEnd(14))} ${bold(step.label)}`);
      console.log(`    ${dim(step.description)}`);
      if (step.edgeLabel) {
        console.log(`    ${dim('via:')} ${step.edgeLabel}`);
      }
      console.log();
    }

    if (steps.length === 0) {
      console.log(dim('  No outgoing connections found from this node.\n'));
    }
  });

// ─── Trace Builder ──────────────────────────────────────────────

function buildTrace(
  graph: OmniGraph,
  startId: string,
  maxDepth: number,
): TraceStep[] {
  const steps: TraceStep[] = [];
  const visited = new Set<string>();
  let stepNum = 1;

  // Build edge index
  const outgoing = new Map<string, OmniEdge[]>();
  for (const e of graph.edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  function walk(nodeId: string, depth: number): void {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Classify the step type
    let type: FlowStepType = 'dependency';
    if (depth === 0) type = 'caller';
    else if (isRouteType(node.type)) type = 'route-handler';
    else if (node.id.startsWith('db://')) type = 'db-query';

    const description = buildDescription(node, type);

    steps.push({
      step: stepNum++,
      type,
      nodeId: node.id,
      label: node.label,
      description,
    });

    // Follow edges, prioritizing HTTP > DB > imports
    const edges = outgoing.get(nodeId) ?? [];
    const sorted = [...edges].sort((a, b) => edgePriority(a) - edgePriority(b));

    for (const edge of sorted) {
      if (visited.has(edge.target)) continue;

      // Determine edge step type
      let edgeType: FlowStepType = 'dependency';
      if (edge.id.startsWith('e-http-')) edgeType = 'http-call';
      else if (edge.id.startsWith('e-db-')) edgeType = 'db-query';
      else if (edge.id.startsWith('e-fk-')) edgeType = 'db-join';

      // Insert an HTTP call step if crossing networks
      if (edgeType === 'http-call') {
        steps.push({
          step: stepNum++,
          type: 'http-call',
          nodeId: node.id,
          label: edge.label,
          description: `HTTP call from ${node.label}`,
          edgeLabel: edge.label,
        });
      }

      walk(edge.target, depth + 1);
    }
  }

  walk(startId, 0);
  return steps;
}

function isRouteType(type: string): boolean {
  return [
    'nextjs-api-route', 'nestjs-controller', 'python-fastapi-route',
    'python-django-view', 'php-laravel-controller', 'php-laravel-route',
  ].includes(type);
}

function buildDescription(node: { type: string; metadata: Record<string, string>; label: string }, type: FlowStepType): string {
  if (type === 'route-handler') {
    return `Handles ${node.metadata.route || 'request'}`;
  }
  if (type === 'db-query') {
    return `Queries ${node.label}`;
  }
  const fp = node.metadata.filePath ?? node.label;
  return fp;
}

function edgePriority(e: OmniEdge): number {
  if (e.id.startsWith('e-http-')) return 0;
  if (e.id.startsWith('e-db-')) return 1;
  if (e.id.startsWith('e-fk-')) return 2;
  return 3;
}
