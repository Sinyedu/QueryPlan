# QueryPlan — Architecture

## MVP data flow
React UI -> typed Worker client -> dedicated SQLite Worker -> SQLite WASM in-memory DB -> typed result/plan payload -> UI.

## Suggested layout
```
apps/web/src/
  components/{SchemaBuilder,SeedPanel,SqlEditor,ResultsTable,PlanViewer}.tsx
  db/{engine.ts,sqlite-client.ts,sqlite-worker.ts,protocol.ts}
  domain/{schema.ts,seeding.ts,explain.ts}
  hooks/
  App.tsx
  main.tsx
docs/
AGENTS.md
CLAUDE.md
```
Only add packages or extra workspace apps when real shared code justifies them. A pnpm workspace with one app is acceptable.

## Engine contract
`DatabaseEngine` should expose `initialize`, `execute`, `explain`, `createTable`, `seed`, `reset`, and `dispose`, with typed results and error cases. SQLite adapter first; PostgreSQL adapter later.

## Query plans
SQLite `EXPLAIN QUERY PLAN <query>` yields rows containing id, parent, notused, and detail. Use id/parent relationships; preserve raw details. Do not invent unsupported plan costs or actual per-node timings. SQLite plan output may vary across versions.

## Safety and performance
- Validate/quote identifiers and bind generated values.
- Keep DB work off main thread.
- Batch inserts and transaction-wrap seeding; bound batch sizes and row count.
- Cap returned rows and bytes; don't materialize huge result sets.
- Handle long-running queries by terminating/restarting the worker if necessary.
- Worker reset loses in-memory data; communicate clearly.
- Future PostgreSQL must run in ephemeral isolated environments with quotas, timeouts, least privilege, and no outbound network by default. Never run arbitrary public SQL on a shared privileged database.

## Persistence
MVP: in-memory, refresh clears data. Later: opt-in OPFS where supported, with tested browser deployment headers and graceful fallback; export/import as another future option.

## As built (MVP)
- `db/sqlite-core.ts` holds all SQLite logic (Worker-independent, tested in Node); `sqlite-worker.ts` is a thin dispatcher; `sqlite-client.ts` implements `DatabaseEngine` with request IDs, progress events and a termination watchdog.
- Hang protection: SQLite progress handler (cooperative abort, DB survives) + watchdog worker termination (DB lost).
- `hooks/useLab.ts` owns UI state; components are presentational. `e2e/smoke.mjs` drives the production build in a real browser.

## Phase 1 additions
- The engine contract is schema-wide: `createSchema(tables, replace)` and `seed({ tables, seed })` create and fill all tables in foreign-key dependency order inside one transaction (children deleted first, parents inserted first). Foreign keys are enforced.
- `domain/experiment.ts` is the single trust boundary for saved, imported and shared definitions (`parseExperiment`).
- Benchmark samples are produced inside the worker (`execute` with `repeat`, read-only SELECT/WITH only) so timer resolution matters less.
