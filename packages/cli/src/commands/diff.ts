import { Command } from 'commander';
import path from 'path';
import { execSync } from 'child_process';
import { loadGraph } from '../lib/graph-loader';
import { printOutput, printError, bold, dim, green, cyan, yellow } from '../lib/format';
import type { OmniGraph, OmniNode, OmniEdge } from '@omnigraph/types';

/**
 * `omnigraph diff` — Diff View / PR Impact Graph (F50)
 *
 * Given a git ref (default: HEAD), identifies changed files and maps them
 * to graph nodes, then computes the blast radius — all transitively
 * affected files that depend on the changed ones.
 */

/** Get changed files from git diff between two refs */
function getChangedFiles(repoPath: string, base: string, head: string): string[] {
  try {
    const output = execSync(
      `git diff --name-only --diff-filter=ACMRD "${base}" "${head}"`,
      { cwd: repoPath, encoding: 'utf-8', timeout: 30_000 },
    );
    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/** Get changed files between working tree and HEAD (uncommitted changes) */
function getUncommittedChanges(repoPath: string): string[] {
  try {
    // Staged + unstaged changes
    const staged = execSync('git diff --name-only --cached', {
      cwd: repoPath, encoding: 'utf-8', timeout: 30_000,
    }).split('\n').map(f => f.trim()).filter(f => f.length > 0);

    const unstaged = execSync('git diff --name-only', {
      cwd: repoPath, encoding: 'utf-8', timeout: 30_000,
    }).split('\n').map(f => f.trim()).filter(f => f.length > 0);

    // Untracked files
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: repoPath, encoding: 'utf-8', timeout: 30_000,
    }).split('\n').map(f => f.trim()).filter(f => f.length > 0);

    return [...new Set([...staged, ...unstaged, ...untracked])];
  } catch {
    return [];
  }
}

/** Compute blast radius: find all nodes transitively affected by changes */
function computeBlastRadius(
  graph: OmniGraph,
  changedNodeIds: Set<string>,
  maxDepth: number,
): { affected: Set<string>; depth: Map<string, number> } {
  // Build reverse adjacency: for each node, who imports/depends on it?
  const reverseDeps = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!reverseDeps.has(edge.target)) reverseDeps.set(edge.target, new Set());
    reverseDeps.get(edge.target)!.add(edge.source);
  }

  const affected = new Set<string>();
  const depthMap = new Map<string, number>();
  const queue: { id: string; depth: number }[] = [];

  // Seed with changed nodes
  for (const id of changedNodeIds) {
    queue.push({ id, depth: 0 });
    depthMap.set(id, 0);
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth > 0) affected.add(id); // Don't count the changed file itself

    if (depth >= maxDepth) continue;

    const rdeps = reverseDeps.get(id);
    if (!rdeps) continue;

    for (const rdep of rdeps) {
      if (!depthMap.has(rdep)) {
        depthMap.set(rdep, depth + 1);
        queue.push({ id: rdep, depth: depth + 1 });
      }
    }
  }

  return { affected, depth: depthMap };
}

