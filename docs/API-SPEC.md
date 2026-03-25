# API Specification

**Project:** OmniGraph
**Version:** 1.0.0
**Base URL:** `http://localhost:{port}` (default port: 3000)

## Endpoints

### GET /api/graph

Returns the full dependency graph for the analyzed repository.

**Rate Limit:** 30 requests per minute (per IP)

**Request:** No parameters. The target repository path is set at server startup via the CLI `--path` flag.

**Response (200 OK):**

```json
{
  "nodes": [
    {
      "id": "C:/path/to/repo/src/users/users.controller.ts",
      "type": "nestjs-controller",
      "label": "users.controller",
      "metadata": {
        "filePath": "C:\\path\\to\\repo\\src\\users\\users.controller.ts",
        "route": "/users"
      }
    },
    {
      "id": "C:/path/to/repo/src/users/users.service.ts",
      "type": "nestjs-injectable",
      "label": "users.service",
      "metadata": {
        "filePath": "C:\\path\\to\\repo\\src\\users\\users.service.ts",
        "route": ""
      }
    }
  ],
  "edges": [
    {
      "id": "e-C:/path/to/repo/src/users/users.controller.ts->C:/path/to/repo/src/users/users.service.ts",
      "source": "C:/path/to/repo/src/users/users.controller.ts",
      "target": "C:/path/to/repo/src/users/users.service.ts",
      "label": "imports"
    }
  ]
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Error: ENOENT: no such file or directory, scandir '/nonexistent/path'"
}
```

### GET * (SPA Fallback)

Serves the built React UI from `packages/ui/dist`. Any path not matching `/api/*` returns `index.html` for client-side routing.

**Rate Limit:** 200 requests per minute (per IP)

**Static assets** (JS, CSS, images) are served via `express.static` without rate limiting.

## Data Types

### OmniNode

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Normalized file path with forward slashes. Unique identifier. |
| `type` | string | Node classification. See Node Types below. |
| `label` | string | File basename without extension (e.g., `users.controller`). |
| `metadata` | object | Key-value pairs. Always includes `filePath` and `route`. |

### OmniEdge

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Format: `e-{source}->{target}` |
| `source` | string | Source node ID (the file containing the import). |
| `target` | string | Target node ID (the imported file). Resolved with `.ts` extension if missing. |
| `label` | string | Relationship type. Currently always `"imports"`. |

### Node Types (Phase 1)

| Type | Trigger | Metadata |
|------|---------|----------|
| `typescript-file` | Default for any `.ts`/`.tsx` file | `filePath`, `route: ""` |
| `nestjs-controller` | Class with `@Controller()` decorator | `filePath`, `route` (from decorator argument) |
| `nestjs-injectable` | Class with `@Injectable()` decorator | `filePath`, `route: ""` |
| `nestjs-module` | Class with `@Module()` decorator | `filePath`, `route: ""` |

## CLI Interface

```
Usage: omnigraph [options]

Statically analyze a codebase and visualize its dependency graph

Options:
  --path <path>   Path to the repository to analyze (required)
  --port <port>   Port to run the server on (default: "3000")
  -V, --version   Output the version number
  -h, --help      Display help for command
```
