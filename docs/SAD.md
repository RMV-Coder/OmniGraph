# Software Architecture Document (SAD)

**Project:** OmniGraph
**Version:** 4.0.0
**Date:** April 2026

## 1. Architecture Overview

OmniGraph uses a **Local Client-Server Architecture** delivered via a CLI tool. The user points the CLI at a local repository, the backend parses the filesystem into a graph data structure, and the frontend renders it interactively.

```
┌─────────────────────────────────────────────────────────────────┐
│  User's Terminal                                                │
│  $ omnigraph --path ../my-project                               │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐     │
│  │   CLI    │───>│    Server    │───>│     Parsers        │     │
│  │ Commander│    │   Express    │    │  parser-registry   │     │
│  └──────────┘    │              │    │   ┌──────────────┐ │     │
│                  │  /api/graph  │<───│   │ TypeScript   │ │     │
│                  │  GET * (SPA) │    │   │   Parser     │ │     │
│                  └──────┬───────┘    │   ├──────────────┤ │     │
│                         │           │   │   Python     │ │     │
│                         │           │   │   Parser     │ │     │
│                         │           │   ├──────────────┤ │     │
│                         │           │   │    PHP       │ │     │
│                         │           │   │   Parser     │ │     │
│                         │           │   └──────────────┘ │     │
│                         │           └────────────────────┘     │
│                         │                                       │
│                  ┌──────▼───────┐                                │
│                  │     UI       │   User's Browser               │
│                  │  React Flow  │   http://localhost:4000        │
│                  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Package Structure

The project is an **npm workspaces monorepo** with five packages:

```
packages/
├── types/     @omnigraph/types      → Shared interfaces (OmniNode, OmniEdge, OmniGraph)
├── cli/       @omnigraph/cli        → Multi-command CLI (graph, trace, fetch, methods, schema, serve)
├── server/    @omnigraph/server     → Express HTTP server
├── parsers/   @omnigraph/parsers    → AST parsing engine (pluggable)
└── ui/        @omnigraph/ui         → React SPA (built as static files)
```

**Dependency direction:** `cli → server → parsers → types`. UI depends on `types` at build time. The UI is served as pre-built static files by the server; there is no runtime dependency from server to UI code.

**Build order matters:** `types` must build first (other packages depend on its type declarations), then `parsers`, then `server`/`cli`, then `ui`.

## 3. Data Flow

```
Filesystem (target repo)
    │
    ▼
parser-registry.ts ── walks directories recursively
    │                  respects .gitignore
    │                  skips: node_modules, .git, dist, .next, build
    │
    ▼
IParser.canHandle(filePath) ── selects correct parser per file extension
    │                          TypeScript (.ts/.tsx/.js/.jsx)
    │                          Python (.py)
    │                          PHP (.php)
    │
    ▼
IParser.parse(filePath, source) ── returns Partial<OmniGraph>
    │                               extracts: imports, classes, decorators, metadata
    │
    ▼
Deduplication ── nodes deduped by ID, edges aggregated
    │              dangling edges filtered (source/target must exist)
    │
    ▼
OmniGraph { nodes: OmniNode[], edges: OmniEdge[] }
    │
    ▼
GET /api/graph ── JSON response (rate-limited 30 req/min)
    │
    ▼
React Flow ── layout engine applies selected preset
    │            (directory/hierarchical/force/grid/mindmap)
    │
    ▼
Sidebar ── search/filter, layout controls, node inspector
```

## 4. Core Data Model (Omni JSON Schema)

All parsers produce the same data structure regardless of source language:

```typescript
interface OmniNode {
  id: string;                        // Normalized file path (forward slashes)
  type: string;                      // e.g. "typescript-file", "nestjs-controller",
                                     //      "python-fastapi-route", "php-laravel-controller"
  label: string;                     // File basename without extension
  metadata: Record<string, string>;  // filePath, route, language, framework, classes, etc.
}

interface OmniEdge {
  id: string;       // "e-{source}->{target}"
  source: string;   // Source node ID
  target: string;   // Target node ID
  label: string;    // Relationship type: "imports", "requires", "links to", "embeds", or HTTP method+path
}

