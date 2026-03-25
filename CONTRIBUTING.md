# Contributing to OmniGraph

Thank you for your interest in contributing to OmniGraph! This guide will help you get started.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/OmniGraph.git
   cd OmniGraph
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build all packages**:
   ```bash
   npm run build
   ```
5. **Run tests** to make sure everything works:
   ```bash
   npx vitest run
   ```

## Development Workflow

### Project Structure

This is an npm workspaces monorepo with 5 packages. Build order matters:

```
packages/types    → Shared interfaces (build first)
packages/parsers  → Language parsers (depends on types)
packages/server   → Express server (depends on parsers)
packages/cli      → CLI entry point (depends on server)
packages/ui       → React frontend (depends on types, build last)
```

### Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes
3. Build to check for TypeScript errors:
   ```bash
   npm run build
   ```
4. Run all tests:
   ```bash
   npx vitest run
   ```
5. Test manually against a real project:
   ```bash
   npm run dev -- --path ../some-project
   ```

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(parsers): add Go parser with module detection
fix(ui): prevent edge flickering in force layout
test(parsers): add PHP parser edge case tests
docs: update README with new features
chore: update dependencies
```

Scope is typically the package name: `parsers`, `ui`, `server`, `cli`, `types`.

## Adding a New Language Parser

This is one of the best ways to contribute! OmniGraph's plugin architecture makes it straightforward:

### 1. Create the parser file

Create `packages/parsers/src/<language>/<language>-parser.ts`:

```typescript
import { IParser } from '../IParser';
import { OmniGraph, OmniNode, OmniEdge } from '../types';
import * as path from 'path';

export class MyLanguageParser implements IParser {
  canHandle(filePath: string): boolean {
    return /\.ext$/.test(filePath);
  }

  parse(filePath: string, source: string): Partial<OmniGraph> {
    const fileId = filePath.replace(/\\/g, '/');
    const label = path.basename(filePath, path.extname(filePath));
    const edges: OmniEdge[] = [];

    // TODO: Extract imports and create edges
    // TODO: Detect framework patterns and set node type

    const node: OmniNode = {
      id: fileId,
      type: 'mylanguage-file',
      label,
      metadata: { filePath, route: '', language: 'mylanguage' },
    };

    return { nodes: [node], edges };
  }
}
```

### 2. Register it

In `packages/parsers/src/parser-registry.ts`, add:
```typescript
import { MyLanguageParser } from './mylanguage/mylanguage-parser';
const parsers: IParser[] = [..., new MyLanguageParser()];
```

Export it from `packages/parsers/src/index.ts`:
```typescript
export * from './mylanguage/mylanguage-parser';
```

### 3. Add UI colors and labels

In `packages/ui/src/layout/shared.ts`:
```typescript
export const NODE_COLORS: Record<string, string> = {
  ...
  'mylanguage-file': '#hexcolor',
};
```

In `packages/ui/src/components/Sidebar.tsx`:
```typescript
const NODE_TYPE_LABELS: Record<string, string> = {
  ...
  'mylanguage-file': 'MyLanguage',
};
```

### 4. Write tests

Create `packages/parsers/src/__tests__/mylanguage-parser.test.ts` with:
- `canHandle` tests (accepts correct extensions, rejects others)
- Basic file parsing (node type, label, metadata)
- Import/dependency detection (edges)
- Framework detection (if applicable)
- Test fixtures in `packages/parsers/src/__tests__/fixtures/`

### Languages We'd Love to See

- **Go** — `import` statements, module detection
- **Rust** — `use`/`mod` statements, Cargo workspace detection
- **Java** — `import` statements, Spring annotations (`@RestController`, `@Service`)
- **C#** — `using` statements, ASP.NET attributes (`[ApiController]`, `[Route]`)
- **Ruby** — `require`/`require_relative`, Rails conventions (controllers, models)

## Good First Issues

Look for issues labeled [`good first issue`](https://github.com/RMV-Coder/OmniGraph/labels/good%20first%20issue) on GitHub. Some ideas:

- Improve import resolution edge cases
- Add new layout presets
- Add dark/light theme toggle
- Add graph export (SVG, PNG, JSON)
- Improve parser accuracy for multi-line imports

## Submitting a Pull Request

1. Make sure all tests pass: `npx vitest run`
2. Make sure it builds: `npm run build`
3. Push your branch and open a PR against `main`
4. Write a clear PR description explaining what you changed and why
5. Link any related issues

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something useful together.

## Questions?

Open an issue on GitHub or start a discussion. We're happy to help!
