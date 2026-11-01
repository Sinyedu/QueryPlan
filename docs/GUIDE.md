# QueryPlan — Guide: using and testing the site

QueryPlan is a SQL lab that runs **entirely in your browser**. You design tables, generate fake data, run real SQLite queries and look at the real query plan SQLite chose. Nothing is sent anywhere; refreshing the page empties the database.

## 1. Start it

```bash
pnpm install          # once
pnpm dev              # open http://localhost:5173
```

To try the production build instead: `pnpm build && pnpm preview` (open the URL it prints).

> **If the page looks unstyled or says `Starting SQLite…` forever:** a stale dev server. Stop it (Ctrl+C), run `pnpm install`, delete `apps/web/node_modules/.vite`, and start again. Use Chrome or Edge for the most reliable experience (it is the only browser tested so far).

The badge at the top shows the engine, e.g. `SQLite 3.54.1 · WASM · in-memory (cleared on refresh)`. If it says `Starting SQLite…`, the engine has not loaded yet.

## 2. The screen at a glance

| Area | What it is |
| --- | --- |
| **Header** | Engine badge · **▶ Guided example** · **Reset database** (asks for confirmation) |
| **Left column** | 1 · Table schema · 2 · Seed data · Database (what really exists) · Experiments |
| **Middle** | SQL editor · Results |
| **Right** | Query plan · 3 · Index experiment |

On a phone the columns stack vertically.

## 3. Quick tour (2 minutes): the Guided example

1. Press **▶ Guided example**. It creates `users`, seeds 5,000 rows and runs an email lookup.
2. In **Query plan** you should see **`SCAN users`** (amber badge): SQLite reads every row.
3. In **3 · Index experiment** leave `users` / `email` selected and press **Create index & compare**.
4. The plan panel now shows **Before index** and **After index on users(email)**. The second one should say **`SEARCH users USING INDEX idx_users_email (email=?)`** (green badge), and the measured time should drop.
5. Click a plan step for a plain-language note. Try the **Graph** toggle for the same plan as a diagram.

SQLite decides the plan, so the exact wording can vary by version. The app never guarantees that an index will be used.

## 4. Using each feature

### Build a schema (panel 1)
- **Tabs** are tables (up to 6). **+ table** adds one, **✕** next to the name removes it.
- Each column has a **name**, **type**, **generator** (what fake data fills it) and a **PK** checkbox (only one, and only INTEGER).
- **foreignKey generator:** pick a parent in the *references* dropdown. A foreign key can only point at another table's integer primary key that uses the `sequence` generator.
- **distribution:** `uniform` spreads values evenly; `skewed` makes a few values very common (try it on a foreign key or `word` column, since it changes how useful an index is).
- Names must be letters, digits and underscores, not starting with a digit. Problems are listed in amber under the form, and **Create tables** stays disabled until the schema is valid.
- **Create tables** builds them in the right order (parents first). If tables already exist it becomes **Drop & recreate tables**.

### Seed data (panel 2)
- Set a **row count per table** (100 to 10,000 each, 30,000 in total) and a **Seed** number. The same seed always produces the same data.
- **Seed all tables** fills parents before children and shows a progress bar and a message like `Inserted 12,000 rows in 89 ms (measured), seed 42.`
- Seeding **replaces** existing rows in those tables. **Stop (clears DB)** appears while seeding; it terminates the worker and empties the database (it asks first).

### Run SQL
- Type SQL in the editor; **Ctrl/⌘ + Enter** or **Run & explain**. Several statements at once are allowed.
- **Results** show at most 200 rows. The header says the real row count, e.g. `10,000 rows (showing first 200)`, plus the measured time.
- Errors appear in red. Typos such as `CRE` or `SELEC` give a SQLite error and the app keeps working.
- Plans are shown for SELECT / INSERT / UPDATE / DELETE. For `CREATE TABLE` and similar you get a note instead.
- Queries over 10 seconds are interrupted and your data survives. If the worker stops responding, **Stop (clears DB)** (or the automatic watchdog) restarts it, which **empties the database**.

### Read the plan
- Steps are shown as an indented list (**List**) or a diagram (**Graph**).
- Badges: `SCAN` full read · `INDEX` / `KEY` / `COVERING` lookups · `TEMP` temporary sort/group.
- The blue **"Reading this plan"** box explains joins (nested loops), full scans inside a loop and automatic indexes, using only what SQLite printed.
- SQLite gives **no costs and no per-step timings**. The time shown is separately measured wall-clock time.

### Index experiment (panel 3)
- Pick a **table**, a **column** and optionally a second column, choose **samples** (3/5/10/20), then **Create index & compare**.
- It benchmarks your editor query, creates the index, benchmarks again and shows both plans. Needs a **single SELECT or WITH query** that only reads.
- **drop** removes an index so you can repeat the experiment.
- Open **Benchmark methodology** for exactly how the timing is measured.

### Experiments (save, export, share)
An experiment is the schema, row counts, seed and SQL. It holds **no row data**; data is regenerated from the seed.
- **Save** stores it in this browser. **load** fills the editors only; **run** creates, seeds and runs it.
- **Export** downloads a JSON file; **Import…** reads one.
- **Copy share link** copies a URL ending in `#exp=…`. Opening it fills the editors and shows a notice; **nothing runs automatically.**
- Built-in **Examples** include a join example (users + orders).
- Imported or shared SQL is arbitrary SQL for your own in-memory database: read it before pressing Run.

## 5. Automated checks

```bash
pnpm lint
pnpm typecheck
pnpm test                 # 154 unit + real-SQLite integration tests
pnpm build
pnpm --filter web e2e     # real browser test (needs Chrome or Edge installed)
```

