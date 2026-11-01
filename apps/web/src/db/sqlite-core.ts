/**
 * SQLite logic independent of Worker plumbing, so it can be exercised in Node tests.
 * Uses an in-memory database; nothing persists across reloads or worker restarts.
 */
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { buildCreateTable, buildInsert, orderTables, quoteIdentifier, validateSchema, type TableDef } from '../domain/schema';
import { isBenchmarkable } from '../domain/benchmark';
import { MAX_TOTAL_ROWS, clampedCounts, generateBatches, tableSeed } from '../domain/seeding';
import type { RawPlanRow } from '../domain/explain';
import type {
  Cell, EngineInfo, ExecuteOptions, ExecuteResult, ExplainResult, SchemaInfo, SeedRequest, SeedResult, TableInfo,
} from './protocol';

const MAX_CELL_CHARS = 2_000;
/** Memory budget: 16384 pages * 4 KiB = 64 MiB of database. */
const MAX_PAGES = 16_384;
const PROGRESS_OPS = 2_000;

export class SqliteCoreError extends Error {
  constructor(message: string, readonly kind: 'sql' | 'validation' | 'timeout', readonly code?: number) {
    super(message);
  }
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return `<BLOB ${v.byteLength} bytes>`;
  const s = String(v);
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}… (+${s.length - MAX_CELL_CHARS} chars)` : s;
}

export class SqliteSession {
  private readonly db: Database;
  private deadline = Infinity;
  private interrupted = false;

  constructor(private readonly sqlite3: Sqlite3Static) {
    this.db = new sqlite3.oo1.DB(':memory:', 'c');
    this.db.exec(`PRAGMA max_page_count = ${MAX_PAGES}`);
    this.db.exec('PRAGMA foreign_keys = ON'); // declared foreign keys are really enforced
    // Cooperative time budget: returning non-zero makes SQLite abort the running statement.
    sqlite3.capi.sqlite3_progress_handler(
      this.db.pointer!,
      PROGRESS_OPS,
      () => {
        if (performance.now() > this.deadline) {
          this.interrupted = true;
          return 1;
        }
        return 0;
      },
      0,
    );
  }

  info(): EngineInfo {
    return { engine: 'sqlite', version: this.sqlite3.version.libVersion, storage: 'in-memory' };
  }

  /** Runs `fn` under a time budget and converts SQLite errors into SqliteCoreError. */
  private guarded<T>(timeoutMs: number, fn: () => T): T {
    this.interrupted = false;
    this.deadline = performance.now() + timeoutMs;
    try {
      return fn();
    } catch (e) {
      if (this.interrupted) {
        throw new SqliteCoreError(`Stopped: exceeded the ${timeoutMs} ms time budget. The in-memory database is intact.`, 'timeout');
      }
      if (e instanceof SqliteCoreError) throw e;
      const err = e as { message?: string; resultCode?: number };
      throw new SqliteCoreError(err.message ?? String(e), 'sql', err.resultCode);
    } finally {
      this.deadline = Infinity;
    }
  }

  execute(sql: string, { maxRows, timeoutMs, repeat = 1 }: ExecuteOptions): ExecuteResult {
    if (sql.trim() === '') throw new SqliteCoreError('Enter a SQL statement to run.', 'validation');
    if (repeat > 1 && !isBenchmarkable(sql)) throw new SqliteCoreError('Only a single SELECT/WITH statement can be repeated.', 'validation');
    const columns: string[] = [];
    const rows: Cell[][] = [];
    let totalRows = 0;
    const start = performance.now();
    this.guarded(timeoutMs, () => {
      for (let rep = 0; rep < repeat; rep++) {
        this.db.exec({
          sql,
          rowMode: 'array',
          columnNames: columns,
          callback: (row: unknown) => {
            if (rep > 0) return; // rows are collected on the first pass only
            totalRows++;
            if (rows.length < maxRows) rows.push((row as unknown[]).map(toCell));
          },
        });
      }
    });
    const elapsedMs = (performance.now() - start) / repeat;
    return {
      columns, rows, totalRows, truncated: totalRows > rows.length,
      rowsAffected: columns.length === 0 ? this.db.changes() : null,
      elapsedMs,
    };
  }

  explain(sql: string, timeoutMs = 5_000): ExplainResult {
    const stmt = sql.trim().replace(/;+\s*$/, '');
    if (stmt === '') throw new SqliteCoreError('Enter a SQL statement to explain.', 'validation');
    if (/^explain\b/i.test(stmt)) throw new SqliteCoreError('Remove EXPLAIN from the query; QueryPlan adds it for you.', 'validation');
    const rows = this.guarded(timeoutMs, () =>
      this.db.exec({ sql: `EXPLAIN QUERY PLAN ${stmt}`, rowMode: 'object', returnValue: 'resultRows' }),
    ) as unknown as RawPlanRow[];
    return { rows: rows.map((r) => ({ id: Number(r.id), parent: Number(r.parent), notused: Number(r.notused), detail: String(r.detail) })) };
  }

  private checkedOrder(tables: readonly TableDef[]): TableDef[] {
    const issues = validateSchema(tables);
    if (issues.length) throw new SqliteCoreError(issues[0]!.message, 'validation');
    return orderTables(tables)!;
  }

  createSchema(tables: TableDef[], replace: boolean): void {
    const ordered = this.checkedOrder(tables);
    this.guarded(5_000, () => {
      if (replace) {
        // Dropping a parent while children still hold rows would trip enforcement, so drop children first with FKs off.
        this.db.exec('PRAGMA foreign_keys = OFF');
        try {
          for (const t of [...ordered].reverse()) this.db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(t.name)}`);
        } finally {
          this.db.exec('PRAGMA foreign_keys = ON');
        }
      }
      for (const t of ordered) this.db.exec(buildCreateTable(t));
    });
  }

  /**
   * Replaces the rows of every listed table with deterministic synthetic rows, inserted in batches inside ONE
   * transaction: children are emptied first, parents are filled first, so enforced foreign keys always hold.
   */
  seed({ tables, seed }: SeedRequest, onProgress: (done: number, total: number) => void): SeedResult {
    const ordered = this.checkedOrder(tables.map((t) => t.table));
    const counts = clampedCounts(tables);
    const total = Object.values(counts).reduce((x, y) => x + y, 0);
    if (total > MAX_TOTAL_ROWS) {
      throw new SqliteCoreError(`At most ${MAX_TOTAL_ROWS.toLocaleString()} rows across all tables (requested ${total.toLocaleString()}).`, 'validation');
    }
    const start = performance.now();
    this.guarded(60_000, () => {
      this.db.exec('BEGIN');
      try {
        for (const t of [...ordered].reverse()) this.db.exec(`DELETE FROM ${quoteIdentifier(t.name)}`);
        let done = 0;
        for (const t of ordered) {
          const stmt = this.db.prepare(buildInsert(t));
          try {
            for (const batch of generateBatches(t, counts[t.name]!, tableSeed(seed, t.name), counts)) {
              for (const row of batch) stmt.bind(row).stepReset();
              done += batch.length;
              onProgress(done, total);
            }
          } finally {
            stmt.finalize();
          }
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    });
    return { rowsInserted: total, perTable: counts, elapsedMs: performance.now() - start };
  }

  introspect(): SchemaInfo {
    const names = this.db.selectValues(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) as string[];
    const tables: TableInfo[] = names.map((name) => {
      const q = quoteIdentifier(name);
      const cols = this.db.exec({ sql: `PRAGMA table_info(${q})`, rowMode: 'object', returnValue: 'resultRows' }) as unknown as Record<string, unknown>[];
      const idx = this.db.exec({ sql: `PRAGMA index_list(${q})`, rowMode: 'object', returnValue: 'resultRows' }) as unknown as Record<string, unknown>[];
      const fks = this.db.exec({ sql: `PRAGMA foreign_key_list(${q})`, rowMode: 'object', returnValue: 'resultRows' }) as unknown as Record<string, unknown>[];
      return {
        name,
        foreignKeys: fks.map((f) => ({ from: String(f.from), table: String(f.table), to: String(f.to) })),
        columns: cols.map((c) => ({ name: String(c.name), type: String(c.type), primaryKey: Number(c.pk) > 0 })),
        rowCount: Number(this.db.selectValue(`SELECT count(*) FROM ${q}`)),
        indexes: idx
          .filter((i) => i.origin === 'c')
          .map((i) => ({
            name: String(i.name),
            unique: Number(i.unique) === 1,
            columns: (this.db.selectValues(`SELECT name FROM pragma_index_info(?)`, [String(i.name)]) as string[]),
          })),
      };
    });
    return { tables };
  }

  close(): void {
    this.db.close();
  }
}
