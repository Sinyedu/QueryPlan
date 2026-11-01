# QueryPlan — Roadmap

## Phase 0 — 4-hour MVP
- [x] Project scaffold, worker boot, SQL execution
- [x] Table schema builder with identifier validation
- [x] Batched deterministic seed generation (up to 10k)
- [x] Results table and error states
- [x] SQLite `EXPLAIN QUERY PLAN` viewer
- [x] Index comparison flow
- [x] Tests, build, README, static deploy configuration (`base: './'`; no host-specific config or CI added)

### Phase 0 — known gaps / unfinished
- [ ] Seeding cannot be canceled mid-run without terminating the worker (clearing the DB); the time budget (60 s) is the only in-worker limit. Stop button exists for queries; during seeding it is not exposed.
- [ ] Only one custom table; no foreign keys; seed value ranges/distributions are fixed per generator.
- [ ] No lint step configured (typecheck + tests + build only).
- [ ] Browser smoke test (`pnpm --filter web e2e`) needs a locally installed Chrome/Edge and is not part of `pnpm test` or CI.
- [ ] Plan tree is an indented list, not an SVG graph. Plan notes are generic per access kind, not per-query educational text.
- [ ] Timings are coarse (browser timer resolution); benchmark is 5 runs in one session, includes row counting, no warm-up discard.
- [ ] Layout checked at desktop width in Chrome only; mobile stacking is by CSS grid and was not manually tested on a device.

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
