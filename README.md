# QueryPlan

A browser-only SQL laboratory: design a table, seed deterministic synthetic data, run **real SQLite** queries and inspect the **real `EXPLAIN QUERY PLAN`** output, then add an index and compare before/after.

Everything runs in the visitor's browser (SQLite compiled to WebAssembly, inside a dedicated Web Worker). There is no backend, no account, no telemetry; SQL, schemas and data never leave the page.

## Quick start

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm test         # unit + SQLite integration tests (Vitest, Node)
pnpm build        # static site in apps/web/dist
pnpm --filter web e2e   # optional: real-browser smoke test (needs Chrome or Edge installed)
```

## The journey (or press "▶ Guided example")

1. Edit the `users` table (names, types, data generators) and **Create table**.
2. **Seed** 100–10,000 rows (deterministic, seed 42, 500-row batches in one transaction, progress bar).
3. Run SQL (`Ctrl/⌘+Enter`). Results are capped at 200 rendered rows; the true row count and measured elapsed time are shown.
4. Read the plan tree (parent/child from SQLite's `id`/`parent`, raw detail strings preserved; click a step for a plain-language note).
5. **Create index & compare** benchmarks the query (1 discarded warm-up + 5 timed runs, median), creates the index, benchmarks again and shows both plans.

## Architecture

```
React UI ─ hooks/useLab ─ db/sqlite-client (DatabaseEngine) ──postMessage──▶ db/sqlite-worker
                                                                              └─ db/sqlite-core ─ SQLite WASM (:memory:)
domain/  schema (identifier validation/quoting, DDL) · seeding (PRNG + generators) · explain (plan parser) · benchmark
```

- `apps/web/src/db/engine.ts` — the `DatabaseEngine` interface. SQLite is the only adapter; a future PostgreSQL adapter would implement the same contract against a remote sandbox. Plan payloads are engine-specific and are never compared across engines.
- `db/protocol.ts` — typed request/response messages with request IDs, progress events and structured errors. We use `@sqlite.org/sqlite-wasm` directly in our own module worker (not the deprecated Worker1/Promiser API).
- `db/sqlite-core.ts` — all SQLite logic, independent of `Worker`, so integration tests run it in Node against the real WASM build.

## SQLite-specific behaviour worth knowing

- **`EXPLAIN QUERY PLAN` is a summary**, not PostgreSQL's `EXPLAIN (ANALYZE, FORMAT JSON)`. It has no costs, row estimates or per-node timings, and QueryPlan never invents them. Timings shown are separately measured wall-clock durations in the browser (note: browsers deliberately coarsen `performance.now()`, so sub-millisecond numbers are coarse; compare medians, not single runs).
- **Plans vary** with SQLite version, statistics, indexes and data. An index is never guaranteed to be chosen.
- `INTEGER PRIMARY KEY` is the rowid alias, so lookups by it show `SEARCH … USING INTEGER PRIMARY KEY` without any extra index.
- SQLite is dynamically typed; column types are affinities, not enforced types.
- Seeding **replaces** the table's rows (`DELETE` + inserts in one transaction, rolled back on failure).

## Safety, resource limits and worker limitations

- Identifiers are validated (`[A-Za-z_][A-Za-z0-9_]*`, ≤ 64 chars, no `sqlite_` prefix) **and** quoted; generated values are bound as parameters. Query text you type is executed as-is (it only touches your own in-memory database).
- Results: ≤ 200 rows rendered, cells ≤ 2,000 chars; extra rows are counted but not materialized. Seeding is capped at 10,000 rows, ≤ 12 columns, database memory ≤ 64 MiB.
- **Time budget:** a SQLite progress handler aborts statements that exceed 10 s (the database survives). Because WASM SQLite is synchronous, a hard stop is only possible by terminating the worker: the **Stop** button and a watchdog (budget + 3 s) do this, which **clears the in-memory database**. The UI says so.
- **In-memory only.** Refreshing the page clears everything. OPFS persistence is not implemented, so nothing is claimed about it.

## Static deployment

`pnpm build` emits `apps/web/dist` with relative asset paths (`base: './'`), so it works from any static host or sub-path (GitHub Pages, Netlify, Cloudflare Pages, S3). It works on refresh since it is a single page with no client-side routing. No special headers are needed (no `SharedArrayBuffer`/OPFS). The build includes `sqlite3.wasm` (~880 kB, ~410 kB gzipped) and the bundler also emits an unused `sqlite3-worker1` chunk that ships inside the package's entry module; it is never loaded.

## Future PostgreSQL sandbox (not implemented)

PostgreSQL would run only in ephemeral, isolated server-side sandboxes with quotas, statement timeouts, least privilege, no outbound network and rate limits, behind the existing `DatabaseEngine` interface, with a separate JSON-plan adapter (`EXPLAIN (ANALYZE, FORMAT JSON)`). See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.

## License

MIT
