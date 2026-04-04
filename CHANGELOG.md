# Changelog

All notable changes to OmniGraph are documented in this file.

## [1.3.0] - 2026-04-04

### Added

#### New Language Parsers
- **Go parser** — Parses `.go` files: package declarations, single and grouped imports, struct/interface/function definitions. Detects HTTP route handlers for net/http, Gin, Echo, Fiber, Chi, and Gorilla Mux. Resolves imports via `go.mod` module path.
- **Rust parser** — Parses `.rs` files: `mod`/`use` declarations, struct/enum/trait/impl definitions, function/method extraction. Detects route attributes (`#[get("/path")]`) for Actix-web, Axum, and Rocket. Resolves `crate::` imports and `mod` file paths.
- **Java/Spring parser** — Parses `.java` files: package/import declarations, class/interface/enum/record definitions. Detects Spring stereotypes (`@RestController`, `@Service`, `@Repository`, `@Component`) and mapping annotations (`@GetMapping`, `@PostMapping`, `@RequestMapping`) with route extraction.
- **OpenAPI/Swagger parser** — Parses OpenAPI spec files (JSON and YAML): extracts path endpoints with HTTP methods and schema/model definitions as method-level metadata.
- **GraphQL parser** — Parses `.graphql`/`.gql` files: type/input/enum/interface/union/scalar definitions, Query/Mutation/Subscription field extraction.

#### Live Watch Mode
- **`--watch` flag** — Start the server with `--watch` to enable live file monitoring via `fs.watch()` with recursive directory walking
- **SSE push updates** — File changes trigger automatic re-parsing and push graph updates to the UI via Server-Sent Events (`/api/watch` endpoint)
- **Smart debouncing** — 500ms debounce window prevents rapid re-parses during batch saves
- **Extension filtering** — Only watches relevant file types (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.php`, `.md`, `.mdx`, `.go`, `.rs`, `.java`, `.graphql`, `.gql`)

#### Dark/Light Theme
- **System-aware theme toggle** — Three modes: system (follows OS preference), dark, light
- **CSS custom properties** — 16 color tokens (`--bg`, `--text`, `--accent`, etc.) applied to `:root` via JavaScript
- **localStorage persistence** — Theme preference survives page reloads
- **Settings panel integration** — Theme selector buttons in the Settings tab

#### Diff & Blast Radius CLI
- **`omnigraph diff` command** — Analyzes changed files between git refs and computes blast radius via BFS on the reverse dependency graph
- **Options** — `--base` (default: auto-detect main/master/develop), `--head` (default: HEAD), `--uncommitted`, `--depth`, `--blast-only`, `--json`
- **Blast radius computation** — BFS traversal of reverse dependency edges to find all transitively affected files

#### Keyboard Shortcuts
- `Ctrl+K` / `⌘K` — Focus search input
- `1`–`6` — Switch between layout presets
- `C` — Compact visible nodes
- `?` — Toggle shortcut help overlay
- `Esc` — Close panels, overlays, and deselect nodes
- Input-aware — Shortcuts are suppressed when typing in input/textarea fields

#### Bookmarks
- **Named graph views** — Save and restore layout preset, search query, filter mode, search depth, and active type filters
- **CRUD operations** — Create, rename, delete bookmarks from the Graph sidebar tab
- **Export/import** — JSON serialization with ID regeneration on import
- **localStorage persistence** — Bookmarks survive page reloads

#### Node Annotations
- **Text notes on nodes** — Attach freeform text annotations to any node via the node inspector
- **Annotated node tracking** — Quick lookup of which nodes have annotations
- **Export/import** — JSON serialization for sharing annotations across sessions
- **localStorage persistence** — Annotations survive page reloads

#### CLI Live DB Schema
- **`schema --live` flag** — Connect directly to PostgreSQL or MongoDB to introspect live database schema
- **Connection options** — `--engine`, `--host`, `--db-port`, `--database`, `--user`, `--password`, `--connection-string`

### Changed
- **README** — Updated with all new languages, features, CLI commands, and technology stack
- **Bundle script** — Updated description and keywords for npm publish

---

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
