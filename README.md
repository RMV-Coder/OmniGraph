# OmniGraph

A multi-language, AST-driven dependency visualizer for complex codebases.

OmniGraph is a free, local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files and framework-specific modules connect — helping developers onboard onto complex, undocumented codebases in seconds.

## Supported Languages & Frameworks

| Language | Extensions | Framework Detection |
|----------|-----------|-------------------|
| **TypeScript** | `.ts`, `.tsx` | NestJS (`@Controller`, `@Injectable`, `@Module`), Next.js (App Router, Pages Router) |
| **JavaScript** | `.js`, `.jsx` | CommonJS and ES module imports |
| **Python** | `.py` | FastAPI (`@router.get`, `@app.post`), Flask (`@app.route`), Django (Views, Models) |
| **PHP** | `.php` | Laravel (Controllers, Models, Middleware, Route definitions) |
| **Go** | `.go` | net/http, Gin, Echo, Fiber, Chi, Gorilla Mux handlers |
| **Rust** | `.rs` | Actix-web, Axum, Rocket route handlers |
| **Java** | `.java` | Spring Boot (`@RestController`, `@Service`, `@Repository`, `@GetMapping`) |
| **OpenAPI** | `.json`, `.yaml` | Swagger/OpenAPI path endpoints and schema models |
| **GraphQL** | `.graphql`, `.gql` | Type definitions, Query/Mutation/Subscription fields |
| **Markdown** | `.md`, `.mdx` | Obsidian wiki-links (`[[Page]]`), embeds (`![[Page]]`), frontmatter tags/aliases |

## Quick Start

**Prerequisites:** Node.js >= 18, npm >= 9

```bash
# Clone the repository
git clone https://github.com/RMV-Coder/OmniGraph.git
cd OmniGraph

# Install dependencies
npm install

# Build all packages
npm run build

# Analyze a repository
npm run dev -- --path ../my-project
```

Then open `http://localhost:4000` in your browser.

### CLI Commands

```bash
# Start the visualization server (default action)
omnigraph --path <repo-path>                    # Starts server on port 4000
omnigraph --path <repo-path> serve --port 8080  # Custom port
omnigraph --path <repo-path> --watch            # Live watch mode (auto-refresh on file changes)

# Query the dependency graph
omnigraph --path <repo-path> graph --stats              # Summary statistics
omnigraph --path <repo-path> graph --node src/index.ts  # Inspect a node
omnigraph --path <repo-path> graph --deps src/index.ts  # Transitive dependencies
omnigraph --path <repo-path> graph --filter nextjs-api-route  # Filter by type

# Trace data flow
omnigraph --path <repo-path> trace --from src/app/api/users/route.ts

# List methods in a file
omnigraph --path <repo-path> methods --file src/lib/auth.ts --exported

# Make HTTP requests (like curl/Postman)
omnigraph --path <repo-path> fetch --url http://localhost:3000/api/users \
  --method POST --body '{"email":"test@test.com"}' --env-token AUTH_TOKEN

# Inspect database schema from graph
omnigraph --path <repo-path> schema --fk
omnigraph --path <repo-path> schema --table users

# Diff / blast radius analysis
omnigraph --path <repo-path> diff                              # Changed files vs main branch
omnigraph --path <repo-path> diff --uncommitted                # Uncommitted changes only
omnigraph --path <repo-path> diff --base develop --depth 3     # Custom base, BFS depth
omnigraph --path <repo-path> diff --blast-only                 # Only show affected dependents

# Machine-readable JSON output (for AI coding agents)
omnigraph --path <repo-path> --json graph --stats
omnigraph --path <repo-path> --json trace --from src/index.ts
omnigraph --path <repo-path> --json diff --uncommitted
```

## Features

### Multi-Language Dependency Graph
Point OmniGraph at any project containing TypeScript, JavaScript, Python, PHP, Go, Rust, Java, OpenAPI, GraphQL, or Markdown files. It recursively walks the directory, respects `.gitignore`, and builds a dependency graph from import/require statements and wiki-links.

