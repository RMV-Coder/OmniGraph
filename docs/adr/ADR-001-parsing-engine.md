# ADR 001: Choosing the Parsing Engine

**Date:** March 2026  
**Status:** Accepted

## Context

To visualize code, we need to extract imports, class names, and decorators. Options considered:
1. **Regex** – simple but fragile for nested structures and multi-line imports.
2. **ts-morph** – highly accurate for TypeScript but TypeScript-only, blocking Phase 2 multi-language support.
3. **Tree-sitter** – universal parser supporting almost all languages; requires compiling native C/C++ bindings.
4. **@typescript-eslint/typescript-estree** – TypeScript-specific ESTree-compliant AST parser; zero native dependencies.

## Decision

For **Phase 1 (TypeScript/NestJS)**, we use **`@typescript-eslint/typescript-estree`** as the AST parser inside `TypeScriptParser`.

For **Phase 2 (multi-language)**, each new language parser will use **Tree-sitter** with the appropriate language binding, as Tree-sitter provides a standardized AST interface regardless of the underlying language.

## Rationale

- `@typescript-eslint/typescript-estree` provides a standard ESTree AST for TypeScript with zero native compilation requirements, making it trivial to install.
- The `IParser` interface abstracts the parsing engine away from the rest of the system — swapping to Tree-sitter or any other engine only requires changing the internals of the parser class.
- Tree-sitter is still the target for Phase 2 because it creates a standardized AST regardless of language, enabling a consistent "Transformer" pattern.

## Consequences

- **Positive:** Phase 1 installation is simple — no `node-gyp` compilation required.
- **Positive:** Adding a new language only requires a new class implementing `IParser`.
- **Negative:** The Phase 1 TypeScript parser cannot reuse the same tree-walking code as future Tree-sitter parsers; there is a mild inconsistency between parser implementations.
