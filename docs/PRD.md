# Product Requirements Document (PRD)

**Project:** OmniGraph
**Version:** 5.0.0
**Date:** April 2026
**Status:** Phase 2 — Complete, Phase 3 — Complete, Phase 4 — Complete, Phase 5 — In Progress

## 1. Product Overview

OmniGraph is a local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files, functions, and framework-specific modules (like NestJS controllers, FastAPI routes, or Laravel controllers) connect — helping developers onboard onto complex, undocumented codebases.

## 2. Target Audience

- Software architects mapping existing systems
- Lead developers onboarding new team members
- Full-stack engineers navigating unfamiliar monorepos
- Solo developers trying to understand inherited or open-source codebases

## 3. Problem Statement

Modern full-stack monorepos have deeply nested dependency chains that span languages, frameworks, and network boundaries. Existing tools are either paid (NestJS Devtools), language-locked (ts-morph), or only show package-level graphs (Nx, Turborepo). VS Code's Call Hierarchy cannot trace connections across the HTTP boundary between frontend and backend. Developers need a free, extensible, file-level visualizer that works across frameworks.

## 4. Core Features — Phase 1 (TypeScript/NestJS MVP)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F1 | CLI Execution | Run `omnigraph --path <repo>` to launch a local web server hosting the graph | ✅ Done |
| F2 | TypeScript Parsing | Parse `.ts`/`.tsx`/`.js`/`.jsx` files, extract relative imports as edges | ✅ Done |
| F3 | NestJS Decorator Detection | Identify `@Controller`, `@Injectable`, `@Module` decorators and extract route metadata | ✅ Done |
| F4 | Interactive Graph UI | 2D node graph with pan, zoom, drag (React Flow) | ✅ Done |
| F5 | Node Inspection | Click a node to see file path, type badge, route, and node ID in the sidebar | ✅ Done |
| F6 | Color-Coded Node Types | Visual distinction between controllers (red), injectables (blue), modules (orange), TS files (green), JS files (yellow) | ✅ Done |
| F7 | Rate Limiting | Prevent filesystem abuse via express-rate-limit on API and static routes | ✅ Done |

## 5. Phase 2 — Multi-Language Support

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F8 | Multi-Language Parsing Engine | Regex-based parsing for Python/PHP (see ADR-002). TypeScript retains `typescript-estree`. The `IParser` interface abstracts engine differences. Tree-sitter remains a future option for method-level analysis. | ✅ Done |
| F9 | Python/FastAPI/Django Parser | `PythonParser` for `.py` files — detects FastAPI route decorators, Flask routes, Django views/models, resolves relative and absolute imports | ✅ Done |
| F10 | PHP/Laravel Parser | `PhpParser` for `.php` files — detects Laravel controllers, models, middleware, route definitions, resolves `use` statements (PSR-4) and `require`/`include` | ✅ Done |
| F11 | JavaScript Parser | `TypeScriptParser` extended to handle `.js`/`.jsx` files natively | ✅ Done |

