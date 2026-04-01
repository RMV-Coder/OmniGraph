/**
 * Shared output formatting for CLI commands.
 * Human-readable tables by default, JSON with --json flag.
 */

export interface FormatOptions {
  json: boolean;
}

/** Print structured data: JSON to stdout, or human-readable table */
export function printOutput(data: unknown, opts: FormatOptions): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (Array.isArray(data)) {
    printTable(data);
  } else {
    console.log(data);
  }
}

/** Print an array of objects as an aligned table */
export function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;

  const keys = Object.keys(rows[0]);
  const widths = new Map<string, number>();
  for (const k of keys) widths.set(k, k.length);
  for (const row of rows) {
    for (const k of keys) {
      const val = String(row[k] ?? '');
      const w = widths.get(k) ?? 0;
      if (val.length > w) widths.set(k, Math.min(val.length, 60));
    }
  }

  // Header
  const header = keys.map(k => k.toUpperCase().padEnd(widths.get(k)!)).join('  ');
  console.log(header);
  console.log(keys.map(k => '-'.repeat(widths.get(k)!)).join('  '));

  // Rows
  for (const row of rows) {
    const line = keys.map(k => {
      const val = String(row[k] ?? '');
      return val.length > 60 ? val.slice(0, 57) + '...' : val.padEnd(widths.get(k)!);
    }).join('  ');
    console.log(line);
  }
}

/** Print a tree structure with indentation */
export function printTree(
  lines: Array<{ depth: number; prefix: string; label: string; detail?: string }>,
): void {
  for (const line of lines) {
    const indent = '  '.repeat(line.depth);
    const detail = line.detail ? `  ${dim(line.detail)}` : '';
    console.log(`${indent}${line.prefix} ${line.label}${detail}`);
  }
}

/** Print error to stderr */
export function printError(message: string, opts: FormatOptions): void {
  if (opts.json) {
    process.stderr.write(JSON.stringify({ error: message }) + '\n');
  } else {
    console.error(`error: ${message}`);
  }
}

// ANSI helpers (only when stdout is a TTY)
const isTTY = process.stdout.isTTY;
export const bold = (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s;
export const dim = (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;
export const green = (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
export const yellow = (s: string) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
export const blue = (s: string) => isTTY ? `\x1b[34m${s}\x1b[0m` : s;
export const cyan = (s: string) => isTTY ? `\x1b[36m${s}\x1b[0m` : s;
