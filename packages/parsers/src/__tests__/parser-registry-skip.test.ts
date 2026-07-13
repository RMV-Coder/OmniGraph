import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDirectory, ALWAYS_SKIP } from '../parser-registry';

/**
 * Regression tests for directory skipping — motivated by a repo whose
 * `.claude/worktrees/` held a dozen+ full git-worktree checkouts, making
 * parseDirectory walk ~47x the real source. See ALWAYS_SKIP + the nested
 * git-boundary guard in parser-registry.ts.
 */
let tmp: string;

const ids = () => parseDirectory(tmp).nodes.map(n => n.id.replace(/\\/g, '/'));

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omnigraph-skip-'));
  const write = (rel: string, content: string) => {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  write('src/app.ts', 'export const app = 1;\n');            // real source
  write('.claude/worktrees/wt/leak.ts', 'export const a = 1;\n'); // agent worktree
  write('coverage/report.ts', 'export const c = 1;\n');      // build/test output
  write('out/bundle.ts', 'export const o = 1;\n');           // build output
  // A nested git boundary (worktree/submodule/clone): a dir with a .git entry
  write('vendorclone/.git', 'gitdir: /elsewhere\n');
  write('vendorclone/leak.ts', 'export const n = 1;\n');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('parseDirectory — directory skipping', () => {
  it('includes real source files', () => {
    expect(ids().some(id => id.endsWith('src/app.ts'))).toBe(true);
  });

  it('skips agent/build dirs listed in ALWAYS_SKIP (.claude, coverage, out)', () => {
    const all = ids();
    expect(all.some(id => id.includes('/.claude/'))).toBe(false);
    expect(all.some(id => id.includes('/coverage/'))).toBe(false);
    expect(all.some(id => id.includes('/out/'))).toBe(false);
  });

  it('skips nested git boundaries (worktrees, submodules, nested clones)', () => {
    expect(ids().some(id => id.includes('vendorclone'))).toBe(false);
  });

  it('exports ALWAYS_SKIP including agent and dependency dirs', () => {
    expect(ALWAYS_SKIP.has('.claude')).toBe(true);
    expect(ALWAYS_SKIP.has('node_modules')).toBe(true);
  });
});
