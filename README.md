# OmniGraph

A multi-language, AST-driven dependency visualizer for complex codebases.

OmniGraph is a local developer tool that statically analyzes full-stack monorepos and generates an interactive, Obsidian-style dependency graph. It maps out how files, functions, and framework-specific modules (like NestJS controllers or NextJS pages) connect.

## Local Development Setup

1. **Clone the repo and install dependencies:**
   ```bash
   npm install
   ```

2. **Build all packages:**
   ```bash
   npm run build
   ```

3. **Build the frontend visualizer:**
   ```bash
   cd packages/ui && npm run build
   ```

4. **Run the CLI against a target repository:**
   ```bash
   npm run dev -- --path ../my-nestjs-project
   ```
   Or after building:
   ```bash
   node packages/cli/dist/index.js --path /path/to/repo --port 3000
   ```

## How to Add a New Language Parser

OmniGraph is extensible by design. To add support for a new framework:

1. Navigate to `/packages/parsers`.
2. Create a new class implementing the `IParser` interface in `src/IParser.ts`.
3. Write your Tree-sitter queries to extract `OmniNode`s and `OmniEdge`s.
4. Register your parser in `src/parser-registry.ts`.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| CLI / Core | Node.js + TypeScript + Commander |
| Code Parser | @typescript-eslint/typescript-estree |
| Local Server | Express.js |
| Frontend UI | React + Vite |
| Graph Engine | React Flow |

## Omni JSON Schema

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
