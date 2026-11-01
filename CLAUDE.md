# Claude Code Instructions — QueryPlan

Read `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` before substantial implementation. `AGENTS.md` is the shared engineering source of truth.

## Working style
- Act as a pragmatic senior engineer and pair programmer, not a code generator maximizing output.
- Before implementation, summarize the vertical slice, risks, and files to change.
- Favor a working end-to-end path over many unfinished screens.
- Ask only when a decision materially affects safety or architecture; otherwise choose a simple default and document it.
- Use TypeScript strict mode, explicit data contracts, descriptive names, small modules, and accessible UI.
- Never silently change the agreed stack or add a backend.
- Avoid unnecessary packages, services, ORMs, and state libraries.
- Explain important SQLite-specific behavior in the final summary.

## MVP implementation order
1. Vite React TS app and basic responsive workspace.
2. SQLite WASM initialization inside dedicated Worker; typed message bridge.
3. Query editor and result table with error handling and row cap.
4. Schema builder and SQL identifier safety.
5. Deterministic batched seeding with progress.
6. Actual SQLite `EXPLAIN QUERY PLAN` parser and visual tree/list.
7. Index creation and before/after comparison.
8. Tests, documentation, build, deployment configuration.

## Guardrails
- Use current official `@sqlite.org/sqlite-wasm` documentation. Its Worker1/Promiser APIs are deprecated; initialize SQLite inside your own module worker and communicate using `postMessage`.
- Start with an in-memory database; do not promise persistent OPFS until separately implemented and tested.
- Distinguish `EXPLAIN QUERY PLAN` summary from PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)`.
- Measure actual query elapsed time separately; do not label planner estimates as milliseconds.
- SQLite may select different plans based on statistics, indexes, data shape, and version; do not guarantee an index is used.
- Restrict potentially expensive operations using resource budgets, worker restart, and clear warnings. Do not pretend that a timeout can safely stop synchronous work without terminating the worker.
- Generated schema and data should be local; never transmit them to third parties.

## Definition of done
- `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build` succeed (or explicitly report what could not be run).
- A user can complete: create users table -> seed -> SELECT -> inspect plan -> add email index -> inspect changed plan.
- README explains static deployment, SQLite WASM worker limitations, and future PostgreSQL sandbox.