## 6. Phase 3 — Advanced Features

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F12 | Cross-Network Tracing | Heuristic-based linking of frontend HTTP client calls (fetch, axios, httpClient, requests, Http::, Guzzle) to backend route handlers. Supports TS/JS, Python, and PHP client patterns. Matches via exact path, suffix matching (controller prefixes), and parameterized routes (:id, {id}). Cross-network edges rendered as dashed orange lines with method+path labels. | ✅ Done |
| F13 | Code Snippets in Inspector | Show raw source code of the selected node in the inspector panel with syntax highlighting (keywords, strings, decorators, comments) via new `/api/file` endpoint with path traversal protection | ✅ Done |
| F14 | Search & Filter | Search nodes by name, filter by type with color-coded toggle chips, highlight matching nodes and dim non-matches | ✅ Done |
| F15 | Layout Presets | 6 layout algorithms: Directory (grouped by folder), Hierarchical (dagre TB), Column Flow (4-column auto-classified), Force-Directed (live d3-force simulation with drag physics), Grid, Mind Map (dagre LR/RL) | ✅ Done |
| F16 | Export | Export graph as PNG (2x), SVG, JSON, or animated GIF (1s 30fps with progress overlay) via export dropdown using `html-to-image` and `gif.js` | ✅ Done |
| F17 | Sidebar Controls | Right sidebar drawer with layout selector, search/filter, and node inspector below a divider — keeps the canvas clean | ✅ Done |
| F18 | Live Force Simulation | Force-directed layout uses a live d3-force simulation with drag-to-push physics — nearby nodes react dynamically when dragging | ✅ Done |
| F19 | Dangling Edge Filtering | Edges whose source or target node doesn't exist are automatically filtered out | ✅ Done |
| F20 | API Debugger | Postman-inspired API client in the sidebar. Click a cross-network edge to auto-fill method + URL, edit headers/params/body, send requests via server proxy (localhost-only SSRF protection), view responses with status, headers, body, and duration. | ✅ Done |
| F21 | Flow Tracer | Cisco Packet Tracer-inspired step-through visualization. Click a cross-network edge to trace the full path: upstream callers → HTTP call → route handler → downstream dependencies. Back/Next navigation with animated node highlighting and edge glow. | ✅ Done |
| F22 | Tabbed Sidebar | Sidebar refactored into four tabs: Graph (controls + inspector), API (debugger), Trace (flow tracer), Settings. Resizable drawer with drag handle. | ✅ Done |
| F23 | Markdown/Obsidian Parser | `MarkdownParser` for `.md`/`.mdx` files — wiki-links (`[[Page]]`), embeds (`![[Page]]`), YAML frontmatter (tags, aliases), heading extraction. Obsidian-style vault-wide BFS resolution. Node types: file, MOC, daily, readme. See ADR-003. | ✅ Done |
| F24 | Search Filter BFS Expansion | Search/filter expands matching nodes via BFS depth slider to show connected data flow paths. Works in both directory and force-directed layouts. Hide/Dim mode toggle. | ✅ Done |
| F25 | Hub-Centric Compaction | Manual compact button pulls visible nodes toward the most-connected hub node(s). Single hub stays pinned; tied hubs meet at their average position. Uses d3-force simulation with link/charge/collide forces. | ✅ Done |
| F26 | Settings System | Full settings page with localStorage persistence (`omnigraph-settings`). Configurable edge labels (show/hide per type, color, font size), graph options (minimap, animations), search defaults (filter mode, depth). Per-category and global reset. | ✅ Done |
| F27 | GIF Export | Animated GIF export (1s, 30fps) capturing edge flow animation. Manual stroke-dashoffset control per frame, gif.js web worker encoding. Progress overlay with spinner and percentage bar, canvas interactions disabled during export. | ✅ Done |
| F28 | Clickable Minimap | MiniMap with `zoomable` and `pannable` props for direct navigation | ✅ Done |
| F29 | Next.js Detection | TypeScript parser extended to detect Next.js App Router (`route.ts`, `page.tsx`, `layout.tsx`) and Pages Router (`pages/api/`) with dedicated node types and colors | ✅ Done |

## 7. Phase 4 — Database & Connectivity

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F30 | Database Integration | Live database connectivity (PostgreSQL, MongoDB) with schema introspection, query runner, and graph visualization. Tables/collections appear as nodes connected to code files that reference them. Foreign key introspection for ERD-style edges. Server-side `pg` and `mongodb` drivers with stateless per-request connections. See ADR-004. | ✅ Done |
| F31 | npm Global Install | Publish to npm via esbuild-bundled standalone package. `npm run bundle` produces a `publish/` directory with single-file CLI (12MB, includes typescript-estree), pre-built UI, and ready-to-publish package.json. Users can run `npx omnigraph --path .` without cloning. | ✅ Done |
| F32 | Database ERD Visualization | DB tables connected via foreign key edges (ERD-style). Click an API route to highlight connected tables with glow effect. PostgreSQL FK introspection via information_schema; MongoDB heuristic ObjectId matching. Code-to-table matching via metadata, filename, and import-chain propagation. | ✅ Done |
| F33 | Column Flow Layout | New top-to-bottom layout with 4 columns (Frontend, API/Routes, Services/Libs, Database). Auto-classifies nodes by type and file path heuristics. Directory grouping within columns. Column-aware compaction preserves X positions. | ✅ Done |
| F34 | Method-Level Node Expansion | Click "Expand Methods" on a file node to replace it with individual function/method child nodes. Uses TypeScript AST extraction (FunctionDeclaration, ArrowFunction, ClassMethod, getters/setters). New `MethodInfo` type in `@omnigraph/types`. | ✅ Done |
| F35 | CLI Subcommands | Multi-command CLI: `graph`, `trace`, `fetch`, `methods`, `schema`, `serve`. All commands support `--json` for AI agent consumption. `fetch` resolves `.env` tokens. `graph` supports --node, --deps, --rdeps, --filter, --edges, --stats. Backward compatible (no subcommand = serve). | ✅ Done |
| F36 | TypeScript Path Alias Resolution | Resolves `@/*` and other tsconfig.json `paths` aliases. Project root detection with caching. Distinguishes npm packages from path aliases. | ✅ Done |
| F37 | Enhanced Flow Tracer | Tracer follows db edges for query/join/result steps. New step types: db-query, db-join, db-result with dedicated icons and colors. Response step back to caller. | ✅ Done |

