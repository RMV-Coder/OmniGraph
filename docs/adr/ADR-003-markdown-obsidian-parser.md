# ADR 003: Markdown/Obsidian Parser for Wiki-Link Graph

**Date:** March 2026
**Status:** Accepted

## Context

Users wanted to visualize Obsidian vaults and Markdown-heavy documentation alongside code. Obsidian uses wiki-link syntax (`[[Page]]`, `![[Embed]]`) to create a knowledge graph between `.md` files — the same graph concept OmniGraph already visualizes for code imports.

We needed to decide:
1. Whether to parse Markdown at all (it's not source code)
2. How to resolve wiki-links (Obsidian uses vault-wide shortest-path matching, not relative paths)
3. How to classify different Markdown node types

## Decision

Add a `MarkdownParser` implementing the existing `IParser` interface. It uses **regex-based parsing** (consistent with ADR-002) to extract wiki-links, embeds, standard markdown links, and YAML frontmatter metadata.

Wiki-link resolution uses **Obsidian-style vault-wide BFS search** — `[[Page]]` resolves to the first `.md` file matching `Page.md` found by breadth-first directory traversal from the project root. This matches Obsidian's "shortest path" behavior.

## Link Types Detected

| Syntax | Edge Label | Example |
|--------|-----------|---------|
| `[[Page]]` | `links to` | Wiki-link |
| `[[Page\|Alias]]` | `links to` | Aliased wiki-link |
| `[[Page#Heading]]` | `links to` | Section wiki-link |
| `![[Page]]` | `embeds` | Embed (non-image) |
| `[text](./path.md)` | `links to` | Standard markdown link |

Image embeds (`![[photo.png]]`) are skipped — they are assets, not document nodes.

## Node Classification

| Type | Criteria |
|------|----------|
| `markdown-moc` | File has 5+ outgoing wiki-links (Map of Content) |
| `markdown-daily` | Filename matches `YYYY-MM-DD` pattern |
| `markdown-readme` | Filename is `README.md` (case-insensitive) |
| `markdown-file` | Default for all other `.md`/`.mdx` files |

## Metadata Extracted

- **headings**: Up to 8 headings (H1–H6) stored in node metadata
- **tags**: From YAML frontmatter `tags:` field (inline array and list formats)
- **aliases**: From YAML frontmatter `aliases:` field

## Consequences

- **Positive:** Obsidian vaults render as connected knowledge graphs alongside code.
- **Positive:** Zero new dependencies — regex parsing, consistent with ADR-002.
- **Positive:** Wiki-link resolution uses BFS from root, matching Obsidian's behavior.
- **Positive:** Frontmatter metadata (tags, aliases) enrich the node inspector.
- **Negative:** Vault-wide BFS resolution scans the filesystem at parse time. For very large vaults (10k+ files), this could be slow. Caching is a future optimization.
- **Negative:** Ambiguous wiki-links (multiple files with the same basename in different folders) resolve to whichever BFS finds first, which may not always match Obsidian's exact resolution order.