### Framework-Aware Parsing
OmniGraph doesn't just find imports — it understands framework patterns:
- **NestJS**: Detects `@Controller`, `@Injectable`, `@Module` decorators with route metadata
- **Next.js**: Detects App Router (`route.ts`, `page.tsx`, `layout.tsx`) and Pages Router (`pages/api/`)
- **FastAPI/Flask**: Detects route decorators (`@router.get("/users")`) with HTTP methods and paths
- **Django**: Detects class-based views (`APIView`, `ViewSet`) and models
- **Laravel**: Detects controllers, models, middleware, and `Route::get()` definitions
- **Go**: Detects HTTP handlers for net/http, Gin, Echo, Fiber, Chi, and Gorilla Mux
- **Rust**: Detects route attributes for Actix-web, Axum, and Rocket (`#[get("/path")]`)
- **Java/Spring**: Detects `@RestController`, `@Service`, `@Repository` stereotypes and `@GetMapping`/`@PostMapping` routes
- **OpenAPI/Swagger**: Extracts path endpoints and schema models from `.json`/`.yaml` specs
- **GraphQL**: Extracts type definitions and Query/Mutation/Subscription fields
- **Obsidian/Markdown**: Detects wiki-links (`[[Page]]`), embeds (`![[Page]]`), YAML frontmatter (tags, aliases), and classifies MOC/daily/readme note types

### Interactive Visualization
- **6 Layout Presets**: Directory (grouped by folder), Hierarchical, Column Flow (Frontend/API/Services/Database), Force-Directed, Grid, Mind Map (LR/RL)
- **Column Flow Layout**: Top-to-bottom layout with 4 columns. Nodes are auto-classified by type and file path. Column-aware compaction preserves columns while collapsing vertical gaps.
- **Live Force Simulation**: In force-directed mode, dragging a node causes nearby nodes to push and pull reactively via d3-force physics
- **Search & Filter with BFS Expansion**: Search nodes by name, filter by type with color-coded toggle chips. Hide or dim non-matching nodes. Connected nodes expand via BFS depth slider to reveal full data flow paths.
- **Hub-Centric Compaction**: After filtering, compact visible nodes around the most-connected hub node(s) using d3-force. Single hub stays pinned; multiple hubs meet at their average position.
- **Node Inspector**: Click any node to see its file path, type, route metadata, and ID in the sidebar. Expand file nodes into individual method-level nodes.
- **Database ERD**: DB tables connected via foreign key edges (ERD-style). Click an API route to highlight all connected DB tables.
- **Dark/Light Theme**: System-aware theme toggle with dark (default) and light modes. Persisted in localStorage.
- **Color-Coded Types**: Each node type has a distinct color — controllers (red), injectables (blue), modules (orange), Python files (blue), FastAPI routes (teal), Laravel controllers (red), Go files (cyan), Rust files (sandy), Java/Spring (green), OpenAPI (lime), GraphQL (pink), markdown (purple), DB tables (steel-blue), and more
- **Clickable Minimap**: Zoom and pan directly on the minimap for faster navigation

### Live Watch Mode
Start with `--watch` to enable live file watching. OmniGraph monitors your project for changes and automatically re-parses and pushes updates to the UI via Server-Sent Events (SSE). No manual refresh needed.

### Keyboard Shortcuts
- `Ctrl+K` / `⌘K` — Focus search
- `1`–`6` — Switch layout presets
- `C` — Compact visible nodes
- `?` — Show shortcut help overlay
- `Esc` — Close panels and overlays

### Bookmarks & Annotations
- **Bookmarks** — Save named graph views (layout, search query, active filters, depth) and restore them instantly. Export/import as JSON.
- **Annotations** — Attach text notes to any node. Annotations persist in localStorage and can be exported/imported.

### Diff & Blast Radius
The `diff` command analyzes which files changed between git refs (or uncommitted changes) and computes a blast radius — the set of files transitively affected by those changes via the dependency graph. Useful for estimating the impact of a PR.

### CLI for Humans and AI Agents
All CLI commands support `--json` for machine-readable output, designed for AI coding agents (Claude Code, Cursor, etc.):
- **`graph`** — Query nodes, edges, dependencies, reverse dependencies, stats
- **`trace`** — Trace data flow from a file through HTTP calls to database queries
- **`fetch`** — HTTP client with `.env` token resolution (like curl/Postman)
- **`methods`** — List functions/methods in a file with filters
- **`schema`** — Inspect database tables, foreign keys, code references
- **`diff`** — Git diff analysis with blast radius computation

### Export
- **PNG** — 2x resolution raster image
- **SVG** — Scalable vector graphic
- **JSON** — Raw OmniGraph data
- **GIF** — 1-second animated GIF (30fps) showing edge flow direction with a progress overlay