## 8. Phase 5 — Parser & CLI Completeness

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F38 | WebSocket Tracing | Detect and visualize WebSocket connections (socket.io, ws, Django Channels, Laravel Broadcasting) between frontend and backend nodes. New edge type `websocket` with event labels. | Not Started |
| F39 | Next.js Cross-Network Edges | Enhance cross-network tracing to fully resolve App Router `route.ts` API handlers — match frontend `fetch()` calls to `app/api/**/route.ts` handlers using filesystem convention routing | Not Started |
| F40 | Tree-sitter Parsing | Replace regex-based Python/PHP parsers with Tree-sitter for more accurate AST analysis, enabling method-level call graphs | Not Started |
| F41 | Method-Level Call Graphs | Extend method expansion to show inter-function call edges within and across files (requires Tree-sitter or full AST walk) | Not Started |
| F42 | Python/PHP Method Extraction | Extend method-level extraction to Python and PHP parsers (currently TypeScript only). Regex-based detection of `def`, `class` methods for Python; PHP `function` declarations | Not Started |
| F43 | CLI Live DB Schema | `omnigraph schema --live` command with direct database connection for real-time schema introspection via CLI. Reuses server-side pg/mongodb clients | Not Started |

## 9. Phase 6 — High Impact & Visibility

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F44 | VS Code Extension | WebView panel showing the OmniGraph visualization inside VS Code. Click a node to jump to the file. Sync selection between editor and graph. Publish to VS Code Marketplace. | Not Started |
| F45 | Live Watch Mode | `omnigraph --watch` re-parses on file save via `fs.watch` and hot-reloads the graph in the browser via SSE push. No restart needed. | Done |
| F46 | GitHub Action (PR Impact) | GitHub Action that runs `omnigraph --json graph --stats` on PRs and posts a comment showing added/removed nodes, new edges, and dependency changes. Architectural drift detection. | Not Started |
| F47 | Interactive Online Demo | Hosted playground (e.g. omnigraph.dev) with a pre-loaded sample repo so users can try OmniGraph without installing. Static site with embedded graph data. | Not Started |
| F48 | Dark/Light Theme Toggle | System-auto, dark, and light theme modes. CSS custom properties for all colors. Theme selector in Settings tab with localStorage persistence. | Done |

## 10. Phase 7 — Differentiators

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F49 | AI-Powered Explanations | "Explain this" button on nodes and traces that sends the dependency chain to Claude API and returns a plain-English summary of what the code path does and why it exists. | Not Started |
| F50 | Diff View / PR Impact Graph | `omnigraph diff` — given a git diff (or two refs), maps changed files to graph nodes and computes blast radius. Supports `--base`, `--head`, `--uncommitted`, `--depth`, `--blast-only`. | Done |
| F51 | REST/GraphQL Schema Detection | `SchemaParser` detects OpenAPI/Swagger JSON/YAML specs and GraphQL `.graphql`/`.gql` schema files. Extracts endpoints as MethodInfo and schema models. | Done |
| F52 | Monorepo Package Boundaries | Detect npm/pip/composer workspace boundaries and render a high-level package dependency graph. Zoom out from files to packages for architectural overview. | Not Started |
| F53 | Git Time-Travel | `omnigraph --ref HEAD~10` parses the repo at a past commit. Animated diff between two refs showing architectural evolution over time. | Not Started |

