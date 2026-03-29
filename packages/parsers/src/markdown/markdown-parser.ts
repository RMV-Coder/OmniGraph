import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge } from '../types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Markdown / Obsidian parser — handles .md and .mdx files.
 *
 * Detects:
 * - Wiki-links: [[Page Name]], [[Page Name|Alias]], [[Page Name#Heading]]
 * - Embeds: ![[Page Name]], ![[image.png]]
 * - Standard markdown links: [text](./relative-path.md)
 * - YAML frontmatter tags and aliases
 * - Headings (stored as metadata)
 */

// ─── Regex Patterns ──────────────────────────────────────────────────

/** Wiki-link: [[Target]] or [[Target|Display]] or [[Target#Heading]] */
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;

/** Embed: ![[Target]] (images, notes, PDFs) */
const EMBED_LINK = /!\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;

/** Standard markdown link to a local file: [text](./path.md) or [text](path.md) */
const MD_LINK = /\[(?:[^\]]*)\]\((?!https?:\/\/|mailto:|#)([^)]+\.(?:md|mdx))\)/g;

/** YAML frontmatter block */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Heading: # Title, ## Subtitle, etc. */
const HEADING = /^(#{1,6})\s+(.+)$/gm;

/** YAML tags line: tags: [foo, bar] or tags:\n  - foo */
const YAML_TAGS_INLINE = /^tags:\s*\[([^\]]*)\]/m;
const YAML_TAGS_KEY = /^tags:\s*$/m;
const YAML_TAG_ITEM = /^\s+-\s+(.+)$/gm;

/** YAML aliases: aliases: [foo, bar] */
const YAML_ALIASES = /^aliases:\s*\[([^\]]*)\]/m;

// ─── File Types ──────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']);

// ─── Parser ──────────────────────────────────────────────────────────

export class MarkdownParser implements IParser {
  private rootDir: string = '';

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  canHandle(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.mdx';
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const nodes: OmniNode[] = [];
    const edges: OmniEdge[] = [];

    const fileId = filePath.replace(/\\/g, '/');
    const fileName = path.basename(filePath, path.extname(filePath));

    // ─── Parse frontmatter ───────────────────────────────────────
    const frontmatter = this.parseFrontmatter(source);

    // ─── Parse headings ──────────────────────────────────────────
    const headings: string[] = [];
    let headingMatch: RegExpExecArray | null;
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    while ((headingMatch = headingRegex.exec(source)) !== null) {
      headings.push(headingMatch[2].trim());
    }

    // ─── Determine node type ─────────────────────────────────────
    let nodeType = 'markdown-file';
    if (frontmatter.tags.some(t => t.toLowerCase() === 'moc' || t.toLowerCase() === 'index')) {
      nodeType = 'markdown-moc'; // Map of Content
    } else if (frontmatter.tags.some(t => t.toLowerCase() === 'daily' || t.toLowerCase() === 'journal')) {
      nodeType = 'markdown-daily';
    } else if (filePath.toLowerCase().includes('readme')) {
      nodeType = 'markdown-readme';
    }

    // ─── Build metadata ──────────────────────────────────────────
    const metadata: Record<string, string> = {
      filePath,
      language: 'markdown',
    };
    if (headings.length > 0) {
      metadata.headings = headings.slice(0, 8).join(', ');
    }
    if (frontmatter.tags.length > 0) {
      metadata.tags = frontmatter.tags.join(', ');
    }
    if (frontmatter.aliases.length > 0) {
      metadata.aliases = frontmatter.aliases.join(', ');
    }

    // ─── Create node ─────────────────────────────────────────────
    nodes.push({
      id: fileId,
      type: nodeType,
      label: fileName,
      metadata,
    });

    // ─── Extract wiki-links [[Target]] ───────────────────────────
    // Strip the frontmatter and code blocks before scanning links
    const body = this.stripFrontmatterAndCode(source);

    const linkedTargets = new Set<string>(); // deduplicate

    // Wiki-links
    let match: RegExpExecArray | null;
    const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;
    while ((match = wikiRegex.exec(body)) !== null) {
      const target = match[1].trim();
      if (!target) continue;
      // Skip images/media embeds
      const ext = path.extname(target).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) continue;

      const resolved = this.resolveWikiLink(filePath, target);
      if (resolved && !linkedTargets.has(resolved)) {
        linkedTargets.add(resolved);
        edges.push({
          id: `e-${fileId}->${resolved}`,
          source: fileId,
          target: resolved,
          label: 'links to',
        });
      }
    }

    // Embeds ![[Target]] (non-image)
    const embedRegex = /!\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;
    while ((match = embedRegex.exec(body)) !== null) {
      const target = match[1].trim();
      if (!target) continue;
      const ext = path.extname(target).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) continue;

      const resolved = this.resolveWikiLink(filePath, target);
      if (resolved && !linkedTargets.has(resolved)) {
        linkedTargets.add(resolved);
        edges.push({
          id: `e-${fileId}->embed-${resolved}`,
          source: fileId,
          target: resolved,
          label: 'embeds',
        });
      }
    }

    // Standard markdown links [text](path.md)
    const mdLinkRegex = /\[(?:[^\]]*)\]\((?!https?:\/\/|mailto:|#)([^)]+\.(?:md|mdx))\)/g;
    while ((match = mdLinkRegex.exec(body)) !== null) {
      const linkPath = match[1].trim();
      if (!linkPath) continue;

      const resolved = this.resolveRelativeLink(filePath, linkPath);
      if (resolved && !linkedTargets.has(resolved)) {
        linkedTargets.add(resolved);
        edges.push({
          id: `e-${fileId}->${resolved}`,
          source: fileId,
          target: resolved,
          label: 'links to',
        });
      }
    }

    return { nodes, edges };
  }

  // ─── Frontmatter Parsing ─────────────────────────────────────────

  private parseFrontmatter(source: string): { tags: string[]; aliases: string[] } {
    const tags: string[] = [];
    const aliases: string[] = [];

    const fmMatch = FRONTMATTER.exec(source);
    if (!fmMatch) return { tags, aliases };

    const fmBlock = fmMatch[1];

    // Tags: inline array format
    const tagsInline = YAML_TAGS_INLINE.exec(fmBlock);
    if (tagsInline) {
      tags.push(
        ...tagsInline[1]
          .split(',')
          .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean),
      );
    } else if (YAML_TAGS_KEY.test(fmBlock)) {
      // Tags: list format
      let itemMatch: RegExpExecArray | null;
      const itemRegex = /^\s+-\s+(.+)$/gm;
      // Extract the section after "tags:" until the next key
      const tagsSection = fmBlock.slice(fmBlock.indexOf('tags:'));
      while ((itemMatch = itemRegex.exec(tagsSection)) !== null) {
        tags.push(itemMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }

    // Aliases
    const aliasMatch = YAML_ALIASES.exec(fmBlock);
    if (aliasMatch) {
      aliases.push(
        ...aliasMatch[1]
          .split(',')
          .map(a => a.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean),
      );
    }

    return { tags, aliases };
  }

  // ─── Link Resolution ─────────────────────────────────────────────

  /**
   * Resolve an Obsidian wiki-link target to a file path.
   * Obsidian uses "shortest path when possible" — [[Page]] matches
   * any file named Page.md anywhere in the vault.
   */
  private resolveWikiLink(fromFile: string, target: string): string | null {
    const dir = path.dirname(fromFile);

    // If target already has an extension, resolve directly
    if (path.extname(target)) {
      return this.tryResolve(dir, target);
    }

    // Try with .md / .mdx extensions
    const resolved =
      this.tryResolve(dir, target + '.md') ??
      this.tryResolve(dir, target + '.mdx');
    if (resolved) return resolved;

    // Obsidian-style: search the entire vault (rootDir) for a matching filename
    if (this.rootDir) {
      const found = this.findFileInVault(target);
      if (found) return found;
    }

    // Return an unresolved ID so it can appear as a ghost node
    // (same as Obsidian's behavior with unresolved links)
    return null;
  }

  /** Resolve a standard relative markdown link */
  private resolveRelativeLink(fromFile: string, linkPath: string): string | null {
    const dir = path.dirname(fromFile);
    const candidate = path.resolve(dir, linkPath);
    if (fs.existsSync(candidate)) {
      return candidate.replace(/\\/g, '/');
    }
    return null;
  }

  /** Try resolving a path relative to the current directory or as absolute */
  private tryResolve(dir: string, target: string): string | null {
    // Try as relative to the file's directory
    const relative = path.resolve(dir, target);
    if (fs.existsSync(relative)) {
      return relative.replace(/\\/g, '/');
    }

    // Try as relative to root
    if (this.rootDir) {
      const fromRoot = path.resolve(this.rootDir, target);
      if (fs.existsSync(fromRoot)) {
        return fromRoot.replace(/\\/g, '/');
      }
    }

    return null;
  }

  /**
   * Search the vault (rootDir) recursively for a file matching the target name.
   * This implements Obsidian's "shortest path" resolution for [[Page]] links.
   */
  private findFileInVault(target: string): string | null {
    if (!this.rootDir) return null;

    const targetLower = target.toLowerCase();
    const extensions = ['.md', '.mdx'];

    // BFS to find the file — prefer shallower matches (closer to root)
    const queue: string[] = [this.rootDir];
    const skip = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.obsidian']);

    while (queue.length > 0) {
      const dir = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) {
            queue.push(path.join(dir, entry.name));
          }
        } else if (entry.isFile()) {
          const name = path.basename(entry.name, path.extname(entry.name));
          const ext = path.extname(entry.name).toLowerCase();
          if (name.toLowerCase() === targetLower && extensions.includes(ext)) {
            return path.join(dir, entry.name).replace(/\\/g, '/');
          }
        }
      }
    }

    return null;
  }

  /** Strip frontmatter and fenced code blocks so link regexes don't match inside them */
  private stripFrontmatterAndCode(source: string): string {
    // Remove frontmatter
    let body = source.replace(FRONTMATTER, '');
    // Remove fenced code blocks (```...```)
    body = body.replace(/```[\s\S]*?```/g, '');
    // Remove inline code (`...`)
    body = body.replace(/`[^`]*`/g, '');
    return body;
  }
}
