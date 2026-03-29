# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OmniGraph?

A local developer tool that statically analyzes codebases and generates an interactive dependency graph. It parses TypeScript/NestJS, Python/FastAPI/Django, and PHP/Laravel code and renders an Obsidian-style visualization using React Flow.

## Build & Run Commands

```bash
npm install                  # Install all workspace dependencies
npm run build                # Build all packages (cli, server, parsers, ui)
cd packages/ui && npm run build  # Build frontend separately (required before serving)
npm run dev -- --path ../my-project  # Run against a target repo (port 3000 default)
```

Individual package builds use `tsc` (types, cli, server, parsers) or `tsc && vite build` (ui). Build order matters: types must build before parsers/ui.

## Architecture

**Monorepo with npm workspaces** — five packages with a strict dependency chain:

```
CLI (@omnigraph/cli) → Server (@omnigraph/server) → Parsers (@omnigraph/parsers) → Types (@omnigraph/types)
                       Server also serves → UI (@omnigraph/ui) as static files      UI also uses → Types
```

**Data flow:** Filesystem → AST parsing → OmniGraph model (nodes/edges) → JSON API (`/api/graph`) → React Flow UI

### Packages

- **packages/types** — Shared `OmniNode`, `OmniEdge`, `OmniGraph` interfaces. Must build first.
- **packages/cli** — Commander.js entry point. Accepts `--path` (required) and `--port` (optional). Calls `createServer()` from server package.
- **packages/server** — Express app with two routes: `GET /api/graph` (rate-limited 30 req/min) calls `parseDirectory()`, and `GET *` serves the built UI (rate-limited 200 req/min) from `../../ui/dist`.
- **packages/parsers** — Core parsing logic. `parser-registry.ts` walks directories recursively, respects `.gitignore`, delegates to registered parsers, and deduplicates nodes. Four parsers registered: `TypeScriptParser` (`.ts`/`.tsx`/`.js`/`.jsx`), `PythonParser` (`.py`), `PhpParser` (`.php`), `MarkdownParser` (`.md`/`.mdx`).
- **packages/ui** — React + Vite SPA. Fetches `/api/graph`, renders with React Flow. Four sidebar tabs (Graph, API, Trace, Settings). Node colors per type: red (controller), blue (injectable), orange (module), green (ts-file), yellow (js-file), blue (python), teal (FastAPI), dark-green (Django view), purple (PHP/Markdown), red (Laravel). Export: PNG, SVG, JSON, animated GIF.

### Parser Plugin System

The `IParser` interface (`canHandle(filePath)` + `parse(filePath, source)`) is the extension point. To add a new language:
1. Implement `IParser` in `packages/parsers/src/<language>/`
2. Register the instance in the `parsers` array in `parser-registry.ts`

The core data model is `OmniGraph = { nodes: OmniNode[], edges: OmniEdge[] }` defined in `packages/types/src/index.ts` and re-exported by parsers and UI.

### Parser Details

**TypeScript Parser** — Uses `@typescript-eslint/typescript-estree` for AST parsing (see ADR-001). Handles `.ts`/`.tsx`/`.js`/`.jsx` files. Resolves imports by trying extensions and index files. Detects NestJS decorators (@Controller, @Injectable, @Module) to set node types and metadata.

**Python Parser** — Regex-based parsing for `.py` files. Detects FastAPI/Flask route decorators (@app.get, @router.post, etc.), Django class-based views (extends View/APIView/ViewSet), and Django models. Resolves relative and absolute Python imports using package `__init__.py` conventions.

**PHP Parser** — Regex-based parsing for `.php` files. Detects Laravel controllers (extends Controller), models (extends Model/Eloquent), middleware, and route definitions (Route::get, etc.). Resolves `use` statements via PSR-4 conventions and `require`/`include` statements.

**Markdown Parser** — Regex-based parsing for `.md`/`.mdx` files. Detects Obsidian wiki-links (`[[Page]]`), embeds (`![[Page]]`), standard markdown links, and YAML frontmatter (tags, aliases). Vault-wide BFS resolution for wiki-links (see ADR-003). Node types: `markdown-file`, `markdown-moc`, `markdown-daily`, `markdown-readme`.

## Key Constraints

- **Node.js >= 18, npm >= 9** required
- Backend packages use **CommonJS** modules; UI uses **ESNext** (Vite-bundled)
- The UI must be built before the server can serve it (server references `../../ui/dist`)
- TypeScript strict mode is enabled across all packages
