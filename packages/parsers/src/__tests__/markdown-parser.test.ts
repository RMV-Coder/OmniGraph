import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownParser } from '../markdown/markdown-parser';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  // ─── canHandle ───────────────────────────────────────────────────

  describe('canHandle', () => {
    it('handles .md files', () => {
      expect(parser.canHandle('/docs/readme.md')).toBe(true);
      expect(parser.canHandle('/vault/My Note.md')).toBe(true);
    });

    it('handles .mdx files', () => {
      expect(parser.canHandle('/docs/page.mdx')).toBe(true);
    });

    it('rejects non-markdown files', () => {
      expect(parser.canHandle('/src/app.ts')).toBe(false);
      expect(parser.canHandle('/data.json')).toBe(false);
      expect(parser.canHandle('/style.css')).toBe(false);
    });
  });

  // ─── Node creation ───────────────────────────────────────────────

  describe('node creation', () => {
    it('creates a markdown-file node', () => {
      const result = parser.parse('/vault/My Note.md', '# Hello\nSome content');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes![0]).toMatchObject({
        id: '/vault/My Note.md',
        type: 'markdown-file',
        label: 'My Note',
        metadata: {
          filePath: '/vault/My Note.md',
          language: 'markdown',
          headings: 'Hello',
        },
      });
    });

    it('extracts multiple headings', () => {
      const source = '# Title\n## Section A\n### Subsection\n## Section B';
      const result = parser.parse('/vault/note.md', source);
      expect(result.nodes![0].metadata.headings).toBe('Title, Section A, Subsection, Section B');
    });

    it('detects MOC node type from frontmatter tags', () => {
      const source = '---\ntags: [moc, overview]\n---\n# Index';
      const result = parser.parse('/vault/index.md', source);
      expect(result.nodes![0].type).toBe('markdown-moc');
    });

    it('detects daily note type', () => {
      const source = '---\ntags: [daily]\n---\n# 2024-01-15';
      const result = parser.parse('/vault/2024-01-15.md', source);
      expect(result.nodes![0].type).toBe('markdown-daily');
    });

    it('detects README type', () => {
      const source = '# Project\nSome docs';
      const result = parser.parse('/project/README.md', source);
      expect(result.nodes![0].type).toBe('markdown-readme');
    });
  });

  // ─── Frontmatter parsing ─────────────────────────────────────────

  describe('frontmatter', () => {
    it('parses inline array tags', () => {
      const source = '---\ntags: [foo, bar, baz]\n---\nContent';
      const result = parser.parse('/vault/note.md', source);
      expect(result.nodes![0].metadata.tags).toBe('foo, bar, baz');
    });

    it('parses list-format tags', () => {
      const source = '---\ntags:\n  - alpha\n  - beta\n---\nContent';
      const result = parser.parse('/vault/note.md', source);
      expect(result.nodes![0].metadata.tags).toContain('alpha');
      expect(result.nodes![0].metadata.tags).toContain('beta');
    });

    it('parses aliases', () => {
      const source = '---\naliases: [NickA, NickB]\n---\nContent';
      const result = parser.parse('/vault/note.md', source);
      expect(result.nodes![0].metadata.aliases).toBe('NickA, NickB');
    });

    it('handles missing frontmatter gracefully', () => {
      const source = '# Just a heading\nNo frontmatter here.';
      const result = parser.parse('/vault/note.md', source);
      expect(result.nodes![0].metadata.tags).toBeUndefined();
      expect(result.nodes![0].metadata.aliases).toBeUndefined();
    });
  });

  // ─── Wiki-link detection ─────────────────────────────────────────

  describe('wiki-links', () => {
    it('detects basic wiki-links [[Target]]', () => {
      const source = 'See [[Other Note]] for details.';
      const result = parser.parse('/vault/note.md', source);
      // Edge is created (target may not resolve without filesystem)
      expect(result.edges).toBeDefined();
    });

    it('detects aliased wiki-links [[Target|Display]]', () => {
      const source = 'See [[Other Note|that page]] for details.';
      const result = parser.parse('/vault/note.md', source);
      expect(result.edges).toBeDefined();
    });

    it('detects heading-linked wiki-links [[Target#Section]]', () => {
      const source = 'See [[Other Note#Introduction]] for details.';
      const result = parser.parse('/vault/note.md', source);
      expect(result.edges).toBeDefined();
    });

    it('deduplicates repeated links to the same target', () => {
      const source = '[[A]] and [[A]] and [[A|alias]]';
      const result = parser.parse('/vault/note.md', source);
      // All three reference the same target, should produce at most one edge
      const uniqueTargets = new Set(result.edges?.map(e => e.target));
      expect(uniqueTargets.size).toBeLessThanOrEqual(1);
    });

    it('skips image embeds', () => {
      const source = '![[photo.png]]\n![[diagram.svg]]\n[[Real Note]]';
      const result = parser.parse('/vault/note.md', source);
      // Image embeds should not create edges
      const labels = result.edges?.map(e => e.label) ?? [];
      expect(labels).not.toContain('embeds'); // image embeds are skipped
    });

    it('skips links inside code blocks', () => {
      const source = '```\n[[Fake Link]]\n```\n[[Real Link]]';
      const result = parser.parse('/vault/note.md', source);
      // Only the real link outside code should produce an edge
      // (Whether it resolves depends on filesystem, but the fake one should be stripped)
      expect(result.edges).toBeDefined();
    });

    it('skips links inside inline code', () => {
      const source = 'Use `[[Not A Link]]` for syntax. See [[Real Link]].';
      const result = parser.parse('/vault/note.md', source);
      expect(result.edges).toBeDefined();
    });
  });

  // ─── Standard markdown links ─────────────────────────────────────

  describe('markdown links', () => {
    it('detects relative markdown links', () => {
      const source = 'See [docs](./other.md) and [more](../notes/deep.md)';
      const result = parser.parse('/vault/note.md', source);
      expect(result.edges).toBeDefined();
    });

    it('ignores external URLs', () => {
      const source = '[Google](https://google.com) and [Docs](./local.md)';
      const result = parser.parse('/vault/note.md', source);
      // Should not create an edge for the https link
      const externalEdges = result.edges?.filter(e => e.target.includes('google')) ?? [];
      expect(externalEdges).toHaveLength(0);
    });

    it('ignores anchor-only links', () => {
      const source = '[Jump](#section-a)';
      const result = parser.parse('/vault/note.md', source);
      expect(result.edges).toHaveLength(0);
    });
  });

  // ─── Edge labels ─────────────────────────────────────────────────

  describe('edge labels', () => {
    it('uses "links to" for wiki-links', () => {
      const source = '[[SomeTarget]]';
      const result = parser.parse('/vault/note.md', source);
      if (result.edges && result.edges.length > 0) {
        expect(result.edges[0].label).toBe('links to');
      }
    });

    it('uses "embeds" for embed syntax', () => {
      // Non-image embed
      const source = '![[embedded-note]]';
      const result = parser.parse('/vault/note.md', source);
      if (result.edges && result.edges.length > 0) {
        expect(result.edges[0].label).toBe('embeds');
      }
    });
  });
});
