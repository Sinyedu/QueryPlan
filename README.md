# QueryPlan

A browser-only SQL laboratory: design a table, seed deterministic synthetic data, run **real SQLite** queries and inspect the **real `EXPLAIN QUERY PLAN`** output, then add an index and compare before/after.

Everything runs in the visitor's browser (SQLite compiled to WebAssembly, inside a dedicated Web Worker). There is no backend, no account, no telemetry; SQL, schemas and data never leave the page.

## Quick start

**New here? Read [`docs/GUIDE.md`](docs/GUIDE.md): how to use the site, a 2-minute tour, and a manual test checklist.**

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

1. Edit the schema: up to 6 tables, typed columns, data generators, optional foreign keys to another table's sequence-filled integer primary key. **Create tables** (parents first).
2. **Seed all tables**: 100–10,000 rows each (30,000 total), deterministic for a chosen seed, optional `skewed` distributions, 500-row batches in one transaction, progress bar.
3. Run SQL (`Ctrl/⌘+Enter`). You choose how many rows to show (default 200, up to 5,000); the true row count and measured elapsed time are always shown.
4. Read the plan as a list or SVG graph (parent/child from SQLite's `id`/`parent`, raw detail strings preserved; click a step for a plain-language note).
5. **Create index & compare** benchmarks the query (1 discarded warm-up, then 5 samples, each the mean of many repeated executions; median reported), creates the index, benchmarks again and shows both plans.

## Architecture

```
React UI ─ hooks/useLab ─ db/sqlite-client (DatabaseEngine) ──postMessage──▶ db/sqlite-worker
                                                                              └─ db/sqlite-core ─ SQLite WASM (:memory:)
domain/  schema (identifiers, foreign keys, DDL) · seeding (PRNG, generators, distributions) · explain (plan parser, notes) · benchmark · experiment (validated import/export) · examples
```

- `apps/web/src/db/engine.ts` — the `DatabaseEngine` interface. SQLite is the only adapter; a future PostgreSQL adapter would implement the same contract against a remote sandbox. Plan payloads are engine-specific and are never compared across engines.
- `db/protocol.ts` — typed request/response messages with request IDs, progress events and structured errors. We use `@sqlite.org/sqlite-wasm` directly in our own module worker (not the deprecated Worker1/Promiser API).
- `db/sqlite-core.ts` — all SQLite logic, independent of `Worker`, so integration tests run it in Node against the real WASM build.

## SQLite-specific behaviour worth knowing

- **`EXPLAIN QUERY PLAN` is a summary**, not PostgreSQL's `EXPLAIN (ANALYZE, FORMAT JSON)`. It has no costs, row estimates or per-node timings, and QueryPlan never invents them. Timings shown are separately measured wall-clock durations in the browser (note: browsers deliberately coarsen `performance.now()`, so sub-millisecond numbers are coarse; compare medians, not single runs).
- **Plans vary** with SQLite version, statistics, indexes and data. An index is never guaranteed to be chosen.
- `INTEGER PRIMARY KEY` is the rowid alias, so lookups by it show `SEARCH … USING INTEGER PRIMARY KEY` without any extra index.
- SQLite is dynamically typed; column types are affinities, not enforced types.
- Seeding **replaces** all listed tables' rows (children deleted first, parents inserted first, one transaction, rolled back on failure). `PRAGMA foreign_keys = ON`, so declared foreign keys are enforced.
- A `skewed` distribution makes a few values very common, which changes how selective an index is, so the same index can help very different amounts.

## Safety, resource limits and worker limitations

Full threat model, controls and test map: [`docs/SECURITY.md`](docs/SECURITY.md).

- Identifiers are validated (`[A-Za-z_][A-Za-z0-9_]*`, ≤ 64 chars, no `sqlite_` prefix) **and** quoted; generated values are bound as parameters. Query text you type is executed as-is (it only touches your own in-memory database).
- Results: you pick the row limit (1–5,000, default 200, remembered in this browser); the table is virtualized so 5,000 rows render only what is on screen. Cells ≤ 2,000 chars and returned data ≤ 8 MB; extra rows are counted but not returned. Seeding is capped at 10,000 rows, ≤ 12 columns, database memory ≤ 64 MiB.
- **Time budget:** a SQLite progress handler aborts statements that exceed 10 s (the database survives). Because WASM SQLite is synchronous, a hard stop is only possible by terminating the worker: the **Stop** button and a watchdog (budget + 3 s) do this, which **clears the in-memory database**. The UI says so.
- **In-memory only.** Refreshing the page clears everything. OPFS persistence is not implemented, so nothing is claimed about it.

## Static deployment

`pnpm build` emits `apps/web/dist` with relative asset paths (`base: './'`), so it works from any static host or sub-path (GitHub Pages, Netlify, Cloudflare Pages, S3). It works on refresh since it is a single page with no client-side routing. No special headers are needed (no `SharedArrayBuffer`/OPFS). The build includes `sqlite3.wasm` (~880 kB, ~410 kB gzipped) and the bundler also emits an unused `sqlite3-worker1` chunk that ships inside the package's entry module; it is never loaded.

## Future PostgreSQL sandbox (not implemented)

PostgreSQL would run only in ephemeral, isolated server-side sandboxes with quotas, statement timeouts, least privilege, no outbound network and rate limits, behind the existing `DatabaseEngine` interface, with a separate JSON-plan adapter (`EXPLAIN (ANALYZE, FORMAT JSON)`). See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.

## License

MIT

## Experiments: save, export, share

An experiment is a definition (schema, row counts, seed, SQL) with **no row data**; data is regenerated from the seed.

- **Save** stores it in this browser's `localStorage`. The database itself is not persisted.
- **Export / Import** use a JSON file. **Copy share link** puts the definition in the URL fragment (`#exp=…`); fragments are not sent to servers.
- Imports and links are treated as untrusted: size limits, strict field and enum checks, identifier validation, unknown fields dropped. Loading only fills the editors; nothing runs until you press the buttons. The SQL in an experiment is arbitrary SQL for your own in-memory database, so read it before running.

## Hardening summary

SQL you type runs only against your own in-memory database, and the app blocks the ways that could hurt the tab or surprise you:
`ATTACH`/`DETACH` and PRAGMAs that lift the memory budget are denied, single values are capped at 5 MB, `EXPLAIN` can never run a second
smuggled statement, and benchmarks refuse anything that is not a single genuinely read-only statement (even a `WITH … DELETE`).
Imported experiments and share links are validated as untrusted input.
