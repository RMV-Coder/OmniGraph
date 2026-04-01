# API Specification

**Project:** OmniGraph
**Version:** 3.0.0
**Base URL:** `http://localhost:{port}` (default port: 4000)

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
| `id` | string | Format: `e-{source}->{target}` for imports, `e-http-*` for HTTP calls, `e-db-*` for code-to-table, `e-fk-*` for foreign keys |
| `source` | string | Source node ID (the file containing the import). |
| `target` | string | Target node ID (the imported file). |
| `label` | string | Relationship type: `"imports"`, `"requires"`, `"links to"`, `"embeds"`, HTTP method+path, or FK column name |

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
| `db-table` | Database | PostgreSQL table | `engine`, `schema`, `columnCount` |
| `db-collection` | Database | MongoDB collection | `engine`, `columnCount` |
| `db-view` | Database | PostgreSQL view | `engine`, `schema`, `columnCount` |
| `method-node` | TypeScript | Expanded method from a file | `filePath`, `kind`, `line`, `endLine` |
| `markdown-file` | Markdown | Default for `.md`/`.mdx` | `filePath`, `tags`, `aliases` |
| `markdown-moc` | Markdown | Map of Content (many outgoing links) | `filePath`, `tags` |
| `markdown-daily` | Markdown | Daily note (date-named file) | `filePath` |
| `markdown-readme` | Markdown | README file | `filePath` |

## CLI Interface

```
Usage: omnigraph [options] [command]

Statically analyze a codebase and visualize its dependency graph

Options:
  -V, --version      Output the version number
  --path <path>      Path to the repository to analyze (default: ".")
  --json             Output results as JSON (machine-readable)
  -h, --help         Display help for command

Commands:
  graph [options]    Query the dependency graph (nodes, edges, deps)
  trace [options]    Trace data flow from a component through API to database
  fetch [options]    Make HTTP requests to API endpoints (like curl/Postman)
  methods [options]  List functions/methods in a file
  schema [options]   Inspect database schema from graph analysis
  serve [options]    Start the OmniGraph visualization server
```

Running `omnigraph --path <repo>` with no subcommand starts the visualization server (backward compatible).

### graph

```
Options:
  --node <id>      Show a specific node and its connections
  --deps <id>      Show transitive dependencies of a node
  --rdeps <id>     Show reverse dependencies (what imports this node)
  --filter <type>  Filter nodes by type (e.g. nextjs-api-route)
  --edges          List all edges instead of nodes
  --depth <n>      Max depth for --deps/--rdeps traversal (default: "3")
  --stats          Show summary statistics only
```

### trace

```
Options:
  --from <file>  Starting file or node ID (required)
  --depth <n>    Max traversal depth (default: "5")
```

### fetch

```
Options:
  --url <url>           Target URL (required)
  --method <method>     HTTP method (default: "GET")
  --header <header...>  Headers in "Key: Value" format (repeatable)
  --body <json>         Request body (JSON string)
  --body-file <path>    Read request body from file
  --env-token <key>     Read auth token from .env and add as Bearer token
  --cookie <cookie>     Cookie header value
  --timeout <ms>        Request timeout in milliseconds (default: "30000")
  --from <file>         Context: which source file triggers this call
```

### methods

```
Options:
  --file <file>  File to analyze (required)
  --exported     Show only exported functions
  --kind <kind>  Filter by kind: function, method, arrow, getter, setter
```

### schema

```
Options:
  --table <name>     Show details for a specific table
  --tables           List all detected database tables
  --fk               Show foreign key relationships
  --columns <table>  Show columns for a table
```

### serve

```
Options:
  --port <port>  Port to run the server on (default: "4000")
```

### JSON Output Mode

All commands support `--json` (global flag) for machine-readable output. Designed for AI coding agents like Claude Code:

```bash
# Structured JSON to stdout, errors as JSON to stderr
omnigraph --path . --json graph --stats
# Output: {"nodes":96,"edges":135,"types":{"typescript-file":66,...}}

omnigraph --path . --json methods --file src/lib/auth.ts
# Output: [{"name":"login","kind":"function","exported":true,"params":["email","password"]},...]
```

## Export Formats

The UI supports three export formats via the sidebar:

### PNG Export
Downloads a 2x resolution PNG image of the current graph viewport. Background color: `#1a1a2e`. Excludes minimap and controls overlay.

### SVG Export
Downloads an SVG of the current graph viewport. Suitable for high-quality prints and further editing in vector graphics tools.

### JSON Export
Downloads the raw `OmniGraph` JSON (nodes + edges) as returned by `/api/graph`. Can be used for further processing, CI integration, or import into other tools.
