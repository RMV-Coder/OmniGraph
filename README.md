# OmniGraph

A multi-language, AST-driven dependency visualizer for complex codebases.

OmniGraph is a free, local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files and framework-specific modules connect — helping developers onboard onto complex, undocumented codebases in seconds.

## Supported Languages & Frameworks

| Language | Extensions | Framework Detection |
|----------|-----------|-------------------|
| **TypeScript** | `.ts`, `.tsx` | NestJS (`@Controller`, `@Injectable`, `@Module`) |
| **JavaScript** | `.js`, `.jsx` | CommonJS and ES module imports |
| **Python** | `.py` | FastAPI (`@router.get`, `@app.post`), Flask (`@app.route`), Django (Views, Models) |
| **PHP** | `.php` | Laravel (Controllers, Models, Middleware, Route definitions) |

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

Then open `http://localhost:3000` in your browser.

### CLI Options

```
omnigraph --path <repo-path>              # Required: path to the repo to analyze
omnigraph --path <repo-path> --port 4000  # Optional: custom port (default 3000)
```

## Features

### Multi-Language Dependency Graph
Point OmniGraph at any project containing TypeScript, JavaScript, Python, or PHP files. It recursively walks the directory, respects `.gitignore`, and builds a dependency graph from import/require statements.

### Framework-Aware Parsing
OmniGraph doesn't just find imports — it understands framework patterns:
- **NestJS**: Detects `@Controller`, `@Injectable`, `@Module` decorators with route metadata
- **FastAPI/Flask**: Detects route decorators (`@router.get("/users")`) with HTTP methods and paths
- **Django**: Detects class-based views (`APIView`, `ViewSet`) and models
- **Laravel**: Detects controllers, models, middleware, and `Route::get()` definitions

### Interactive Visualization
- **5 Layout Presets**: Directory (grouped by folder), Hierarchical, Force-Directed, Grid, Mind Map (LR/RL)
- **Live Force Simulation**: In force-directed mode, dragging a node causes nearby nodes to push and pull reactively via d3-force physics
- **Search & Filter**: Search nodes by name, filter by type with color-coded toggle chips
- **Node Inspector**: Click any node to see its file path, type, route metadata, and ID in the sidebar
- **Color-Coded Types**: Each node type has a distinct color — controllers (red), injectables (blue), modules (orange), Python files (blue), FastAPI routes (teal), Laravel controllers (red), and more

### Sidebar Controls
All controls live in a clean right sidebar:
- Layout preset selector with mind map direction toggle
- Real-time search with match count
- Type filter chips with color legend
- Node inspector panel below a divider

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | npm workspaces (5 packages) |
| CLI | Node.js + TypeScript + Commander.js |
| Server | Express.js with rate limiting |
| TypeScript/JS Parser | `@typescript-eslint/typescript-estree` |
| Python Parser | Regex-based AST extraction |
| PHP Parser | Regex-based AST extraction |
| Frontend | React 18 + Vite |
| Graph Engine | React Flow |
| Layout Engines | dagre (hierarchical/mind map), d3-force (force-directed) |
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
npx vitest run       # Run all tests (56 tests across 6 files)
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

- Add a new language parser (Go, Rust, Java, C#, Ruby)
- Add export functionality (SVG, PNG, JSON)
- Improve import resolution for edge cases (barrel exports, dynamic imports)
- Add dark/light theme toggle

## Project Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements, feature status, and roadmap |
| [SAD](docs/SAD.md) | Software architecture, data flow, and design decisions |
| [ADR-001](docs/adr/ADR-001-parsing-engine.md) | Why typescript-estree for Phase 1 |
| [ADR-002](docs/adr/ADR-002-phase2-multi-language-parsing.md) | Why regex-based parsing for Phase 2 Python/PHP |
| [API Spec](docs/API-SPEC.md) | HTTP endpoint and CLI interface documentation |

## License

MIT
