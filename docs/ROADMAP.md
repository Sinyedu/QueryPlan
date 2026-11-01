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
- [x] CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build, browser smoke test. Not yet observed running on GitHub.
- [x] Benchmark discards one warm-up run before 5 timed runs.
- [x] Mobile: no horizontal overflow at 390px in Chrome (automated); not tested on a physical device.

### Phase 0 — still open
- [ ] Only one custom table; no foreign keys; seed value ranges/distributions are fixed per generator (Phase 1).
- [ ] Plan tree is an indented list, not an SVG graph; plan notes are generic per access kind.
- [ ] Timings remain coarse (browser timer resolution) and include row counting.

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