If the browser test fails and you want to see why: `E2E_SCREENSHOT=fail.png pnpm --filter web e2e` saves a screenshot of the failing page.

## 6. Manual test checklist

Tick these off in a fresh page (refresh first). **Expected** is what you should see.

### A. Intended use
| # | Do | Expected |
| --- | --- | --- |
| A1 | Open the site | Badge shows a SQLite version; Database panel says `Empty. No tables yet.` |
| A2 | **Create tables**, then **Seed all tables** with 1,000 rows | Progress bar, then `Inserted 1,000 rows …`; Database panel lists `users · 1,000 rows` |
| A3 | Run `SELECT * FROM users WHERE email = 'nobody@example.com'` | 0 rows, a time in ms, plan `SCAN users` |
| A4 | **Create index & compare** (users/email) | Before shows `SCAN`, After shows `SEARCH … USING INDEX idx_users_email` |
| A5 | Same seed twice: seed, note a row with `SELECT * FROM users WHERE id = 5`, seed again | Identical row. Change the seed number and seed again: different data |
| A6 | Press **▶ Guided example** | Ends with a `SCAN` plan on a one-row result |
| A7 | **Run** the *Join: orders by user* example | `Inserted 12,000 rows`; sidebar shows `user_id INTEGER → users.id`; plan lists `SEARCH u USING INTEGER PRIMARY KEY` and `SCAN o`; "Reading this plan" mentions a full scan inside a loop |
| A8 | Index experiment on `orders` / `user_id` | After shows `SEARCH o USING INDEX idx_orders_user_id`; the scan hint disappears |
| A9 | Switch **List / Graph**; click a step | Graph renders; a note appears under the plan |
| A10 | Name an experiment, **Save**, refresh the page | It appears under "Saved in this browser" (data itself is gone) |
| A11 | **Export**, then **Import…** the file | Editors fill and a success message appears |
| A12 | **Copy share link**, open it in a new tab | Notice `Loaded shared experiment …`; no rows inserted until you act |
| A13 | **Reset database** and confirm | Database panel empty again |

### B. Mistakes and misspellings
| # | Do | Expected |
| --- | --- | --- |
| B1 | Run `CRE`, `SELEC * FROM users`, `SELECT * FORM users` | Red SQLite error each time; the next valid query works |
| B2 | Run `SELECT * FROM does_not_exist` | `no such table` error |
| B3 | Run an empty editor | `Enter a SQL statement to run.` |
| B4 | In the schema form, name a table `my table`, `1abc`, or leave it empty | Amber message; Create is disabled |
| B5 | Name two columns `id` and `ID` | `Duplicate column` message |
| B6 | Make a foreignKey with no parent chosen, or point two tables at each other | `Choose the parent…` / cycle message |
| B7 | Set a row count of `5` or `999999` and leave the field | Value snaps to 100 / 10,000 |
| B8 | Total rows over 30,000 across tables | Amber warning; Seed is disabled |
| B9 | Create an index that already exists | Button disabled with an explanation |

### C. Trying to break it
| # | Do | Expected |
| --- | --- | --- |
| C1 | Run `SELECT '<img src=x onerror=alert(1)>'` | The text appears in the cell; no alert, no image |
| C2 | Run `ATTACH DATABASE 'x.db' AS y` | `not authorized` |
| C3 | Run `PRAGMA max_page_count = 2000000000` | `not authorized` |
| C4 | Run `SELECT zeroblob(2000000000)` | `string or blob too big` error |
| C5 | Run `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c` | After about 10 s: `Stopped: exceeded the 10000 ms time budget` and your data is intact. (Pressing **Stop (clears DB)** during it also works but empties the database.) |
| C6 | Run `SELECT 1; SELECT 2` | Both statements run (your SQL executes as typed, including anything destructive; it is your own database). Only the *plan* step is limited to the first statement; that guarantee is covered by automated tests, not by a manual step |
| C7 | Put `WITH x AS (SELECT 1) DELETE FROM users` in the editor and press **Create index & compare** | A "read-only" refusal; the row count is unchanged |
| C8 | Run `CREATE TABLE "my table" (a INTEGER)` | Table shows in the sidebar, no error; the index experiment is disabled for it |
| C9 | Import a JSON file with a table name like `a"; DROP TABLE x; --` | `Import rejected: …` |
| C10 | Open a corrupted link such as `…/#exp=abc` | `Share link rejected: …`; app still works |
| C11 | Import a file whose experiment name is `<img src=x onerror=alert(1)>`, then **Save** | Shown as plain text in the list; nothing executes |
| C12 | Hammer the buttons while seeding or running (double-click Run) | Controls disable while busy; no crashes |

### D. Layout and browsers
| # | Do | Expected |
| --- | --- | --- |
| D1 | Narrow the window to phone width (about 390 px) | Panels stack; no horizontal page scroll |
| D2 | Open the site in Firefox and Safari | **Not yet tested.** Note anything broken |
| D3 | Open DevTools → Console during A1–A13 | No red errors |

## 7. Known limits
- The database is in memory only; refresh or **Reset** clears it. Saved experiments keep definitions, not data.
- SQLite plans have no costs or per-step times. Timings are coarse (browser timers) and vary run to run; compare medians, not single runs.
- Planner choices depend on the SQLite version and the data, so an index might not be used.
- Foreign keys: up to 6 tables, integer primary-key targets only, no composite keys or ON DELETE actions.
- Details and the safety model: `docs/SECURITY.md`, `docs/ROADMAP.md`.

## 8. Reporting a problem
Note the exact SQL or steps, what you expected, what happened, your browser and version, and any red console messages. Run `E2E_SCREENSHOT=fail.png pnpm --filter web e2e` if the automated test is the thing failing.
