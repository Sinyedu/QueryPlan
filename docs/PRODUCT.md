# QueryPlan — Product Brief

## Vision
An interactive database lab where developers and learners create schemas, generate synthetic data, run real SQL, and understand query planning.

## Audience
Students, junior developers, full-stack engineers, and people learning database performance.

## MVP journey
1. Open a public URL; no signup.
2. Create `users(id INTEGER PRIMARY KEY, name TEXT, email TEXT, created_at TEXT)` or customize columns.
3. Choose generators and row count (100–10,000).
4. Seed with a progress indicator.
5. Run SQL and inspect limited results, execution time, and errors.
6. Inspect actual SQLite `EXPLAIN QUERY PLAN` output.
7. Add an index and compare plans, noting that planner behavior may vary.

## UX principles
- Workspace: schema sidebar, editor/results center, plan inspector on right (stacked on mobile).
- Explain terms without obscuring raw engine output.
- Always show engine name/version and whether a database is in-memory or persisted.
- Show empty, loading, failure, and canceled states.
- Clear reset database action with confirmation.

## Non-goals for first 4 hours
PostgreSQL execution, user accounts, collaboration, production benchmarking, CSV import, sharing, multiple concurrent databases, persistent storage, advanced joins graph, arbitrary cross-engine SQL translation.

## Future features
Multi-table relationships, realistic distributions, snapshots/export, index playground, query challenges, engine comparisons, real PostgreSQL sandbox with strict isolation and quotas.
