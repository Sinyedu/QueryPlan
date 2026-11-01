# QueryPlan — Agent Instructions

## Mission
Build a public, browser-first SQL laboratory: design tables, seed synthetic data, run real SQLite queries, and inspect real execution plans. PostgreSQL is a future isolated backend, not part of the initial MVP.

## Stack
- pnpm workspace; Node.js 22; React, TypeScript, Vite, Tailwind CSS.
- `@sqlite.org/sqlite-wasm` in a dedicated Web Worker with a small custom message protocol; do not use deprecated Worker1/Promiser APIs.
- SQLite `EXPLAIN QUERY PLAN` for actual planner output. Never invent costs or timings.
- Minimal dependencies; use native SVG for initial plan trees. Add a graph library only if justified.

## Non-negotiables
- Use pnpm, not npm or yarn. Prefer fetch over axios. Avoid unnecessary dependencies.
- Keep TS/TSX files near or below 150 lines where practical. Split by responsibility, not arbitrary abstractions.
- No backend or user accounts in phase 1; no external telemetry; browser data stays local.
- Never send user SQL, schemas, or data to a remote service.
- SQLite and PostgreSQL explain plans are engine-specific. Do not compare their cost units as equivalent.
- Browser SQLite is a real database, not a mock. Label simulations and example data clearly.
- SQL identifiers must be validated and quoted; values must be bound as parameters.
- Seed in batches within transactions; provide progress, cancellation strategy, and size caps.
- Limit rendered query rows (e.g. 200) independently from database row count; display truncation.
- Prevent hangs using a worker timeout/restart strategy and SQLite progress/interrupt facilities if available. A restarted worker may lose an in-memory session; explain this.
- Do not claim persistence unless tested. Prefer in-memory SQLite for MVP; optional OPFS later with capability checks and correct deployment headers.
- Avoid storing secrets. Treat imports as untrusted. No HTML injection from SQL results.
- All controls must work. Never replace real execution with hard-coded responses.

## Code architecture
- UI components: editor, schema builder, seeder, results table, plan viewer.
- Domain: schema validation, seed generators, plan parsing, timing/benchmark logic.
- Engine: `DatabaseEngine` interface, SQLite adapter, worker client, worker implementation.
- Future PostgreSQL adapter must not leak into SQLite-only implementation.
- Typed worker requests and responses with request IDs and structured errors.

## Testing
- Unit: identifier quoting, schema validation, deterministic seed generation, plan parsing, row limits.
- Integration: create table -> seed -> query -> explain -> create index -> explain again.
- Browser smoke: worker initialization, no console errors, query execution, visible plan.
- Benchmark timing must state browser/environment and distinguish elapsed time from SQLite planner estimates.

## Workflow
1. Inspect existing files and package versions before editing.
2. Write a brief implementation plan and MVP acceptance criteria.
3. Implement smallest vertical slice end-to-end.
4. Run typecheck, lint, tests, and build after meaningful changes.
5. Summarize changed files, limitations, and next steps. Never claim tests ran if they did not.
6. Keep README, architecture notes, and task checklist current.

## MVP acceptance criteria
- Visitor can create one custom table with typed columns.
- Visitor can seed 100–10,000 deterministic synthetic rows.
- Visitor can run arbitrary SQLite SQL within browser worker and see results/errors.
- Visitor can inspect real `EXPLAIN QUERY PLAN` rows for a SELECT.
- Visitor can create an index and compare before/after plans.
- App builds as a static deployable site and works on refresh.
