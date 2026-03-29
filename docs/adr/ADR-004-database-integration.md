# ADR 004: Live Database Integration with PostgreSQL and MongoDB

**Date:** March 2026
**Status:** Accepted

## Context

OmniGraph visualizes how code files connect, but modern applications don't just connect to other files — they connect to databases. Understanding which services, controllers, and models interact with which database tables is critical for system comprehension. Tools like pgAdmin4 (PostgreSQL) and MongoDB Compass provide database inspection, but they are standalone tools with no visibility into code dependencies.

We needed to decide:
1. Whether to only detect database references in code (static analysis) or also connect to live databases
2. Which database engines to support
3. How to architect the connection layer (stateful vs stateless)
4. How to represent database entities in the OmniGraph model

## Decision

Implement **live database connectivity** that allows users to connect to actual PostgreSQL and MongoDB instances directly from OmniGraph's UI. This goes beyond static analysis — OmniGraph becomes a bridge between code structure and data structure.

### Architecture: Stateless Per-Request Connections

The server does **not** maintain persistent connection pools. Each API request (`/api/db/*`) receives connection credentials in the request body, opens a connection, performs the operation, and closes the connection. This keeps the server stateless and avoids connection leak issues.

**Rationale:** OmniGraph is a local dev tool, not a production database proxy. The latency cost of per-request connections (~50-200ms) is negligible for schema introspection and ad-hoc queries. Persistent pooling can be added as an optimization in a future iteration if users report latency issues.

### Driver Selection

| Engine | Driver | Rationale |
|--------|--------|-----------|
| PostgreSQL | `pg` (node-postgres) v8.x | Pure JS, zero native deps, bundles cleanly with esbuild, widely adopted |
| MongoDB | `mongodb` (official driver) v6.x | Pure JS, official support, handles modern MongoDB features |

Both drivers are **pure JavaScript** — no native addons, no build tools required, compatible with esbuild bundling for the npm package.

### Connection Security — Server-Side Session Model

Credentials are **never stored in the browser** (no localStorage, no cookies, no sessionStorage). Instead:

1. **Session tokens**: When a user connects, credentials are sent to the server once via POST. The server stores them in an in-memory `Map` keyed by a cryptographically random token (32 bytes, hex-encoded). The opaque token is returned to the UI.
2. **Token-based requests**: All subsequent API calls (schema, query) send only the token — no credentials. The server looks up the full config from its session store.
3. **Session expiry**: Sessions expire after 1 hour of inactivity. A background interval purges expired sessions every 10 minutes.
4. **Explicit disconnect**: The UI can call `POST /api/db/disconnect` to destroy a session immediately.
5. **localStorage stores metadata only**: Connection name, engine, host, port, database, SSL flag — **never** username or password.
6. **.env auto-detection**: The server scans the target project's `.env` files for `DATABASE_URL`, `MONGODB_URI`, etc. Passwords are read server-side only and never sent to the client. The UI shows detected connections with a "Connect" button that triggers server-side credential resolution.

**Rationale**: Even though OmniGraph is a local tool, storing credentials in localStorage is bad practice — browser extensions, XSS, and physical access can all read localStorage. Server-side sessions provide the same convenience with zero client-side exposure.

### Query Safety

- **PostgreSQL:** User queries are wrapped in `BEGIN READ ONLY` transactions to prevent accidental writes
- **MongoDB:** Only `find` operations are supported; write operations (insert, update, delete) are blocked server-side
- Query results are limited to a configurable max (default 100 rows, max 1000)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/db/connect` | POST | Submit credentials, test connection, receive session token |
| `/api/db/disconnect` | POST | Destroy a session token |
| `/api/db/schema` | POST | Introspect schema using session token |
| `/api/db/query` | POST | Execute a read-only query using session token |
| `/api/db/env` | GET | Auto-detect DB connections from .env files (no credentials in response) |
| `/api/db/env/connect` | POST | Connect using a detected .env connection (server reads password) |

All POST endpoints use POST because they carry tokens or credentials.

## Graph Model

### New Node Types

| Type | Color | Description |
|------|-------|-------------|
| `db-table` | `#336791` (PostgreSQL blue) | PostgreSQL table or view |
| `db-collection` | `#4DB33D` (MongoDB green) | MongoDB collection |

### Node ID Convention

`db://<engine>/<database>/<schema>/<table>` — e.g., `db://postgresql/myapp/public/users`

### Edge Types

| Label | Meaning |
|-------|---------|
| `queries` | Code file references this table/collection (detected by parser or manual) |

### Schema Inference (MongoDB)

MongoDB is schemaless. Schema inference works by sampling documents (default: 100 per collection) and merging field names and types across the sample set. The `$sample` aggregation stage provides random sampling.

## UI Design

A new **"Database" sidebar tab** (5th tab) with three sections:

1. **Connection Manager** — Add/edit/remove/test database connections
2. **Schema Browser** — Tree view of tables/collections with expandable column details
3. **Query Runner** — Textarea for SQL/MongoDB queries with tabular result display

## Consequences

**Positive:**
- Developers can see the complete picture: code → API → database
- Database tables appear as first-class nodes in the graph
- Schema inspection and ad-hoc querying reduce context switching between tools

**Negative:**
- Adds two runtime dependencies (`pg`, `mongodb`) increasing bundle size (~2MB)
- Per-request connections add latency compared to pooled connections
- MongoDB schema inference is approximate (sampling-based)

**Future considerations:**
- MySQL/MariaDB support via `mysql2` driver
- Connection pooling for frequently accessed databases
- Auto-detection of table references in ORM code (TypeORM, Prisma, SQLAlchemy, Eloquent)
- Database migration visualization (detect migration files and show schema evolution)
