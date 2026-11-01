# QueryPlan — Safety model

QueryPlan runs entirely in the visitor's browser: no backend, no accounts, no telemetry. The only "attacker" it needs to
withstand is a user (or a link/file someone sent them) that makes the page misbehave, hang, exhaust memory, or run something
the UI did not announce. The database is the visitor's own in-memory SQLite, so running arbitrary SQL there is a feature.

## What is enforced

| Concern | Control | Where |
| --- | --- | --- |
| SQL injection through our forms | Identifiers validated (`[A-Za-z_][A-Za-z0-9_]*`, ≤ 64, no `sqlite_` prefix) **and** quoted; generated values bound as parameters | `domain/schema.ts`, `sqlite-core.ts` |
| Names that already exist in the DB (created by user SQL) | Escape-only quoting (`quoteExistingName`), never the strict validator; index experiments are disabled for such names | `schema.ts`, `PlanPanel.tsx` |
| Memory exhaustion | 64 MiB page budget; `max_page_count`, `page_size`, heap-limit and similar PRAGMAs are denied by a SQLite authorizer; single values ≤ 5 MB; SQL text ≤ 500 KB | `sqlite-core.ts` (`lockDown`) |
| Reaching outside the sandbox | `ATTACH`/`DETACH` denied and attached-DB limit 0; no extension loading in the WASM build | `sqlite-core.ts` |
| Runaway queries | Progress-handler time budget (database survives), plus a watchdog that terminates the worker (database lost, and the UI says so) | `sqlite-core.ts`, `sqlite-client.ts` |
| Huge results | Rows counted but only 200 materialized; cells truncated at 2,000 chars; blobs shown as `<BLOB n bytes>` | `sqlite-core.ts`, `ResultsTable.tsx` |
| EXPLAIN smuggling | Only the first statement is compiled and stepped, so `SELECT 1; DROP TABLE x` cannot run the second statement | `sqlite-core.ts` |
| Benchmarks mutating data | Repeated/benchmarked statements must be a single statement **and** `sqlite3_stmt_readonly` (a `WITH … DELETE` is refused, including the warm-up run) | `sqlite-core.ts`, `useLab.ts` |
| Untrusted experiments (import, share link, localStorage) | `parseExperiment`: size caps, strict types, enum checks, identifier/schema validation, unknown fields dropped, prototype-pollution safe; loading only fills editors and never runs SQL | `domain/experiment.ts` |
| HTML/script injection | All data is rendered through React text nodes; no `dangerouslySetInnerHTML` anywhere | components |
| Data leaving the browser | Nothing is sent anywhere. Share links keep the definition in the URL fragment, which browsers do not send to servers | `ExperimentsPanel.tsx` |

## Known limits (honest list)

- A hostile **SQL text you choose to run** can still do anything SQLite allows *inside your own in-memory database*
  (drop tables, fill the 64 MiB budget, burn CPU until the time budget). That is by design; Reset restores an empty database.
- The 10 s time budget is cooperative (SQLite progress handler). A hang outside SQLite is only stopped by the watchdog,
  which terminates the worker and clears the database.
- `VACUUM INTO 'file'` is not blocked; it can only write into the WASM in-memory filesystem and is covered by the memory budget.
- Imported experiments can contain arbitrary SQL. It is never auto-run, but read it before pressing Run.
- localStorage is per-origin and readable by any script on the same origin; we store only experiment definitions, never data.
- Checked in Chromium only (see `docs/ROADMAP.md`).

## How it is tested

- `src/domain/safety.test.ts`: identifier fuzzing (2,000 random strings), DDL builders, seeding bounds and determinism,
  experiment/share-link adversarial input (prototype pollution, deep nesting, wrong types, oversize), plan-parser robustness
  (cycles, duplicates, 5,000-node plans, regex backtracking), benchmark helpers.
- `src/db/sqlite-safety.test.ts`: real SQLite with typos, empty input, unicode/NUL bytes, ATTACH, PRAGMA budget lifting, giant
  values and SQL, time budgets, huge result sets, EXPLAIN smuggling, write-behind-`WITH`, hostile identifiers, rollback atomicity.
- `src/db/sqlite-names.test.ts`: tables/columns/indexes created through SQL with awkward names.
- `src/db/sqlite-client.test.ts`: worker protocol, watchdog, cancel, crash, stale replies (fake Worker).
- `e2e/smoke.mjs`: the same classes of input through the real UI in Chrome (HTML in results and experiment names, typos,
  blocked ATTACH/PRAGMA, unusual table names, refused write benchmark, clipboard share link, malicious import).

Run everything with `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web e2e`.
