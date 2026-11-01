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
- [ ] Only one custom table; no foreign keys; seed value ranges/distributions are fixed per generator.

## Phase 1 — Strong public beta
- [ ] Multiple tables and foreign keys
- [ ] Seed distributions and reproducible seed settings
- [ ] Saved experiments and optional local persistence
- [ ] Better plan tree and educational descriptions
- [ ] Query benchmark repetitions with clear methodology
- [ ] Shareable experiment definitions without private data

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
