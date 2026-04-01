import { Command } from 'commander';
import path from 'path';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printTree, printError, bold, dim, green } from '../lib/format';
import type { OmniGraph, OmniNode, OmniEdge } from '@omnigraph/types';

export const graphCommand = new Command('graph')
  .description('Query the dependency graph (nodes, edges, deps)')
  .option('--node <id>', 'Show a specific node and its connections')
  .option('--deps <id>', 'Show transitive dependencies of a node')
  .option('--rdeps <id>', 'Show reverse dependencies (what imports this node)')
  .option('--filter <type>', 'Filter nodes by type (e.g. nextjs-api-route)')
  .option('--edges', 'List all edges instead of nodes')
  .option('--depth <n>', 'Max depth for --deps/--rdeps traversal', '3')
  .option('--stats', 'Show summary statistics only')
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

    // Stats mode
    if (opts.stats) {
      const typeCount = new Map<string, number>();
      for (const n of graph.nodes) {
        typeCount.set(n.type, (typeCount.get(n.type) ?? 0) + 1);
      }
      const stats = {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        types: Object.fromEntries(Array.from(typeCount.entries()).sort((a, b) => b[1] - a[1])),
      };
      if (json) {
        printOutput(stats, fmtOpts);
        return;
      }
      {
        console.log(`${bold('Nodes:')} ${stats.nodes}`);
        console.log(`${bold('Edges:')} ${stats.edges}`);
        console.log(`${bold('Types:')}`);
        for (const [type, count] of Object.entries(stats.types)) {
          console.log(`  ${type.padEnd(30)} ${count}`);
        }
      }
      return;
    }

    // Single node lookup
    if (opts.node) {
      const node = findNode(graph, opts.node);
      if (!node) {
        printError(`Node not found: ${opts.node}`, fmtOpts);
        process.exit(1);
      }
      const incoming = graph.edges.filter(e => e.target === node.id);
      const outgoing = graph.edges.filter(e => e.source === node.id);
      if (json) {
        printOutput({ node, incoming, outgoing }, fmtOpts);
      } else {
        console.log(`${bold(node.label)} ${dim(`(${node.type})`)}`);
        console.log(`ID: ${node.id}`);
        for (const [k, v] of Object.entries(node.metadata)) {
          if (v) console.log(`${k}: ${v}`);
        }
        if (incoming.length > 0) {
          console.log(`\n${bold('Imported by')} (${incoming.length}):`);
          for (const e of incoming) console.log(`  ${dim(e.label)} <- ${e.source}`);
        }
        if (outgoing.length > 0) {
          console.log(`\n${bold('Imports')} (${outgoing.length}):`);
          for (const e of outgoing) console.log(`  ${dim(e.label)} -> ${e.target}`);
        }
      }
      return;
    }

    // Dependency traversal
    if (opts.deps || opts.rdeps) {
      const nodeId = opts.deps ?? opts.rdeps;
      const reverse = !!opts.rdeps;
      const maxDepth = parseInt(opts.depth, 10);
      const root = findNode(graph, nodeId);
      if (!root) {
        printError(`Node not found: ${nodeId}`, fmtOpts);
        process.exit(1);
      }
      const tree = walkDeps(graph, root.id, reverse, maxDepth);
      if (json) {
        printOutput(tree, fmtOpts);
      } else {
        console.log(`${bold(reverse ? 'Reverse dependencies' : 'Dependencies')} of ${green(root.label)} ${dim(`(depth ${maxDepth})`)}\n`);
        const lines = flattenTree(tree, 0);
        printTree(lines);
      }
      return;
    }

    // List edges
    if (opts.edges) {
      if (json) {
        printOutput(graph.edges, fmtOpts);
      } else {
        const rows = graph.edges.map(e => ({
          source: shortId(e.source),
          label: e.label,
          target: shortId(e.target),
        }));
        printOutput(rows, fmtOpts);
      }
      return;
    }

    // Default: list nodes (optionally filtered)
    let nodes = graph.nodes;
    if (opts.filter) {
      nodes = nodes.filter(n => n.type === opts.filter);
    }

    if (json) {
      printOutput(nodes, fmtOpts);
    } else {
      const rows = nodes.map(n => ({
        type: n.type,
        label: n.label,
        route: n.metadata.route ?? '',
        file: shortId(n.id),
      }));
      printOutput(rows, fmtOpts);
    }
  });

// ─── Helpers ──────────────────────────────────────────────────────

function findNode(graph: OmniGraph, query: string): OmniNode | undefined {
  const q = query.replace(/\\/g, '/');
  return graph.nodes.find(n =>
    n.id === q ||
    n.id.endsWith(q) ||
    n.id.endsWith('/' + q) ||
    n.label === query,
  );
}

function shortId(id: string): string {
  // Shorten long paths: keep last 3 segments
  const parts = id.split('/');
  return parts.length > 3 ? '.../' + parts.slice(-3).join('/') : id;
}

interface DepTree {
  nodeId: string;
  label: string;
  type: string;
  edgeLabel: string;
  children: DepTree[];
}

function walkDeps(
  graph: OmniGraph,
  rootId: string,
  reverse: boolean,
  maxDepth: number,
): DepTree {
  const root = graph.nodes.find(n => n.id === rootId)!;
  const visited = new Set<string>();

  function walk(nodeId: string, depth: number): DepTree {
    const node = graph.nodes.find(n => n.id === nodeId);
    const tree: DepTree = {
      nodeId,
      label: node?.label ?? nodeId,
      type: node?.type ?? 'unknown',
      edgeLabel: '',
      children: [],
    };
    if (depth >= maxDepth || visited.has(nodeId)) return tree;
    visited.add(nodeId);

    const edges = reverse
      ? graph.edges.filter(e => e.target === nodeId)
      : graph.edges.filter(e => e.source === nodeId);

    for (const e of edges) {
      const childId = reverse ? e.source : e.target;
      const child = walk(childId, depth + 1);
      child.edgeLabel = e.label;
      tree.children.push(child);
    }
    return tree;
  }

  return walk(rootId, 0);
}

function flattenTree(
  tree: DepTree,
  depth: number,
): Array<{ depth: number; prefix: string; label: string; detail?: string }> {
  const result: Array<{ depth: number; prefix: string; label: string; detail?: string }> = [];
  const prefix = depth === 0 ? '' : `${dim(tree.edgeLabel)} ->`;
  result.push({
    depth,
    prefix,
    label: tree.label,
    detail: `(${tree.type})`,
  });
  for (const child of tree.children) {
    result.push(...flattenTree(child, depth + 1));
  }
  return result;
}
