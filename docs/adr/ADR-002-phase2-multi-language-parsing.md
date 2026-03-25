# ADR 002: Phase 2 Multi-Language Parsing Strategy

**Date:** March 2026
**Status:** Accepted

## Context

Phase 2 requires adding Python and PHP support to the dependency graph. ADR-001 proposed Tree-sitter as the universal parsing engine for Phase 2. After evaluation, we needed to decide between:

1. **Tree-sitter (native `tree-sitter` npm package)** — Requires `node-gyp` and C/C++ compilation toolchain. Platform-specific binary compilation can fail on developer machines without build tools.
2. **Tree-sitter WASM (`web-tree-sitter`)** — No native compilation, but async initialization requires changing the synchronous `IParser` interface and all downstream code.
3. **Regex-based parsing** — No additional dependencies, synchronous, works on all platforms. Sufficient for file-level dependency analysis (imports, class definitions, decorators).

## Decision

For Phase 2, we use **regex-based parsing** for Python and PHP parsers. The `IParser` interface remains synchronous and unchanged.

## Rationale

- **File-level granularity** — OmniGraph currently builds a file-level dependency graph (one node per file). For this level of analysis, we only need to extract: (1) import/require statements, (2) class definitions with inheritance, and (3) framework-specific decorators/annotations. These constructs have highly regular syntax in Python and PHP that regex handles reliably.
- **Zero additional dependencies** — No native compilation, no WASM loading, no platform-specific issues. Installation remains `npm install`.
- **Interface stability** — The synchronous `IParser` interface (`canHandle` + `parse`) doesn't need to change, preserving backward compatibility with the existing TypeScript parser and server integration.
- **The `IParser` abstraction protects us** — Per ADR-001, the parser interface abstracts the parsing engine. If we later need deeper AST analysis (e.g., function-level granularity in Phase 3), we can swap regex internals for Tree-sitter inside each parser class without changing the rest of the system.

## Consequences

- **Positive:** Zero new native dependencies; installation stays simple across all platforms.
- **Positive:** All parsers share the same synchronous `IParser` contract.
- **Positive:** Python and PHP parsers are lightweight (~200 lines each) and easy to understand/extend.
- **Negative:** Regex parsing may miss edge cases (e.g., multi-line import statements, imports inside conditional blocks, dynamically computed imports). This is acceptable for file-level dependency visualization.
- **Negative:** If Phase 3 requires method-level or expression-level analysis, we'll need to upgrade to a proper AST engine (Tree-sitter or language-specific parsers).

## Migration Path

To upgrade a parser to Tree-sitter in the future:
1. Install `web-tree-sitter` and the language WASM grammar
2. Add an optional async `init()` method to `IParser` for one-time parser initialization
3. Replace regex patterns inside the parser class with Tree-sitter AST queries
4. No changes needed in the server, CLI, UI, or parser registry