interface OmniGraph {
  nodes: OmniNode[];
  edges: OmniEdge[];
}
```

This is the **contract between parsers and the frontend**. The UI never needs to know which language a node came from — it only reads `type` for coloring and `metadata` for the inspector.

## 5. Plugin Architecture (IParser Interface)

New language support is added by implementing a single interface:

```typescript
interface IParser {
  canHandle(filePath: string): boolean;
  parse(filePath: string, source: string): Partial<OmniGraph>;
}
```

**Adding a new parser:**
1. Create a class implementing `IParser` in `packages/parsers/src/<language>/`
2. Add an instance to the `parsers` array in `parser-registry.ts`
3. Add node colors/labels in the UI
4. No changes needed in server, CLI, or graph engine

**Current parsers:**
- `TypeScriptParser` — handles `.ts`/`.tsx`/`.js`/`.jsx`, detects NestJS decorators and Next.js patterns, resolves tsconfig.json path aliases (`@/*`), extracts method-level info (functions, arrows, getters, setters), uses `@typescript-eslint/typescript-estree`
- `PythonParser` — handles `.py`, detects FastAPI/Flask/Django patterns, regex-based
- `PhpParser` — handles `.php`, detects Laravel patterns, regex-based
- `MarkdownParser` — handles `.md`/`.mdx`, detects Obsidian wiki-links/embeds/frontmatter, regex-based (see ADR-003)

## 6. UI Architecture

The frontend is a React SPA built with Vite and served as static files.

**Layout System:**
- 6 layout presets: Directory (grouped), Hierarchical (dagre TB), Column Flow (4-column top-to-bottom), Force-Directed (d3-force), Grid, Mind Map (dagre LR/RL)
- Column Flow layout auto-classifies nodes into Frontend/API/Services/Database columns by type and file path heuristics, with directory grouping within columns
- Force-directed layout maintains a live d3-force simulation — dragging a node causes reactive push/pull physics on nearby nodes
- Layout computation is done client-side after fetching graph data
- Hub-centric compaction uses d3-force to pull filtered nodes toward the most-connected hub node(s). Column Flow uses column-aware compaction that preserves X positions and only collapses vertical gaps.

**Sidebar:**
- Right-side resizable drawer with drag handle, four tabs: Graph, API, Trace, Settings
- Graph tab: layout selector, search/filter with BFS depth expansion, type chips, node inspector, export dropdown, compact button
- Settings tab: per-category configuration (edge labels, graph, search) with localStorage persistence and reset buttons

**Export System:**
- PNG/SVG via `html-to-image`, JSON via Blob serialization
- GIF via `gif.js` with manual `stroke-dashoffset` animation per frame (30 frames at 30fps)
- GIF export shows a progress overlay (spinner + percentage bar) and disables canvas interactions during capture/encoding

**Node Types and Colors:**
| Type | Color | Language |
|------|-------|----------|
| `nestjs-controller` | Red (#e8534a) | TypeScript |
| `nestjs-injectable` | Blue (#4a90e8) | TypeScript |
| `nestjs-module` | Orange (#f5a623) | TypeScript |
| `typescript-file` | Green (#7ed321) | TypeScript |
| `javascript-file` | Yellow (#f0db4f) | JavaScript |
| `python-file` | Blue (#3776ab) | Python |
| `python-fastapi-route` | Teal (#009688) | Python |
| `python-django-view` | Dark Green (#092e20) | Python |
| `python-django-model` | Green (#44b78b) | Python |
| `nextjs-api-route` | Blue (#0070f3) | Next.js |
| `nextjs-page` | Dark (#171717) | Next.js |
| `nextjs-layout` | Gray (#383838) | Next.js |
| `markdown-file` | Purple (#7c3aed) | Markdown |
| `markdown-moc` | Light Purple (#a855f7) | Markdown |
| `markdown-daily` | Dark Purple (#6d28d9) | Markdown |
| `markdown-readme` | Mid Purple (#8b5cf6) | Markdown |
| `php-file` | Purple (#777bb4) | PHP |
| `php-laravel-controller` | Red (#ff2d20) | PHP |
| `php-laravel-model` | Coral (#f4645f) | PHP |
| `php-laravel-middleware` | Orange-Red (#fb503b) | PHP |
| `php-laravel-route` | Deep Orange (#ff7043) | PHP |
| `db-table` | Steel Blue (#336791) | Database |
| `db-collection` | Green (#47a248) | Database |
| `method-node` | Indigo (#5a5a8a) | Expanded Method |

## 7. Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Monorepo | npm workspaces | Zero extra tooling; native to Node.js |
| Shared types | @omnigraph/types | Single source of truth for OmniNode/OmniEdge/OmniGraph |
| CLI | Commander.js | Lightweight, standard Node.js CLI library |
| Server | Express.js | Minimal, well-known, serves both API and static files |
| Rate Limiting | express-rate-limit | Prevents rapid filesystem reads from parsed requests |
| TS/JS Parser | @typescript-eslint/typescript-estree | Zero native deps, ESTree-compliant (see ADR-001) |
| Python/PHP Parser | Regex-based | Zero deps, synchronous, sufficient for file-level (see ADR-002) |
| UI Framework | React 18 + Vite | Fast HMR, small bundle |
| Graph Rendering | React Flow | Interactive nodes/edges, minimap, controls, pan/zoom |
| Hierarchical Layout | dagre | Directed acyclic graph layout (top-bottom, left-right) |
| Force Layout | d3-force | Live physics simulation with collision, charge, centering |
| Testing | Vitest | Fast, Vite-native test runner |

## 8. Security Considerations

- **Filesystem access:** The parser reads all non-ignored files under the target path. Rate limiting (30 req/min on `/api/graph`) prevents abuse.
- **Static file serving:** Rate limited at 200 req/min.
- **Local only:** The server binds to localhost. There is no authentication because this is a local developer tool, not a networked service.
- **No code execution:** OmniGraph only reads and parses files. It never executes target code.
- **.gitignore aware:** The parser respects `.gitignore` rules, avoiding accidental reads of sensitive files.

## 9. Key Design Decisions

1. **One node per file, expandable to methods** — Maps file-level dependencies by default. Users can expand individual file nodes into method-level child nodes (TypeScript only). Full inter-method call graphs are a future goal.
2. **6 layout presets** — Directory (grouped by folder), Hierarchical (dagre), Column Flow (4-column auto-classified), Force-Directed (d3-force), Grid, Mind Map (dagre LR/RL).
3. **UI built ahead of time** — The server serves pre-built static files from `packages/ui/dist`. There is no dev server proxy setup.
4. **Types shared via package** — `OmniGraph`/`OmniNode`/`OmniEdge` are defined in the `@omnigraph/types` package and imported by both parsers and UI.
5. **Regex over Tree-sitter for Phase 2** — File-level import/decorator extraction doesn't require full AST parsing. Regex keeps installation simple and the `IParser` interface synchronous. See ADR-002.
6. **Dangling edge filtering** — Edges whose source or target doesn't exist in the node set are filtered out in `parser-registry.ts` to prevent rendering artifacts.
