# OmniGraph

A multi-language, AST-driven dependency visualizer for complex codebases.

OmniGraph is a local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files, functions, and framework-specific modules (like NestJS controllers or Next.js pages) connect.

## Quick Start

**Prerequisites:** Node.js >= 18, npm >= 9

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build the frontend
cd packages/ui && npm run build && cd ../..

# Analyze a repository
npm run dev -- --path ../my-nestjs-project
```

Then open `http://localhost:3000` in your browser.

### CLI Options

```
omnigraph --path <repo-path>          # Required: path to analyze
omnigraph --path <repo-path> --port 4000  # Optional: custom port (default 3000)
```

## What It Does

- Parses TypeScript/TSX files and extracts import relationships as graph edges
- Detects NestJS decorators (`@Controller`, `@Injectable`, `@Module`) and classifies nodes by type
- Renders an interactive graph with pan, zoom, drag, minimap, and node inspection
- Color-codes nodes: red (controller), blue (injectable), orange (module), green (TS file)

## How to Add a New Language Parser

OmniGraph is extensible by design. To add support for a new language or framework:

1. Navigate to `packages/parsers/src/`
2. Create a new class implementing the `IParser` interface from `src/IParser.ts`
3. Implement `canHandle(filePath)` to match your file extensions
4. Implement `parse(filePath, source)` to return `{ nodes, edges }` in the OmniGraph format
5. Register your parser instance in the `parsers` array in `src/parser-registry.ts`

No changes to the server, CLI, or UI are needed — the plugin architecture handles the rest.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| CLI / Core | Node.js + TypeScript + Commander |
| Code Parser (Phase 1) | @typescript-eslint/typescript-estree |
| Code Parser (Phase 2) | Tree-sitter (planned) |
| Local Server | Express.js |
| Frontend UI | React + Vite |
| Graph Engine | React Flow |

## Omni JSON Schema

The backend converts all parsed code into this standardized structure:

```json
{
  "nodes": [
    {
      "id": "src/users/users.controller.ts",
      "type": "nestjs-controller",
      "label": "UsersController",
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

## Project Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements, features, and roadmap |
| [SAD](docs/SAD.md) | Software architecture, data flow, and design decisions |
| [ADR-001](docs/adr/ADR-001-parsing-engine.md) | Why typescript-estree (Phase 1) and Tree-sitter (Phase 2) |
| [API Spec](docs/API-SPEC.md) | HTTP endpoint and CLI interface documentation |
