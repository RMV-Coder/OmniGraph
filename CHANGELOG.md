# Changelog

All notable changes to OmniGraph are documented in this file.

## [1.2.0] - 2026-04-01

### Added

#### Database ERD Visualization
- **Foreign key introspection** — PostgreSQL uses `information_schema` joins (`table_constraints`, `key_column_usage`, `constraint_column_usage`, `referential_constraints`) to discover FKs; MongoDB uses heuristic ObjectId field name matching (strips `Id`/`_id` suffix, tries plural variants against collection names)
- **ERD-style edges** — DB tables are connected via foreign key edges (`e-fk-*`) rendered as solid teal (`#2dd4bf`) lines with FK column labels
- **Code-to-table matching** — Files referencing DB tables (via metadata, model types, route path segments, or filename matching) get `e-db-*` edges to the corresponding `db://` nodes
- **Import-chain propagation** — If `users.ts` matches the `users` table, upstream importers of `users.ts` also get connected to the table
- **Click-highlighting** — Clicking an API route node highlights all connected DB tables with a glow effect and dims unrelated nodes

#### Column Flow Layout
- **New "Column Flow" layout preset** — Top-to-bottom layout with 4 columns: Frontend, API / Routes, Services / Libs, Database
- **Automatic classification** — Nodes are classified into columns by type (exact match for framework types) then by file path heuristics (regex patterns for `/components/`, `/api/`, `/lib/`, `/models/`, etc.)
- **Directory grouping** — Nodes within each column are grouped by directory (Next.js App Router and Pages Router aware) with extra vertical spacing between groups
- **Column headers** — Non-interactive styled header nodes at the top of each column (dark, blue, orange, steel-blue)
- **Cross-column edges** — Edges crossing columns use `smoothstep` routing for cleaner visuals
- **Column-aware compact** — Compact button preserves column X positions; only collapses vertical gaps between node clusters instead of pulling everything into a d3-force ball

#### Method-Level Node Expansion
- **`MethodInfo` type** — New interface in `@omnigraph/types` with name, line range, kind (function/method/arrow/getter/setter), exported flag, and parameter list
- **AST method extraction** — TypeScript parser extracts all functions, methods, arrow functions, getters, and setters from each file via `typescript-estree`
- **Expand Methods button** — In the node inspector, clicking "Expand Methods" replaces a file node with individual method child nodes, each connected to the parent's edges

#### CLI Subcommands
- **Multi-command architecture** — CLI restructured from single-action to Commander.js subcommand pattern with global `--path` and `--json` flags
- **`omnigraph graph`** — Query the dependency graph: `--node <id>`, `--deps <id>`, `--rdeps <id>`, `--filter <type>`, `--edges`, `--stats`, `--depth <n>`
- **`omnigraph trace`** — Trace data flow from a starting file through HTTP calls and DB queries: `--from <file>`, `--depth <n>`
- **`omnigraph fetch`** — Make HTTP requests (like curl/Postman): `--url`, `--method`, `--header`, `--body`, `--body-file`, `--env-token`, `--cookie`, `--timeout`, `--from`
- **`omnigraph methods`** — List functions/methods in a file: `--file`, `--exported`, `--kind`
- **`omnigraph schema`** — Inspect DB schema from graph: `--table <name>`, `--tables`, `--fk`, `--columns <table>`
- **`omnigraph serve`** — Start the visualization server: `--port` (extracted from old default action)
- **`--json` output mode** — All commands support `--json` for machine-readable output, designed for AI coding agents (Claude Code, etc.)
- **`--env-token` support** — The `fetch` command reads auth tokens from `.env` files (`.env`, `.env.local`, `.env.development`, `.env.development.local`)
- **Shared formatting library** — `packages/cli/src/lib/format.ts` with aligned table output, tree printing, JSON mode, and ANSI color helpers (TTY-aware)
- **Graph caching** — `packages/cli/src/lib/graph-loader.ts` caches `parseDirectory()` results for the process lifetime

#### TypeScript Path Alias Resolution
- **tsconfig.json `paths` support** — Resolves `@/*` and other path aliases by reading `compilerOptions.paths` and `baseUrl` from the nearest `tsconfig.json`
- **Project root detection** — Walks up from the file to find `tsconfig.json`, caches results per project root
- **Node module disambiguation** — Distinguishes npm packages (`@nestjs/common`, `react`) from path aliases (`@/lib/db`) using scoped package naming conventions

#### Enhanced Flow Tracer
- **Database steps** — After route-handler steps, the tracer follows `e-db-*` edges to find queried tables, then follows `e-fk-*` edges for join detection
- **New step types** — `db-query`, `db-join`, `db-result` with dedicated icons and colors (cyan for queries, green for results)
- **Response path** — Tracer adds a response step back to the calling component

#### API Client Improvements
- **Base URL field** — Configurable base URL input in the API tab (default: `http://localhost:4000`)
- **Port fix** — Default port changed from 3000 to 4000 across the project

### Fixed
- **Edge rendering storm** — Switching layout presets caused corrupted/feathered/ghosted edges due to SVG animation storms. Fixed by disabling edge animation by default, adding `layoutTransitionRef` to suppress animation during transitions, and adding an "Animate edges" toggle in Settings
- **`graph --stats` undefined output** — Non-JSON stats mode printed `undefined` before the actual output

### Changed
- **Default edge animation** — Edges are no longer animated by default; toggle available in Settings > Graph
- **Settings additions** — "Animate edges" and "Show foreign keys" toggles added to the Settings panel
- **CLI backward compatibility** — Running `omnigraph --path <repo>` with no subcommand still starts the visualization server (same as before)

---

## [1.1.0] - 2026-03-XX

### Added
- Database integration with PostgreSQL and MongoDB connectivity
- Live schema introspection and query runner

## [1.0.0] - 2026-03-XX

### Added
- Initial release with TypeScript, JavaScript, Python, PHP, and Markdown parsing
- 5 layout presets, search/filter, API debugger, flow tracer, settings system
- Export: PNG, SVG, JSON, animated GIF