export const diffCommand = new Command('diff')
  .description('Show changed files and their blast radius in the dependency graph')
  .option('--base <ref>', 'Base git ref to diff from (default: HEAD~1 or main)')
  .option('--head <ref>', 'Head git ref to diff to (default: HEAD)')
  .option('--uncommitted', 'Analyze uncommitted changes (working tree vs HEAD)')
  .option('--depth <n>', 'Max depth for blast radius traversal', '3')
  .option('--blast-only', 'Only show the blast radius (affected files), not the changed files')
  .action((opts, cmd) => {
    const targetPath = path.resolve(cmd.parent?.opts().path ?? '.');
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };
    const maxDepth = parseInt(opts.depth, 10) || 3;

    // Load graph
    let graph: OmniGraph;
    try {
      graph = loadGraph(targetPath, json);
    } catch (err) {
      printError(String(err), fmtOpts);
      process.exit(2);
    }

    // Get changed files
    let changedFiles: string[];
    if (opts.uncommitted) {
      changedFiles = getUncommittedChanges(targetPath);
    } else {
      const base = opts.base ?? detectDefaultBase(targetPath);
      const head = opts.head ?? 'HEAD';
      changedFiles = getChangedFiles(targetPath, base, head);
    }

    if (changedFiles.length === 0) {
      if (json) {
        printOutput({ changed: [], blastRadius: [], stats: { changed: 0, affected: 0 } }, fmtOpts);
      } else {
        console.log(dim('No changed files detected.'));
      }
      return;
    }

    // Map changed files to graph node IDs
    const nodeIdSet = new Set(graph.nodes.map(n => n.id));
    const nodeByLabel = new Map<string, OmniNode>();
    for (const n of graph.nodes) nodeByLabel.set(n.label, n);

    const changedNodeIds = new Set<string>();
    const changedNodes: OmniNode[] = [];
    const unmatchedFiles: string[] = [];

    for (const file of changedFiles) {
      const absPath = path.resolve(targetPath, file).replace(/\\/g, '/');
      // Try exact ID match
      if (nodeIdSet.has(absPath)) {
        changedNodeIds.add(absPath);
        const node = graph.nodes.find(n => n.id === absPath);
        if (node) changedNodes.push(node);
      } else {
        // Try label match (filename without extension)
        const label = path.basename(file).replace(/\.[^.]+$/, '');
        const node = nodeByLabel.get(label);
        if (node) {
          changedNodeIds.add(node.id);
          changedNodes.push(node);
        } else {
          unmatchedFiles.push(file);
        }
      }
    }

    // Compute blast radius
    const { affected, depth: depthMap } = computeBlastRadius(graph, changedNodeIds, maxDepth);

    const affectedNodes = graph.nodes
      .filter(n => affected.has(n.id))
      .map(n => ({
        ...n,
        blastDepth: depthMap.get(n.id) ?? 0,
      }))
      .sort((a, b) => a.blastDepth - b.blastDepth);

    if (json) {
      printOutput({
        changed: changedNodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
        blastRadius: affectedNodes.map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
          depth: n.blastDepth,
        })),
        unmatchedFiles,
        stats: {
          changedFiles: changedFiles.length,
          matchedNodes: changedNodes.length,
          affectedNodes: affectedNodes.length,
          totalImpact: changedNodes.length + affectedNodes.length,
        },
      }, fmtOpts);
      return;
    }

    // Human-readable output
    if (!opts.blastOnly) {
      console.log(`\n${bold('Changed Files')} (${changedNodes.length} matched, ${unmatchedFiles.length} unmatched):\n`);
      for (const n of changedNodes) {
        console.log(`  ${green('\u25CF')} ${n.label} ${dim(`(${n.type})`)}`);
      }
      if (unmatchedFiles.length > 0) {
        console.log(`\n  ${dim('Unmatched (not in graph):')}`);
        for (const f of unmatchedFiles.slice(0, 10)) {
          console.log(`  ${dim('\u25CB')} ${dim(f)}`);
        }
        if (unmatchedFiles.length > 10) {
          console.log(`  ${dim(`... and ${unmatchedFiles.length - 10} more`)}`);
        }
      }
    }

    if (affectedNodes.length === 0) {
      console.log(`\n${dim('No downstream dependencies affected.')}\n`);
      return;
    }

    console.log(`\n${bold('Blast Radius')} (${affectedNodes.length} affected files):\n`);
    for (const n of affectedNodes) {
      const indent = '  '.repeat(n.blastDepth);
      const depthLabel = dim(`[depth ${n.blastDepth}]`);
      console.log(`  ${indent}${yellow('\u26A0')} ${n.label} ${dim(`(${n.type})`)} ${depthLabel}`);
    }

    console.log(`\n${bold('Impact Summary:')}`);
    console.log(`  Changed:  ${green(String(changedNodes.length))} files`);
    console.log(`  Affected: ${yellow(String(affectedNodes.length))} files`);
    console.log(`  Total:    ${cyan(String(changedNodes.length + affectedNodes.length))} files in blast radius\n`);
  });

/** Try to detect a sensible default base ref */
function detectDefaultBase(repoPath: string): string {
  // Try common base branches
  for (const ref of ['main', 'master', 'develop']) {
    try {
      execSync(`git rev-parse --verify ${ref}`, { cwd: repoPath, stdio: 'pipe' });
      // If we're ON this branch, diff against HEAD~1
      const current = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath, encoding: 'utf-8',
      }).trim();
      if (current === ref) return 'HEAD~1';
      return ref;
    } catch { /* ref doesn't exist */ }
  }
  return 'HEAD~1';
}
