# Product Requirements Document (PRD)

**Project:** OmniGraph
**Version:** 2.0.0
**Date:** March 2026
**Status:** Phase 2 — Complete, Phase 3 — In Progress

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
| F15 | Layout Presets | 5 layout algorithms: Directory (grouped by folder), Hierarchical (dagre TB), Force-Directed (live d3-force simulation with drag physics), Grid, Mind Map (dagre LR/RL) | ✅ Done |
| F16 | Export | Export graph as PNG (2x resolution), SVG, or JSON via sidebar buttons using `html-to-image` | ✅ Done |
| F17 | npm Global Install | Publish to npm so users can run `npx omnigraph --path .` without cloning | Not Started |
| F18 | Sidebar Controls | Right sidebar drawer with layout selector, search/filter, and node inspector below a divider — keeps the canvas clean | ✅ Done |
| F19 | Live Force Simulation | Force-directed layout uses a live d3-force simulation with drag-to-push physics — nearby nodes react dynamically when dragging | ✅ Done |
| F20 | Dangling Edge Filtering | Edges whose source or target node doesn't exist are automatically filtered out | ✅ Done |
| F21 | API Debugger | Postman-inspired API client in the sidebar. Click a cross-network edge to auto-fill method + URL, edit headers/params/body, send requests via server proxy (localhost-only SSRF protection), view responses with status, headers, body, and duration. | ✅ Done |
| F22 | Flow Tracer | Cisco Packet Tracer-inspired step-through visualization. Click a cross-network edge to trace the full path: upstream callers → HTTP call → route handler → downstream dependencies. Back/Next navigation with animated node highlighting and edge glow. | ✅ Done |
| F23 | Tabbed Sidebar | Sidebar refactored into three tabs: Graph (controls + inspector), API (debugger), Trace (flow tracer). Width adapts per tab (280px controls, 380px API/trace). | ✅ Done |

## 7. Phase 4 — Future Enhancements

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| F24 | WebSocket Tracing | Detect and visualize WebSocket connections between frontend and backend nodes | Not Started |
| F25 | Database Integration | Detect database queries (MySQL, PostgreSQL, MongoDB) and link them to handler nodes | Not Started |
| F26 | npm Global Install | Publish to npm via esbuild-bundled standalone package. `npm run bundle` produces a `publish/` directory with single-file CLI (12MB, includes typescript-estree), pre-built UI, and ready-to-publish package.json. Users can run `npx omnigraph --path .` without cloning. | ✅ Done |

## 8. Non-Goals

- Runtime analysis (this is purely static/AST-based)
- Replacing IDE features like Go to Definition or Find References
- Cloud deployment or SaaS hosting — OmniGraph runs locally
- Method-level call graphs (operates at the file/class level; method-level is a future goal)

## 8. Success Criteria

- A developer can run `omnigraph --path <any-project>` and see a correct, interactive dependency graph in their browser within seconds
- Adding a new language parser requires only implementing `IParser` and registering it — no changes to server, CLI, or UI
- The tool correctly identifies framework-specific patterns (NestJS controllers, FastAPI routes, Laravel controllers) with their metadata
- Works across TypeScript, JavaScript, Python, and PHP codebases
- Graph is navigable with multiple layout options and searchable by node name/type

## 9. Supported Languages & Frameworks

| Language | Extensions | Frameworks Detected |
|----------|-----------|-------------------|
| TypeScript | `.ts`, `.tsx` | NestJS (`@Controller`, `@Injectable`, `@Module`) |
| JavaScript | `.js`, `.jsx` | — |
| Python | `.py` | FastAPI (`@router.get`, `@app.post`), Flask (`@app.route`), Django (Views, Models) |
| PHP | `.php` | Laravel (Controllers, Models, Middleware, Routes) |

## 10. Architecture Decision Records

| ADR | Decision |
|-----|----------|
| [ADR-001](adr/ADR-001-parsing-engine.md) | Phase 1 uses `typescript-estree` for TypeScript AST; Tree-sitter reserved for future use |
| [ADR-002](adr/ADR-002-phase2-multi-language-parsing.md) | Phase 2 uses regex-based parsing for Python/PHP — zero native deps, sufficient for file-level analysis |