## 11. Phase 8 — Community & Ecosystem

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F54 | Plugin Marketplace | Discovery mechanism for community parsers published as npm packages (`omnigraph-plugin-go`, `omnigraph-plugin-rust`). Auto-install and register via `omnigraph plugin add <name>`. | Not Started |
| F55 | Go Parser | `GoParser` for `.go` files — detects packages, imports, structs, interfaces, HTTP handlers (net/http, gin, echo, fiber). Resolves Go module imports. | Not Started |
| F56 | Rust Parser | `RustParser` for `.rs` files — detects modules, `use` statements, structs, traits, impl blocks. Resolves `mod` and `crate::` imports. Detects Actix/Axum route handlers. | Not Started |
| F57 | Java/Spring Parser | `JavaParser` for `.java` files — detects `@RestController`, `@Service`, `@Repository`, `@Component` annotations. Resolves package imports. Maven/Gradle module boundaries. | Not Started |
| F58 | Shareable Graph Links | Export graph as a self-contained HTML file with embedded React Flow + data. Recipients can interact with the graph without installing OmniGraph. | Not Started |
| F59 | Obsidian Plugin | Package OmniGraph's Markdown parser + React Flow UI as an Obsidian community plugin for vault-wide dependency visualization. | Not Started |
| F60 | Embeddable Documentation Graphs | Generate static SVGs or interactive `<iframe>` embeds for docs sites. Auto-update on CI builds. "Here's our architecture" that stays current. | Not Started |

## 12. Phase 9 — Quality of Life & Performance

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F61 | Bookmarks / Saved Views | Save a filter + layout + zoom + selected nodes as a named view. One-click recall: "Auth flow", "Database layer", "API surface". localStorage + JSON export. | Not Started |
| F62 | Node Annotations / Notes | Add sticky notes to nodes that persist across sessions (localStorage). Onboarding developers can leave breadcrumbs for teammates. | Not Started |
| F63 | Keyboard Shortcuts | `Ctrl+K` search, arrow keys to navigate nodes, `E` expand methods, `T` trace, `C` compact, `1-6` layout presets. Customizable via settings. | Not Started |
| F64 | Multi-Select & Batch Operations | Shift+click or drag-select multiple nodes. Batch trace, expand, hide, or highlight. "Select all of type X" context menu. | Not Started |
| F65 | Large Graph Performance | Lazy loading and virtualization for 1000+ node graphs. Web Worker parsing. Incremental layout updates. Canvas-based rendering fallback for very large graphs. | Not Started |

## 13. Non-Goals

- Replacing IDE features like Go to Definition or Find References
- Cloud deployment or SaaS hosting — OmniGraph runs locally

## 14. Success Criteria

- A developer can run `omnigraph --path <any-project>` and see a correct, interactive dependency graph in their browser within seconds
- Adding a new language parser requires only implementing `IParser` and registering it — no changes to server, CLI, or UI
- The tool correctly identifies framework-specific patterns (NestJS controllers, FastAPI routes, Laravel controllers) with their metadata
- Works across TypeScript, JavaScript, Python, and PHP codebases
- Graph is navigable with multiple layout options and searchable by node name/type
- Users can connect to live PostgreSQL and MongoDB databases and see schema entities on the graph

## 15. Supported Languages & Frameworks

| Language | Extensions | Frameworks Detected |
|----------|-----------|-------------------|
| TypeScript | `.ts`, `.tsx` | NestJS (`@Controller`, `@Injectable`, `@Module`), Next.js (App Router, Pages Router) |
| JavaScript | `.js`, `.jsx` | CommonJS and ES module imports |
| Python | `.py` | FastAPI (`@router.get`, `@app.post`), Flask (`@app.route`), Django (Views, Models) |
| PHP | `.php` | Laravel (Controllers, Models, Middleware, Routes) |
| Markdown | `.md`, `.mdx` | Obsidian (wiki-links, embeds, frontmatter) |

## 16. Supported Database Engines

| Engine | Driver | Capabilities |
|--------|--------|-------------|
| PostgreSQL | `pg` (node-postgres) | Schema introspection (tables, views, columns, indexes, foreign keys), query execution (read-only), row count |
| MongoDB | `mongodb` (official driver) | Schema inference via document sampling, collection listing, find queries, heuristic FK detection |

## 17. Architecture Decision Records

| ADR | Decision |
|-----|----------|
| [ADR-001](adr/ADR-001-parsing-engine.md) | Phase 1 uses `typescript-estree` for TypeScript AST; Tree-sitter reserved for future use |
| [ADR-002](adr/ADR-002-phase2-multi-language-parsing.md) | Phase 2 uses regex-based parsing for Python/PHP — zero native deps, sufficient for file-level analysis |
| [ADR-003](adr/ADR-003-markdown-obsidian-parser.md) | Markdown parser with Obsidian-style vault-wide BFS resolution for wiki-links |
| [ADR-004](adr/ADR-004-database-integration.md) | Live database connectivity via stateless per-request connections with pg and mongodb drivers |