### Sidebar Tabs
The right sidebar has four tabs:
- **Graph** — Layout selector (6 presets), search/filter with depth slider, type chips, node inspector with method expansion, bookmarks, export dropdown, compact button
- **API** — Postman-style API debugger with configurable base URL (auto-fills from cross-network edges)
- **Trace** — Step-through flow tracer with Back/Next navigation, animated highlighting, and database query/join/result steps
- **Settings** — Theme toggle (system/dark/light), configurable edge labels (show/hide per type, color, font size), graph options (minimap, edge animation, FK labels), search defaults, with per-category reset and localStorage persistence

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | npm workspaces (5 packages) |
| CLI | Node.js + TypeScript + Commander.js |
| Server | Express.js with rate limiting + SSE watch mode |
| TypeScript/JS Parser | `@typescript-eslint/typescript-estree` |
| Python Parser | Regex-based AST extraction |
| PHP Parser | Regex-based AST extraction |
| Go Parser | Regex-based (imports, structs, HTTP handlers) |
| Rust Parser | Regex-based (mod/use, structs, route attributes) |
| Java Parser | Regex-based (imports, Spring annotations) |
| OpenAPI Parser | JSON.parse + line-based YAML extraction |
| GraphQL Parser | Regex-based type/field extraction |
| Markdown Parser | Regex-based wiki-link/embed/frontmatter extraction |
| Frontend | React 18 + Vite |
| Graph Engine | React Flow |
| Layout Engines | dagre (hierarchical/mind map), d3-force (force-directed, compaction), custom column flow |
| Theming | CSS custom properties with system/dark/light modes |
| GIF Export | gif.js (web worker encoding) |
| Testing | Vitest |

## Architecture

```
CLI (@omnigraph/cli) → Server (@omnigraph/server) → Parsers (@omnigraph/parsers) → Types (@omnigraph/types)
                       Server also serves → UI (@omnigraph/ui)                      UI also uses → Types
```

**Data flow:** Filesystem → AST parsing → OmniGraph model (nodes/edges) → JSON API (`/api/graph`) → React Flow UI

## How to Add a New Language Parser

OmniGraph is extensible by design. To add support for a new language or framework:

1. Create a new file in `packages/parsers/src/<language>/<language>-parser.ts`
2. Implement the `IParser` interface:
   ```typescript
   import { IParser } from '../IParser';
   import { OmniGraph } from '../types';

   export class MyLanguageParser implements IParser {
     canHandle(filePath: string): boolean {
       return /\.mylang$/.test(filePath);
     }

     parse(filePath: string, source: string): Partial<OmniGraph> {
       // Extract nodes and edges from source code
       return { nodes: [...], edges: [...] };
     }
   }
   ```
3. Register your parser in `packages/parsers/src/parser-registry.ts`:
   ```typescript
   import { MyLanguageParser } from './mylanguage/mylanguage-parser';
   const parsers: IParser[] = [..., new MyLanguageParser()];
   ```
4. Add node colors in `packages/ui/src/layout/shared.ts` and labels in `packages/ui/src/components/Sidebar.tsx`

No changes to the server, CLI, or graph engine are needed — the plugin architecture handles the rest.

## Omni JSON Schema

All parsers produce a standardized graph format regardless of source language:

```json
{
  "nodes": [
    {
      "id": "src/users/users.controller.ts",
      "type": "nestjs-controller",
      "label": "users.controller",
      "metadata": {
        "filePath": "/absolute/path/src/users/users.controller.ts",
        "route": "/users"
      }
    }
  ],
  "edges": [
    {
      "id": "e-src/users/users.controller.ts->src/users/users.service.ts",
      "source": "src/users/users.controller.ts",
      "target": "src/users/users.service.ts",
      "label": "imports"
    }
  ]
}
```

## Running Tests

```bash
npx vitest run       # Run all tests
npx vitest --watch   # Watch mode
```

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repo** and create a feature branch
2. **Install dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Run tests**: `npx vitest run` — make sure all tests pass
5. **Submit a PR** with a clear description of what you changed and why

### Good First Issues

- Add a new language parser (C#, Ruby, Swift, Kotlin)
- Improve import resolution for edge cases (barrel exports, dynamic imports)
- Add Dockerfile / docker-compose parsing
- Terraform / infrastructure-as-code graph support

## Project Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements, feature status, and roadmap |
| [SAD](docs/SAD.md) | Software architecture, data flow, and design decisions |
| [ADR-001](docs/adr/ADR-001-parsing-engine.md) | Why typescript-estree for Phase 1 |
| [ADR-002](docs/adr/ADR-002-phase2-multi-language-parsing.md) | Why regex-based parsing for Phase 2 Python/PHP |
| [ADR-003](docs/adr/ADR-003-markdown-obsidian-parser.md) | Markdown/Obsidian wiki-link parser design |
| [ADR-004](docs/adr/ADR-004-database-integration.md) | Database integration architecture |
| [API Spec](docs/API-SPEC.md) | HTTP endpoint and CLI interface documentation |
| [Changelog](CHANGELOG.md) | Detailed release changelog |

## License

MIT
