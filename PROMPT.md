# Claude Code — Build QueryPlan

You are implementing QueryPlan, a public, browser-first SQL execution laboratory and educational query planner visualizer.

Read `AGENTS.md`, `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` first. Treat them as authoritative and reconcile any contradictions before coding.

## Objective
Deliver the smallest impressive, fully functional, static-deployable MVP in roughly four focused hours. Do not build a mockup: SQLite must really execute queries inside the visitor's browser.

## Stack
Use pnpm, Node 22, React, TypeScript strict, Vite, Tailwind, and `@sqlite.org/sqlite-wasm`. Run SQLite inside a dedicated module Web Worker with your own typed message protocol, not deprecated Worker1/Promiser APIs. No backend, no accounts, no telemetry. Keep dependencies minimal. Prefer small files (~150 lines max where practical).

## Build the complete user journey
1. Start on a polished responsive workspace with schema builder, SQL editor, result table, and plan inspector.
2. Create a `users` table with editable columns and types; validate/quote SQL identifiers safely.
3. Generate 100–10,000 synthetic users with deterministic generators and batched transaction inserts. Show progress and errors.
4. Run real SQLite SQL and display limited results, elapsed wall time, row count/truncation, and errors.
5. Show actual `EXPLAIN QUERY PLAN` output, including a clickable parent-child tree when possible; preserve raw detail strings.
6. Create an index on email; rerun and compare the before/after plans and timings. Do not guarantee a specific planner choice.
7. Include one guided example and a clear reset action.

## Correctness and safety
Never fabricate plans, costs, timings, or rows. SQLite's `EXPLAIN QUERY PLAN` does not provide PostgreSQL-style per-node timing or cost. Measure elapsed query time separately and label it. Cap row rendering, seeding size, and query resource use. Ensure long-running work can be stopped via worker termination/reinitialization; warn that this clears the in-memory DB. Do not execute SQL on a server. Never transmit user data. Keep SQL values parameterized and user identifiers quoted.

## Engineering and delivery
- Start by showing the proposed file tree and concise 4-hour task plan, then implement immediately.
- Use clean engine interfaces so PostgreSQL can be added later, but do not overengineer an unused second adapter.
- Write tests for schema validation, seeding, explain parsing, and one browser end-to-end path where practical.
- Run pnpm typecheck, tests, and build; fix failures. Report any commands not run.
- Add README with setup, architecture, limitations, and deployment instructions.
- Update roadmap checkboxes truthfully.
- End with a concise summary of implemented features, files changed, commands run, limitations, and recommended next feature.

The app must feel like a real developer tool, not a marketing landing page. Prioritize functional interaction, correctness, and legibility over decorative complexity.
