# QueryPlan — Roadmap

## Phase 0 — 4-hour MVP
- [x] Project scaffold, worker boot, SQL execution
- [x] Table schema builder with identifier validation
- [x] Batched deterministic seed generation (up to 10k)
- [x] Results table and error states
- [x] SQLite `EXPLAIN QUERY PLAN` viewer
- [x] Index comparison flow
- [x] Tests, build, README, static deploy configuration (`base: './'`; no host-specific deploy config)

### Phase 0 — gaps closed
- [x] Stop button during seeding (terminates the worker, clears the in-memory DB; confirmed in UI). The query Stop path is verified in the browser; the seed Stop uses the same client code but is not browser-tested because seeding finishes too fast to click.
- [x] Lint (ESLint + typescript-eslint + react-hooks) via `pnpm lint`.
- [x] CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build, browser smoke test. Ran green on GitHub for PR #2.
- [x] Benchmark discards one warm-up run before 5 timed runs.
- [x] Mobile: no horizontal overflow at 390px in Chrome (automated); not tested on a physical device.

### Phase 0 — stage 2
- [x] SVG plan graph (left-to-right tree, keyboard-focusable nodes) alongside the list view, with a List/Graph toggle.
- [x] Per-step notes derived from each step's own detail text (table, index, constraint columns); no cost or speed claims.
- [x] Finer timings: the benchmark sizes a repeat count from its warm-up run, then each of the 5 samples is the mean of N executions (up to 200). Row iteration is deliberately included, since that is what a client pays; the UI states this.
- [ ] Graph view was checked by an automated browser test, not reviewed visually across browsers or on a phone.

### Phase 0 — handed to Phase 1
- [x] Multiple tables, foreign keys and seed distributions (delivered in Phase 1 below).

## Phase 1 — Strong public beta
- [x] Multiple tables and foreign keys. Up to 6 tables; a foreign key must reference another table's INTEGER PRIMARY KEY filled by the `sequence` generator (so seeded parent keys are exactly 1..N); no composite keys or ON DELETE/UPDATE actions; cycles are rejected. `PRAGMA foreign_keys = ON`, so FKs are enforced. Schema creation and seeding run in dependency order (parents first on insert, children first on delete) in one transaction; at most 30,000 rows in total.
- [x] Seed distributions and reproducible seed settings. Editable seed (saved with experiments); per-column `uniform` or `skewed` distribution for `integer`, `word`, `city` and foreign-key columns. Dates, decimals, names and emails have no distribution option. Each table derives its own seed from (seed, table name).
- [x] Saved experiments. Definitions (schema, row counts, seed, SQL) are stored in `localStorage` and re-validated on load.
  - [ ] Persisting the database itself (OPFS) is NOT implemented: refresh still clears all data. Experiments regenerate it from the seed.
- [x] Better plan tree and educational descriptions. Plan-level reading hints (nested-loop joins, inner full scans, automatic indexes, temp structures) and extra per-step notes (automatic index, subqueries, co-routines, multi-index OR, compound queries). These are text heuristics over SQLite's plan rows, verified against tests and the join example only; unusual plans fall back to the raw detail text.
- [x] Query benchmark repetitions with clear methodology. Selectable sample count (3/5/10/20), a visible methodology section, and an environment line (browser, SQLite version, WASM/Worker/in-memory).
- [x] Shareable experiment definitions without private data. JSON export/import and a `#exp=` link; imports and links are validated as untrusted input (size caps, enum checks, schema validation, unknown fields dropped) and only load into the editors, never auto-run SQL.
  - [ ] Long share links can exceed URL length limits in some chat apps/browsers; export a file for large definitions.
  - [ ] SQL inside an imported experiment runs only when the user presses Run, but it is still arbitrary SQL against the user's own in-memory database; review it before running.

### Visual designer (separate Designer view)
- [x] A **Lab | Designer** switch in the header. The Designer shows a full-size diagram: draggable table cards, column rows with PK/FK badges, curved relationship lines with 1 / N markers, an auto-arrange button, and a relationship list.
- [x] Drag from the dot on a column to another table's primary-key row to make a foreign key; valid targets highlight while dragging. A remove button sits on every line.
- [x] Edits keep the schema consistent: renaming a table or primary-key column updates foreign keys that point at it, removing a table detaches its children, and connections that would form a cycle, self-references and non-key targets are refused with a message.
- [x] The diagram and the schema form edit the same state, and the selected table is shared; switching views loses nothing.
- [ ] Card positions are not saved in experiments, exports or share links; they reset to the auto layout when an experiment is loaded.
- [ ] No column editing directly on the cards (use the form beside the diagram) and no zoom/pan beyond scrolling.
- [ ] Connecting by dragging is pointer-only. The keyboard path is the "references" menu in the schema form. Touch uses pointer events but is untested on real touch hardware.
- [ ] Only many-to-one links to a sequence-filled integer primary key (no many-to-many, composite or ON DELETE settings). Changing a referenced primary key's generator shows a validation message rather than rewriting the links.

### Results display
- [x] User-chosen row limit (1-5,000, default 200, persisted in localStorage) with an engine-enforced ceiling of 5,000, an 8 MB returned-data budget, and a virtualized results table (only visible rows are in the DOM). Benchmarks and DDL request no rows.
- [ ] Columns have a fixed minimum width and single-line cells; no column resizing or wrapped cell view yet.
- [ ] Virtualization was verified with Chrome only; scroll feel on touch devices is untested.

### Hardening pass
- [x] Adversarial and edge-case test suites (domain fuzzing, hostile SQL against real SQLite, worker-client fault injection, UI-level injection checks). They found and fixed: EXPLAIN executing trailing statements, `WITH … DELETE` passing the benchmark guard, user SQL lifting the memory budget, unlimited value/SQL size, ATTACH, schema refresh breaking on awkward table names, a bogus plan error after DDL, a TypeError on generator names like `__proto__`, plan parsing of cyclic/duplicate rows and stack overflow on very deep plans, and a NaN repeat count.
- [ ] Safety behaviour is verified in Chromium only; Firefox/Safari WASM and authorizer behaviour are untested.
- [ ] No fuzzing of the SQL parser itself (we rely on SQLite's limits and the authorizer).

### Phase 1 — known gaps
- [ ] The multi-table UI and experiments panel were checked by an automated Chrome test and at one desktop viewport; not reviewed on a phone or in Firefox/Safari.
- [ ] Index experiment supports 1–2 column indexes only (no unique, partial or expression indexes).
- [ ] Join benchmarks run the SQL as typed; there is no query rewriting helper.

## Phase 2 — PostgreSQL mode
- [ ] Dedicated backend API and isolated ephemeral PostgreSQL sandboxes
- [ ] SQL execution quotas, timeouts, connection caps, rate limits, no public outbound network
- [ ] PostgreSQL JSON plan adapter; estimated vs actual plan distinctions
- [ ] Engine-aware comparison; no direct comparison of arbitrary cost units
- [ ] Cleanup/expiry and abuse monitoring

## Phase 3 — Educational challenges
- [ ] Guided indexing challenges
- [ ] Query rewrites and before/after results
- [ ] Lesson catalog and performance explanations
