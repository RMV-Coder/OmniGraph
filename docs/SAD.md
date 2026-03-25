# Software Architecture Document (SAD)

**Project:** OmniGraph
**Version:** 1.0.0
**Date:** March 2026

## 1. Architecture Overview

OmniGraph uses a **Local Client-Server Architecture** delivered via a CLI tool. The user points the CLI at a local repository, the backend parses the filesystem into a graph data structure, and the frontend renders it interactively.

```
┌─────────────────────────────────────────────────────────────────┐
│  User's Terminal                                                │
│  $ omnigraph --path ../my-project --port 3000                   │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐     │
│  │   CLI    │───>│    Server    │───>│     Parsers        │     │
│  │ Commander│    │   Express    │    │  parser-registry   │     │
│  └──────────┘    │              │    │   ┌──────────────┐ │     │
│                  │  /api/graph  │<───│   │ TypeScript   │ │     │
│                  │  GET * (SPA) │    │   │   Parser     │ │     │
│                  └──────┬───────┘    │   └──────────────┘ │     │
│                         │           │   ┌──────────────┐ │     │
│                         │           │   │ Future Lang  │ │     │
│                         │           │   │   Parser     │ │     │
│                         │           │   └──────────────┘ │     │
│                         │           └────────────────────┘     │
│                         │                                       │
│                  ┌──────▼───────┐                                │
│                  │     UI       │   User's Browser               │
│                  │  React Flow  │   http://localhost:3000        │
│                  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Package Structure

The project is an **npm workspaces monorepo** with four packages:

```
packages/
├── cli/        @omnigraph/cli       → Binary entry point
├── server/     @omnigraph/server    → Express HTTP server
├── parsers/    @omnigraph/parsers   → AST parsing engine (pluggable)
└── ui/         @omnigraph/ui        → React SPA (built as static files)
```

**Dependency direction:** `cli → server → parsers`. The UI is served as pre-built static files by the server; there is no runtime dependency from server to UI code.

## 3. Data Flow

```
Filesystem (target repo)
    │
    ▼
parser-registry.ts ── walks directories recursively
    │                  skips: node_modules, .git, dist, .next, build
    │
    ▼
IParser.canHandle(filePath) ── selects correct parser
    │
    ▼
IParser.parse(filePath, source) ── returns Partial<OmniGraph>
    │
    ▼
Deduplication ── nodes deduped by ID, edges aggregated
    │
    ▼
OmniGraph { nodes: OmniNode[], edges: OmniEdge[] }
    │
    ▼
GET /api/graph ── JSON response
    │
    ▼
React Flow ── renders nodes, edges, minimap, controls
    │
    ▼
NodeInspector ── side panel on node click
```

## 4. Core Data Model (Omni JSON Schema)

All parsers produce the same data structure regardless of source language:

```typescript
interface OmniNode {
  id: string;                        // Normalized file path (forward slashes)
  type: string;                      // e.g. "typescript-file", "nestjs-controller"
  label: string;                     // File basename without extension
  metadata: Record<string, string>;  // filePath, route, etc.
}

interface OmniEdge {
  id: string;       // "e-{source}->{target}"
  source: string;   // Source node ID
  target: string;   // Target node ID
  label: string;    // Relationship type, e.g. "imports"
}

interface OmniGraph {
  nodes: OmniNode[];
  edges: OmniEdge[];
}
```

This is the **contract between parsers and the frontend**. The UI never needs to know which language a node came from.

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
3. No changes needed in server, CLI, or UI

**Current parsers:**
- `TypeScriptParser` — handles `.ts`/`.tsx`, detects NestJS decorators

## 6. Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Monorepo | npm workspaces | Zero extra tooling; native to Node.js |
| CLI | Commander.js | Lightweight, standard Node.js CLI library |
| Server | Express.js | Minimal, well-known, serves both API and static files |
| Rate Limiting | express-rate-limit | Prevents rapid filesystem reads from parsed requests |
| AST Parser (Phase 1) | @typescript-eslint/typescript-estree | Zero native deps, ESTree-compliant (see ADR-001) |
| AST Parser (Phase 2) | Tree-sitter | Universal multi-language AST (see ADR-001) |
| UI Framework | React 18 + Vite | Fast HMR, small bundle |
| Graph Rendering | React Flow | Interactive nodes/edges, minimap, controls, pan/zoom |

## 7. Security Considerations

- **Filesystem access:** The parser reads all non-ignored files under the target path. Rate limiting (30 req/min on `/api/graph`) prevents abuse.
- **Static file serving:** Rate limited at 200 req/min.
- **Local only:** The server binds to localhost. There is no authentication because this is a local developer tool, not a networked service.
- **No code execution:** OmniGraph only reads and parses files. It never executes target code.

## 8. Key Design Decisions

1. **One node per file, not per function/class** — Phase 1 maps file-level dependencies. Method-level granularity is a Phase 3 goal.
2. **Grid layout, not force-directed** — Nodes are positioned in a grid (`(i % 8) * 200, floor(i / 8) * 150`). Auto-layout is a future enhancement.
3. **UI built ahead of time** — The server serves pre-built static files from `packages/ui/dist`. There is no dev server proxy setup.
4. **Types mirrored, not shared** — `OmniGraph`/`OmniNode`/`OmniEdge` are defined in both `packages/parsers/src/types.ts` and `packages/ui/src/types.ts`. This avoids a shared-types package but requires manual sync.
