# API Specification

**Project:** OmniGraph
**Version:** 2.0.0
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
      "id": "C:/path/to/repo/app/routers/users.py",
      "type": "python-fastapi-route",
      "label": "users",
      "metadata": {
        "filePath": "C:\\path\\to\\repo\\app\\routers\\users.py",
        "route": "GET /users, POST /users",
        "language": "python",
        "framework": "fastapi",
        "functions": "list_users, create_user"
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

### GET /api/file

Returns the raw source content of a single file within the analyzed repository. Used by the node inspector to display code snippets.

**Rate Limit:** 30 requests per minute (per IP, shared with `/api/graph`)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute file path to read |

**Security:**
- The resolved path must be within the target directory (path traversal is rejected with 403)
- Files larger than 1MB are rejected with 413
- Only files (not directories) are served

**Response (200 OK):**

```json
{
  "path": "C:\\path\\to\\repo\\src\\users\\users.controller.ts",
  "content": "import { Controller } from '@nestjs/common';\n\n@Controller('/users')\nexport class UsersController {\n  // ...\n}\n",
  "lines": 6,
  "size": 128
}
```

**Response (400 Bad Request):** Missing `path` parameter
```json
{ "error": "Missing \"path\" query parameter" }
```

**Response (403 Forbidden):** Path outside target directory
```json
{ "error": "Path is outside the analyzed directory" }
```

**Response (404 Not Found):** File does not exist
```json
{ "error": "File not found" }
```

**Response (413 Payload Too Large):** File exceeds 1MB
```json
{ "error": "File too large (max 1MB)" }
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
| `metadata` | object | Key-value pairs. Always includes `filePath`. Other fields vary by parser. |

### OmniEdge

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Format: `e-{source}->{target}` |
| `source` | string | Source node ID (the file containing the import). |
| `target` | string | Target node ID (the imported file). |
| `label` | string | Relationship type: `"imports"` or `"requires"`. |

### Node Types

| Type | Language | Trigger | Metadata |
|------|----------|---------|----------|
| `typescript-file` | TypeScript | Default for `.ts`/`.tsx` | `filePath`, `route` |
| `javascript-file` | JavaScript | Default for `.js`/`.jsx` | `filePath`, `route` |
| `nestjs-controller` | TypeScript | `@Controller()` decorator | `filePath`, `route` (from decorator arg) |
| `nestjs-injectable` | TypeScript | `@Injectable()` decorator | `filePath`, `route` |
| `nestjs-module` | TypeScript | `@Module()` decorator | `filePath`, `route` |
| `python-file` | Python | Default for `.py` | `filePath`, `route`, `language`, `classes`, `functions` |
| `python-fastapi-route` | Python | `@router.get()` etc. | `filePath`, `route`, `language`, `framework`, `functions` |
| `python-django-view` | Python | Class extends `View`/`APIView` | `filePath`, `route`, `language`, `framework`, `classes` |
| `python-django-model` | Python | Class extends `Model` | `filePath`, `route`, `language`, `framework`, `classes` |
| `php-file` | PHP | Default for `.php` | `filePath`, `route`, `language`, `namespace`, `classes`, `methods` |
| `php-laravel-controller` | PHP | `extends Controller` | `filePath`, `route`, `language`, `framework`, `namespace`, `classes`, `methods` |
| `php-laravel-model` | PHP | `extends Model` | `filePath`, `route`, `language`, `framework`, `namespace`, `classes` |
| `php-laravel-middleware` | PHP | `extends Middleware` | `filePath`, `route`, `language`, `framework`, `namespace`, `classes` |
| `php-laravel-route` | PHP | Route file with `Route::` calls | `filePath`, `route`, `language`, `framework` |

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

## Export Formats

The UI supports three export formats via the sidebar:

### PNG Export
Downloads a 2x resolution PNG image of the current graph viewport. Background color: `#1a1a2e`. Excludes minimap and controls overlay.

### SVG Export
Downloads an SVG of the current graph viewport. Suitable for high-quality prints and further editing in vector graphics tools.

### JSON Export
Downloads the raw `OmniGraph` JSON (nodes + edges) as returned by `/api/graph`. Can be used for further processing, CI integration, or import into other tools.
