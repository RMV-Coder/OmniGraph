# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OmniGraph?

A local developer tool that statically analyzes codebases and generates an interactive dependency graph. It parses TypeScript/NestJS code (Phase 1) and renders an Obsidian-style visualization using React Flow. Phase 2 will add multi-language support via Tree-sitter.

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
- **packages/parsers** — Core parsing logic. `parser-registry.ts` walks directories recursively, respects `.gitignore`, delegates to registered parsers, and deduplicates nodes. Currently only `TypeScriptParser` is registered (handles `.ts`, `.tsx`, `.js`, `.jsx`).
- **packages/ui** — React + Vite SPA. Fetches `/api/graph`, renders with React Flow. Node colors: red (controller), blue (injectable), orange (module), green (ts-file), yellow (js-file).

### Parser Plugin System

The `IParser` interface (`canHandle(filePath)` + `parse(filePath, source)`) is the extension point. To add a new language:
1. Implement `IParser` in `packages/parsers/src/<language>/`
2. Register the instance in the `parsers` array in `parser-registry.ts`

The core data model is `OmniGraph = { nodes: OmniNode[], edges: OmniEdge[] }` defined in `packages/types/src/index.ts` and re-exported by parsers and UI.

### TypeScript Parser Details

Uses `@typescript-eslint/typescript-estree` for AST parsing (see ADR-001 for rationale). Handles `.ts`/`.tsx`/`.js`/`.jsx` files. Resolves imports by trying extensions (`.ts`, `.tsx`, `.js`, `.jsx`) and index files. Detects NestJS decorators (@Controller, @Injectable, @Module) to set node types and metadata (e.g., route paths).

## Key Constraints

- **Node.js >= 18, npm >= 9** required
- Backend packages use **CommonJS** modules; UI uses **ESNext** (Vite-bundled)
- The UI must be built before the server can serve it (server references `../../ui/dist`)
- TypeScript strict mode is enabled across all packages
