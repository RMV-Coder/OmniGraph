# Product Requirements Document (PRD)

**Project:** OmniGraph
**Version:** 1.0.0
**Date:** March 2026
**Status:** Phase 1 — In Progress

## 1. Product Overview

OmniGraph is a local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files, functions, and framework-specific modules (like NestJS controllers or Next.js pages) connect — helping developers onboard onto complex, undocumented codebases.

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
| F1 | CLI Execution | Run `omnigraph --path <repo>` to launch a local web server hosting the graph | Done |
| F2 | TypeScript Parsing | Parse `.ts`/`.tsx` files, extract relative imports as edges | Done |
| F3 | NestJS Decorator Detection | Identify `@Controller`, `@Injectable`, `@Module` decorators and extract route metadata | Done |
| F4 | Interactive Graph UI | 2D node graph with pan, zoom, drag (React Flow) | Done |
| F5 | Node Inspection | Click a node to see file path, type badge, route, and node ID in a side panel | Done |
| F6 | Color-Coded Node Types | Visual distinction between controllers (red), injectables (blue), modules (orange), and generic TS files (green) | Done |
| F7 | Rate Limiting | Prevent filesystem abuse via express-rate-limit on API and static routes | Done |

## 5. Phase 2 — Multi-Language Support

| # | Feature | Description |
|---|---------|-------------|
| F8 | Tree-sitter Integration | Replace typescript-estree with Tree-sitter for universal AST parsing |
| F9 | Python/FastAPI Parser | New `IParser` implementation for Python files with FastAPI decorator detection |
| F10 | PHP/Laravel Parser | New `IParser` implementation for PHP files with Laravel route/controller detection |
| F11 | JavaScript Parser | Extend TypeScript parser or create a dedicated parser for plain `.js`/`.jsx` files |

## 6. Phase 3 — Advanced Features

| # | Feature | Description |
|---|---------|-------------|
| F12 | Cross-Network Tracing | Heuristics to link frontend HTTP calls (e.g., Axios URLs) to backend route handlers |
| F13 | Code Snippets in Inspector | Show raw source code of the selected node in the inspector panel |
| F14 | Search & Filter | Search nodes by name, filter by type, highlight dependency paths |
| F15 | Auto-Layout Algorithms | Hierarchical or force-directed layout instead of grid positioning |
| F16 | Export | Export graph as SVG, PNG, or JSON |
| F17 | npm Global Install | Publish to npm so users can run `npx omnigraph --path .` without cloning |

## 7. Non-Goals

- Runtime analysis (this is purely static/AST-based)
- Replacing IDE features like Go to Definition or Find References
- Cloud deployment or SaaS hosting — OmniGraph runs locally
- Method-level call graphs (Phase 1 operates at the file/class level)

## 8. Success Criteria

- A developer can run `omnigraph --path <any-ts-project>` and see a correct, interactive dependency graph in their browser within seconds
- Adding a new language parser requires only implementing `IParser` and registering it — no changes to server, CLI, or UI
- The tool correctly identifies NestJS controllers, injectables, and modules with their route metadata
